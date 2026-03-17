/**
 * Write-Off Controller
 *
 * Inventory write-off management with approval workflow
 */

const { Asset, AssetUnit, User, InventoryWriteOff, ActivityLog, sequelize } = require('../models');
const { Op } = require('sequelize');

// Async handler wrapper
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * Standard include set for write-off queries
 */
function writeOffIncludes() {
  return [
    {
      model: Asset,
      as: 'asset',
      attributes: ['id', 'asset_tag', 'make', 'model', 'is_serialized', 'quantity', 'cost_amount', 'cost_currency', 'price_currency']
    },
    {
      model: AssetUnit,
      as: 'assetUnit',
      attributes: ['id', 'serial_number', 'cost_amount', 'condition_status_id', 'status'],
      required: false
    },
    {
      model: User,
      as: 'creator',
      attributes: ['id', 'full_name']
    },
    {
      model: User,
      as: 'approver',
      attributes: ['id', 'full_name'],
      required: false
    },
    {
      model: User,
      as: 'rejector',
      attributes: ['id', 'full_name'],
      required: false
    },
    {
      model: User,
      as: 'reverser',
      attributes: ['id', 'full_name'],
      required: false
    }
  ];
}

/**
 * Generate a unique write-off number: WO-YYYY-000001
 */
async function generateWriteOffNumber(offset = 0) {
  const year = new Date().getFullYear();
  const lastWo = await InventoryWriteOff.findOne({
    where: {
      write_off_number: { [Op.like]: `WO-${year}-%` }
    },
    order: [['write_off_number', 'DESC']]
  });

  let seq = 1;
  if (lastWo) {
    const parts = lastWo.write_off_number.split('-');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `WO-${year}-${String(seq + offset).padStart(6, '0')}`;
}

/**
 * Restore inventory for a write-off (used by reject and reverse)
 */
async function restoreInventory(writeOff, t) {
  const asset = await Asset.findByPk(writeOff.asset_id, { transaction: t });

  if (asset.is_serialized && writeOff.asset_unit_id) {
    const unit = await AssetUnit.findByPk(writeOff.asset_unit_id, { transaction: t });
    if (unit) {
      unit.status = 'Available';
      await unit.save({ transaction: t });
    }
  } else {
    asset.quantity = (parseInt(asset.quantity, 10) || 0) + writeOff.quantity;
    await asset.save({ transaction: t });
  }

  await asset.updateComputedStatus(t);
}

/**
 * GET /api/v1/write-offs
 * List write-offs with filters, pagination, and summary stats
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    dateFrom, dateTo, reason, status, assetId,
    page = 1, limit = 50, sortBy = 'created_at', sortDir = 'DESC'
  } = req.query;

  const where = {};

  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) where.created_at[Op.gte] = new Date(dateFrom);
    if (dateTo) where.created_at[Op.lte] = new Date(dateTo + 'T23:59:59.999Z');
  }
  if (reason) where.reason = reason;
  if (status) where.status = status;
  if (assetId) where.asset_id = assetId;

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const { rows, count } = await InventoryWriteOff.findAndCountAll({
    where,
    include: writeOffIncludes(),
    order: [[sortBy, sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']],
    limit: parseInt(limit, 10),
    offset
  });

  // Summary stats
  const allMatching = await InventoryWriteOff.findAll({
    where,
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalCount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_cost_amount')), 0), 'totalValue']
    ],
    raw: true
  });

  const byReason = await InventoryWriteOff.findAll({
    where,
    attributes: [
      'reason',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_cost_amount')), 0), 'value']
    ],
    group: ['reason'],
    raw: true
  });

  const byStatus = await InventoryWriteOff.findAll({
    where,
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_cost_amount')), 0), 'value']
    ],
    group: ['status'],
    raw: true
  });

  res.json({
    success: true,
    data: rows,
    meta: {
      total: count,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(count / parseInt(limit, 10))
    },
    summary: {
      totalCount: parseInt(allMatching[0]?.totalCount || 0, 10),
      totalValue: parseFloat(allMatching[0]?.totalValue || 0),
      byReason,
      byStatus
    }
  });
});

/**
 * GET /api/v1/write-offs/:id
 * Get single write-off with all associations
 */
exports.getById = asyncHandler(async (req, res) => {
  const writeOff = await InventoryWriteOff.findByPk(req.params.id, {
    include: writeOffIncludes()
  });

  if (!writeOff) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Write-off not found' }
    });
  }

  res.json({ success: true, data: writeOff });
});

/**
 * POST /api/v1/write-offs
 * Create a new inventory write-off
 */
exports.create = asyncHandler(async (req, res) => {
  const { asset_id, asset_unit_id, reason, reason_detail, quantity = 1 } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  if (!asset_id || !reason) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'asset_id and reason are required' }
    });
  }

  const t = await sequelize.transaction();

  try {
    const asset = await Asset.findByPk(asset_id, { transaction: t });

    if (!asset || asset.deleted_at) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Asset not found or deleted' }
      });
    }

    let unitCost = parseFloat(asset.cost_amount) || 0;
    let unit = null;

    if (asset.is_serialized) {
      // Serialized: require asset_unit_id
      if (!asset_unit_id) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'asset_unit_id is required for serialized assets' }
        });
      }

      unit = await AssetUnit.findOne({
        where: { id: asset_unit_id, asset_id: asset.id },
        transaction: t
      });

      if (!unit) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Asset unit not found' }
        });
      }

      if (unit.status === 'Sold') {
        await t.rollback();
        return res.status(409).json({
          success: false,
          error: { code: 'UNIT_NOT_AVAILABLE', message: 'Sold units cannot be written off' }
        });
      }

      unitCost = parseFloat(unit.cost_amount) || unitCost;

      // Deduct inventory immediately: set unit to Scrapped
      unit.status = 'Scrapped';
      await unit.save({ transaction: t });
    } else {
      // Non-serialized: validate quantity
      const currentQty = parseInt(asset.quantity, 10) || 0;
      if (quantity > currentQty) {
        await t.rollback();
        return res.status(409).json({
          success: false,
          error: { code: 'INSUFFICIENT_QUANTITY', message: `Only ${currentQty} available, cannot write off ${quantity}` }
        });
      }

      // Deduct inventory immediately
      asset.quantity = currentQty - quantity;
      await asset.save({ transaction: t });
    }

    const totalCost = parseFloat((quantity * unitCost).toFixed(2));

    // Auto-approve for Admin/Manager
    const autoApprove = ['Admin', 'Manager'].includes(userRole);

    const writeOffNumber = await generateWriteOffNumber();

    const writeOff = await InventoryWriteOff.create({
      write_off_number: writeOffNumber,
      asset_id,
      asset_unit_id: asset_unit_id || null,
      reason,
      reason_detail: reason_detail || null,
      quantity,
      unit_cost_amount: unitCost,
      total_cost_amount: totalCost,
      currency: asset.cost_currency || asset.price_currency || 'GHS',
      status: autoApprove ? 'APPROVED' : 'PENDING',
      created_by: userId,
      approved_by: autoApprove ? userId : null,
      approved_at: autoApprove ? new Date() : null
    }, { transaction: t });

    // Update asset computed status
    await asset.updateComputedStatus(t);

    await t.commit();

    // Log activity
    await ActivityLog.log({
      actorUserId: userId,
      actionType: 'WRITE_OFF_CREATED',
      entityType: 'WRITE_OFF',
      entityId: writeOff.id,
      summary: `Write-off ${writeOffNumber} created for ${asset.asset_tag || asset.make + ' ' + asset.model}${autoApprove ? ' (auto-approved)' : ''}`,
      metadata: {
        writeOffNumber,
        assetId: asset.id,
        assetTag: asset.asset_tag,
        reason,
        quantity,
        totalCost,
        status: autoApprove ? 'APPROVED' : 'PENDING'
      }
    });

    // Reload with associations
    const result = await InventoryWriteOff.findByPk(writeOff.id, {
      include: writeOffIncludes()
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

/**
 * POST /api/v1/write-offs/bulk
 * Bulk create write-offs from selected unit IDs
 */
exports.bulkCreate = asyncHandler(async (req, res) => {
  const { unit_ids, reason, reason_detail } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  if (!unit_ids || !Array.isArray(unit_ids) || unit_ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'unit_ids array is required' }
    });
  }
  if (!reason) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'reason is required' }
    });
  }

  const t = await sequelize.transaction();
  try {
    const units = await AssetUnit.findAll({
      where: { id: { [Op.in]: unit_ids } },
      include: [{ model: Asset, as: 'product' }],
      transaction: t
    });

    if (units.length === 0) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No matching units found' }
      });
    }

    const autoApprove = ['Admin', 'Manager'].includes(userRole);
    const created = [];

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const asset = unit.product;
      const unitCost = parseFloat(unit.cost_amount) || parseFloat(asset.cost_amount) || 0;
      const writeOffNumber = await generateWriteOffNumber(i);

      // Set unit to Scrapped if not already
      if (unit.status !== 'Scrapped') {
        unit.status = 'Scrapped';
        await unit.save({ transaction: t });
      }

      const writeOff = await InventoryWriteOff.create({
        write_off_number: writeOffNumber,
        asset_id: asset.id,
        asset_unit_id: unit.id,
        reason,
        reason_detail: reason_detail || null,
        quantity: 1,
        unit_cost_amount: unitCost,
        total_cost_amount: unitCost,
        currency: asset.cost_currency || asset.price_currency || 'GHS',
        status: autoApprove ? 'APPROVED' : 'PENDING',
        created_by: userId,
        approved_by: autoApprove ? userId : null,
        approved_at: autoApprove ? new Date() : null
      }, { transaction: t });

      created.push(writeOff);

      // Update asset computed status
      await asset.updateComputedStatus(t);
    }

    await t.commit();

    // Log activity for each
    for (const wo of created) {
      await ActivityLog.log({
        actorUserId: userId,
        actionType: 'WRITE_OFF_CREATED',
        entityType: 'WRITE_OFF',
        entityId: wo.id,
        summary: `Write-off ${wo.write_off_number} created (bulk)${autoApprove ? ' (auto-approved)' : ''}`,
        metadata: { writeOffNumber: wo.write_off_number, reason, bulk: true }
      });
    }

    res.status(201).json({
      success: true,
      data: { count: created.length, writeOffs: created }
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
});

/**
 * POST /api/v1/write-offs/:id/approve
 * Approve a pending write-off (Admin/Manager only)
 */
exports.approve = asyncHandler(async (req, res) => {
  const writeOff = await InventoryWriteOff.findByPk(req.params.id);

  if (!writeOff) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Write-off not found' }
    });
  }

  if (writeOff.status !== 'PENDING') {
    return res.status(409).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot approve a write-off with status ${writeOff.status}` }
    });
  }

  writeOff.status = 'APPROVED';
  writeOff.approved_by = req.user.id;
  writeOff.approved_at = new Date();
  await writeOff.save();

  await ActivityLog.log({
    actorUserId: req.user.id,
    actionType: 'WRITE_OFF_APPROVED',
    entityType: 'WRITE_OFF',
    entityId: writeOff.id,
    summary: `Write-off ${writeOff.write_off_number} approved`,
    metadata: {
      writeOffNumber: writeOff.write_off_number,
      assetId: writeOff.asset_id
    }
  });

  const result = await InventoryWriteOff.findByPk(writeOff.id, {
    include: writeOffIncludes()
  });

  res.json({ success: true, data: result });
});

/**
 * POST /api/v1/write-offs/:id/reject
 * Reject a pending write-off and restore inventory (Admin/Manager only)
 */
exports.reject = asyncHandler(async (req, res) => {
  const { rejection_reason } = req.body;

  const writeOff = await InventoryWriteOff.findByPk(req.params.id);

  if (!writeOff) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Write-off not found' }
    });
  }

  if (writeOff.status !== 'PENDING') {
    return res.status(409).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot reject a write-off with status ${writeOff.status}` }
    });
  }

  const t = await sequelize.transaction();

  try {
    writeOff.status = 'REJECTED';
    writeOff.rejected_by = req.user.id;
    writeOff.rejected_at = new Date();
    writeOff.rejection_reason = rejection_reason || null;
    await writeOff.save({ transaction: t });

    // Restore inventory
    await restoreInventory(writeOff, t);

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  await ActivityLog.log({
    actorUserId: req.user.id,
    actionType: 'WRITE_OFF_REJECTED',
    entityType: 'WRITE_OFF',
    entityId: writeOff.id,
    summary: `Write-off ${writeOff.write_off_number} rejected${rejection_reason ? ': ' + rejection_reason : ''}`,
    metadata: {
      writeOffNumber: writeOff.write_off_number,
      assetId: writeOff.asset_id,
      rejectionReason: rejection_reason
    }
  });

  const result = await InventoryWriteOff.findByPk(writeOff.id, {
    include: writeOffIncludes()
  });

  res.json({ success: true, data: result });
});

/**
 * POST /api/v1/write-offs/:id/reverse
 * Reverse an approved write-off and restore inventory (Admin only)
 */
exports.reverse = asyncHandler(async (req, res) => {
  const { reversal_reason } = req.body;

  const writeOff = await InventoryWriteOff.findByPk(req.params.id);

  if (!writeOff) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Write-off not found' }
    });
  }

  if (writeOff.status !== 'APPROVED') {
    return res.status(409).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot reverse a write-off with status ${writeOff.status}, must be APPROVED` }
    });
  }

  const t = await sequelize.transaction();

  try {
    writeOff.status = 'REVERSED';
    writeOff.reversed_by = req.user.id;
    writeOff.reversed_at = new Date();
    writeOff.reversal_reason = reversal_reason || null;
    await writeOff.save({ transaction: t });

    // Restore inventory
    await restoreInventory(writeOff, t);

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  await ActivityLog.log({
    actorUserId: req.user.id,
    actionType: 'WRITE_OFF_REVERSED',
    entityType: 'WRITE_OFF',
    entityId: writeOff.id,
    summary: `Write-off ${writeOff.write_off_number} reversed${reversal_reason ? ': ' + reversal_reason : ''}`,
    metadata: {
      writeOffNumber: writeOff.write_off_number,
      assetId: writeOff.asset_id,
      reversalReason: reversal_reason
    }
  });

  const result = await InventoryWriteOff.findByPk(writeOff.id, {
    include: writeOffIncludes()
  });

  res.json({ success: true, data: result });
});

/**
 * GET /api/v1/write-offs/summary
 * Monthly write-off totals for dashboard/reports
 */
exports.summary = asyncHandler(async (req, res) => {
  const { months = 12 } = req.query;

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - parseInt(months, 10));

  // Monthly totals (only APPROVED and PENDING count toward value)
  const monthlyTotals = await sequelize.query(`
    SELECT
      TO_CHAR(created_at, 'YYYY-MM') AS month,
      COUNT(*)::int AS count,
      COALESCE(SUM(total_cost_amount), 0)::float AS total_value
    FROM inventory_write_offs
    WHERE created_at >= :startDate
      AND status IN ('APPROVED', 'PENDING')
    GROUP BY TO_CHAR(created_at, 'YYYY-MM')
    ORDER BY month
  `, {
    replacements: { startDate },
    type: sequelize.QueryTypes.SELECT
  });

  // By reason breakdown
  const byReason = await sequelize.query(`
    SELECT
      reason,
      COUNT(*)::int AS count,
      COALESCE(SUM(total_cost_amount), 0)::float AS total_value
    FROM inventory_write_offs
    WHERE created_at >= :startDate
      AND status IN ('APPROVED', 'PENDING')
    GROUP BY reason
    ORDER BY total_value DESC
  `, {
    replacements: { startDate },
    type: sequelize.QueryTypes.SELECT
  });

  res.json({
    success: true,
    data: {
      monthlyTotals,
      byReason
    }
  });
});

/**
 * GET /api/v1/write-offs/salvage-units
 * List units with Salvage/Scrapped/Parts Only status that don't already have active write-offs
 */
exports.salvageUnits = asyncHandler(async (req, res) => {
  const units = await sequelize.query(`
    SELECT u.id, u.serial_number, u.status, u.cost_amount AS unit_cost,
           u.condition_status_id, cs.name AS condition_name,
           a.id AS asset_id, a.asset_tag, a.make, a.model,
           a.cost_amount AS product_cost, a.cost_currency, a.price_currency
    FROM asset_units u
    JOIN assets a ON u.asset_id = a.id
    LEFT JOIN condition_statuses cs ON u.condition_status_id = cs.id
    WHERE a.deleted_at IS NULL
      AND (u.status = 'Scrapped' OR u.condition_status_id IN (
        SELECT id FROM condition_statuses WHERE LOWER(name) IN ('salvage', 'parts only')
      ))
      AND u.id NOT IN (
        SELECT asset_unit_id FROM inventory_write_offs
        WHERE asset_unit_id IS NOT NULL AND status NOT IN ('REJECTED', 'REVERSED')
      )
    ORDER BY a.asset_tag, u.serial_number
  `, { type: sequelize.QueryTypes.SELECT });

  res.json({ success: true, data: units });
});
