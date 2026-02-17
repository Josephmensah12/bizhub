/**
 * AssetUnit Controller
 *
 * CRUD operations for individual serialized units within a product (Asset).
 */

const { Asset, AssetUnit, ConditionStatus, sequelize } = require('../models');
const { Op } = require('sequelize');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/assets/:assetId/units
 * List all units for a product
 */
exports.list = asyncHandler(async (req, res) => {
  const { assetId } = req.params;
  const { status, condition_status_id, search, page = 1, limit = 50 } = req.query;

  const asset = await Asset.findByPk(assetId);
  if (!asset) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' }
    });
  }

  const where = { asset_id: assetId };
  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { [Op.in]: statuses };
  }
  if (condition_status_id) {
    where.condition_status_id = condition_status_id;
  }
  if (search) {
    where[Op.or] = [
      { serial_number: { [Op.iLike]: `%${search}%` } },
      { cpu: { [Op.iLike]: `%${search}%` } },
      { notes: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await AssetUnit.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['created_at', 'DESC']],
    include: [
      { model: ConditionStatus, as: 'conditionStatus', attributes: ['id', 'name', 'color'] }
    ]
  });

  // Add effective price/cost (unit-level override or product fallback)
  const productPrice = parseFloat(asset.price_amount) || 0;
  const productCost = parseFloat(asset.cost_amount) || 0;

  const units = rows.map(u => {
    const data = u.toJSON();
    data.effective_price = data.price_amount !== null ? data.price_amount : productPrice;
    data.effective_cost = data.cost_amount !== null ? data.cost_amount : productCost;
    return data;
  });

  res.json({
    success: true,
    data: {
      units,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    }
  });
});

/**
 * POST /api/v1/assets/:assetId/units
 * Add a single unit to a serialized product
 */
exports.create = asyncHandler(async (req, res) => {
  const { assetId } = req.params;

  const asset = await Asset.findByPk(assetId);
  if (!asset) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' }
    });
  }

  if (!asset.is_serialized) {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_SERIALIZED', message: 'This product is not serialized. Enable is_serialized first.' }
    });
  }

  const { serial_number, cpu, cpu_model, memory, storage, cost_amount, price_amount, condition_status_id, purchase_date, notes } = req.body;

  if (!serial_number || serial_number.trim() === '') {
    return res.status(400).json({
      success: false,
      error: { code: 'SERIAL_REQUIRED', message: 'Serial number is required' }
    });
  }

  // Check uniqueness
  const existing = await AssetUnit.findOne({ where: { serial_number: serial_number.trim() } });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_SERIAL', message: `Serial number "${serial_number.trim()}" already exists` }
    });
  }

  const unit = await AssetUnit.create({
    asset_id: parseInt(assetId),
    serial_number: serial_number.trim(),
    cpu: cpu || null,
    cpu_model: cpu_model || null,
    memory: memory ? parseInt(memory) : null,
    storage: storage ? parseInt(storage) : null,
    cost_amount: cost_amount !== undefined && cost_amount !== null && cost_amount !== '' ? parseFloat(cost_amount) : null,
    price_amount: price_amount !== undefined && price_amount !== null && price_amount !== '' ? parseFloat(price_amount) : null,
    condition_status_id: condition_status_id || asset.condition_status_id || null,
    purchase_date: purchase_date || null,
    notes: notes || null
  });

  // Reload with condition
  await unit.reload({
    include: [{ model: ConditionStatus, as: 'conditionStatus', attributes: ['id', 'name', 'color'] }]
  });

  res.status(201).json({
    success: true,
    data: { unit },
    message: 'Unit added successfully'
  });
});

/**
 * POST /api/v1/assets/:assetId/units/bulk
 * Bulk add units to a serialized product
 */
exports.bulkCreate = asyncHandler(async (req, res) => {
  const { assetId } = req.params;

  const asset = await Asset.findByPk(assetId);
  if (!asset) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' }
    });
  }

  if (!asset.is_serialized) {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_SERIALIZED', message: 'This product is not serialized. Enable is_serialized first.' }
    });
  }

  const { units } = req.body;
  if (!Array.isArray(units) || units.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'units must be a non-empty array' }
    });
  }

  // Get existing serial numbers to skip duplicates
  const serialNumbers = units.map(u => (u.serial_number || '').trim()).filter(Boolean);
  const existingSerials = await AssetUnit.findAll({
    where: { serial_number: { [Op.in]: serialNumbers } },
    attributes: ['serial_number'],
    raw: true
  });
  const existingSet = new Set(existingSerials.map(e => e.serial_number));

  let created = 0;
  let skipped = 0;
  const errors = [];
  const seenInBatch = new Set();

  const toCreate = [];
  for (const u of units) {
    const sn = (u.serial_number || '').trim();
    if (!sn) {
      errors.push({ serial_number: u.serial_number, reason: 'Serial number is required' });
      continue;
    }
    if (existingSet.has(sn) || seenInBatch.has(sn)) {
      skipped++;
      continue;
    }
    seenInBatch.add(sn);
    toCreate.push({
      asset_id: parseInt(assetId),
      serial_number: sn,
      cpu: u.cpu || null,
      cpu_model: u.cpu_model || null,
      memory: u.memory ? parseInt(u.memory) : null,
      storage: u.storage ? parseInt(u.storage) : null,
      cost_amount: u.cost_amount !== undefined && u.cost_amount !== null && u.cost_amount !== '' ? parseFloat(u.cost_amount) : null,
      price_amount: u.price_amount !== undefined && u.price_amount !== null && u.price_amount !== '' ? parseFloat(u.price_amount) : null,
      condition_status_id: u.condition_status_id || asset.condition_status_id || null,
      purchase_date: u.purchase_date || null,
      notes: u.notes || null
    });
  }

  if (toCreate.length > 0) {
    await AssetUnit.bulkCreate(toCreate);
    created = toCreate.length;
  }

  res.status(201).json({
    success: true,
    data: { created, skipped, errors },
    message: `${created} unit(s) created, ${skipped} skipped`
  });
});

/**
 * PUT /api/v1/assets/:assetId/units/:unitId
 * Update a unit
 */
exports.update = asyncHandler(async (req, res) => {
  const { assetId, unitId } = req.params;

  const unit = await AssetUnit.findOne({
    where: { id: unitId, asset_id: assetId },
    include: [{ model: ConditionStatus, as: 'conditionStatus', attributes: ['id', 'name', 'color'] }]
  });

  if (!unit) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Unit not found' }
    });
  }

  const { serial_number, cpu, cpu_model, memory, storage, cost_amount, price_amount, condition_status_id, status, purchase_date, notes } = req.body;

  // If changing serial number, check uniqueness
  if (serial_number !== undefined && serial_number.trim() !== unit.serial_number) {
    const existing = await AssetUnit.findOne({
      where: { serial_number: serial_number.trim(), id: { [Op.ne]: unit.id } }
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_SERIAL', message: `Serial number "${serial_number.trim()}" already exists` }
      });
    }
    unit.serial_number = serial_number.trim();
  }

  if (cpu !== undefined) unit.cpu = cpu || null;
  if (cpu_model !== undefined) unit.cpu_model = cpu_model || null;
  if (memory !== undefined) unit.memory = memory ? parseInt(memory) : null;
  if (storage !== undefined) unit.storage = storage ? parseInt(storage) : null;
  if (cost_amount !== undefined) unit.cost_amount = cost_amount !== null && cost_amount !== '' ? parseFloat(cost_amount) : null;
  if (price_amount !== undefined) unit.price_amount = price_amount !== null && price_amount !== '' ? parseFloat(price_amount) : null;
  if (condition_status_id !== undefined) unit.condition_status_id = condition_status_id || null;
  if (status !== undefined) unit.status = status;
  if (purchase_date !== undefined) unit.purchase_date = purchase_date || null;
  if (notes !== undefined) unit.notes = notes || null;

  await unit.save();
  await unit.reload({
    include: [{ model: ConditionStatus, as: 'conditionStatus', attributes: ['id', 'name', 'color'] }]
  });

  res.json({
    success: true,
    data: { unit },
    message: 'Unit updated successfully'
  });
});

/**
 * DELETE /api/v1/assets/:assetId/units/:unitId
 * Delete a unit (only if Available)
 */
exports.remove = asyncHandler(async (req, res) => {
  const { assetId, unitId } = req.params;

  const unit = await AssetUnit.findOne({
    where: { id: unitId, asset_id: assetId }
  });

  if (!unit) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Unit not found' }
    });
  }

  if (['Sold', 'Reserved'].includes(unit.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'CANNOT_DELETE', message: `Cannot delete unit with status "${unit.status}". Only Available units can be deleted.` }
    });
  }

  await unit.destroy();

  res.json({
    success: true,
    message: 'Unit deleted successfully'
  });
});

/**
 * GET /api/v1/assets/:assetId/units/summary
 * Unit count summary by status
 */
exports.summary = asyncHandler(async (req, res) => {
  const { assetId } = req.params;

  const asset = await Asset.findByPk(assetId);
  if (!asset) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' }
    });
  }

  const counts = await AssetUnit.findAll({
    where: { asset_id: assetId },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const summary = {
    total: 0,
    available: 0,
    reserved: 0,
    sold: 0,
    in_repair: 0,
    scrapped: 0
  };

  for (const row of counts) {
    const count = parseInt(row.count);
    summary.total += count;
    switch (row.status) {
      case 'Available': summary.available = count; break;
      case 'Reserved': summary.reserved = count; break;
      case 'Sold': summary.sold = count; break;
      case 'In Repair': summary.in_repair = count; break;
      case 'Scrapped': summary.scrapped = count; break;
    }
  }

  res.json({
    success: true,
    data: summary
  });
});

module.exports = exports;
