/**
 * Stock Take Controller
 *
 * CRUD + workflow operations for physical inventory counting sessions.
 */

const { StockTake, StockTakeItem, Asset, User, InventoryItemEvent, ActivityLog, sequelize } = require('../models');
const { Op } = require('sequelize');

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeSummary(stockTakeId) {
  const items = await StockTakeItem.findAll({
    where: { stock_take_id: stockTakeId },
    attributes: ['status', 'variance', 'counted_quantity']
  });
  const total_items = items.length;
  const counted = items.filter(i => i.counted_quantity != null).length;
  const matched = items.filter(i => i.variance === 0).length;
  const discrepancies = items.filter(i => i.variance != null && i.variance !== 0).length;
  return { total_items, counted, matched, discrepancies };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * GET /
 * List stock takes — paginated, filter by status
 */
exports.list = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const where = {};
  if (status) where.status = status;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await StockTake.findAndCountAll({
    where,
    include: [{ model: User, as: 'creator', attributes: ['id', 'full_name'] }],
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset
  });

  // Attach quick progress stats
  const data = await Promise.all(rows.map(async (st) => {
    const json = st.toJSON();
    if (['in_progress', 'under_review'].includes(st.status)) {
      json.progress = await computeSummary(st.id);
    } else {
      json.progress = st.summary || null;
    }
    return json;
  }));

  res.json({
    success: true,
    data: {
      stockTakes: data,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    }
  });
});

/**
 * POST /
 * Create a new stock take session (draft).
 */
exports.create = asyncHandler(async (req, res) => {
  const { name, scope = 'full', scope_filter, blind_count = false, notes } = req.body;

  const reference = await StockTake.generateReference();

  const stockTake = await StockTake.create({
    reference,
    name: name || `Stock Take ${reference}`,
    scope,
    scope_filter: scope_filter || null,
    blind_count,
    notes,
    created_by: req.user?.id
  });

  await ActivityLog.log({
    actionType: 'STOCK_TAKE_CREATED',
    entityType: 'STOCK_TAKE',
    entityId: stockTake.id,
    userId: req.user?.id,
    summary: `Stock take ${stockTake.reference} created`,
    metadata: { reference: stockTake.reference, scope }
  });

  res.status(201).json({ success: true, data: { stockTake } });
});

/**
 * GET /:id
 * Get stock take with summary stats.
 */
exports.getById = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id, {
    include: [
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      { model: User, as: 'finalizer', attributes: ['id', 'full_name'] }
    ]
  });

  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }

  const data = stockTake.toJSON();
  data.progress = await computeSummary(stockTake.id);

  res.json({ success: true, data: { stockTake: data } });
});

/**
 * PUT /:id
 * Update stock take (draft only).
 */
exports.update = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (stockTake.status !== 'draft') {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_DRAFT', message: 'Can only update stock takes in draft status' }
    });
  }

  const { name, scope, scope_filter, blind_count, notes } = req.body;
  if (name !== undefined) stockTake.name = name;
  if (scope !== undefined) stockTake.scope = scope;
  if (scope_filter !== undefined) stockTake.scope_filter = scope_filter;
  if (blind_count !== undefined) stockTake.blind_count = blind_count;
  if (notes !== undefined) stockTake.notes = notes;

  await stockTake.save();
  res.json({ success: true, data: { stockTake } });
});

/**
 * DELETE /:id
 * Delete stock take (draft/cancelled only).
 */
exports.delete = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (!['draft', 'cancelled'].includes(stockTake.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'CANNOT_DELETE', message: 'Can only delete draft or cancelled stock takes' }
    });
  }

  await StockTakeItem.destroy({ where: { stock_take_id: stockTake.id } });
  await stockTake.destroy();

  res.json({ success: true, message: 'Stock take deleted' });
});

// ---------------------------------------------------------------------------
// Workflow actions
// ---------------------------------------------------------------------------

/**
 * POST /:id/start
 * Snapshot current quantities and create StockTakeItems.
 */
exports.start = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (stockTake.status !== 'draft') {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_STARTED', message: 'Stock take has already been started' }
    });
  }

  // Build asset filter based on scope
  const assetWhere = {
    deleted_at: null,
    status: { [Op.in]: ['In Stock', 'Processing', 'Reserved'] }
  };

  if (stockTake.scope === 'category' && stockTake.scope_filter) {
    if (stockTake.scope_filter.category) assetWhere.category = stockTake.scope_filter.category;
    if (stockTake.scope_filter.asset_type) assetWhere.asset_type = stockTake.scope_filter.asset_type;
  } else if (stockTake.scope === 'location' && stockTake.scope_filter) {
    if (stockTake.scope_filter.location) assetWhere.location = stockTake.scope_filter.location;
  }

  const assets = await Asset.findAll({
    where: assetWhere,
    attributes: ['id', 'quantity']
  });

  if (assets.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ASSETS', message: 'No assets match the stock take scope' }
    });
  }

  const transaction = await sequelize.transaction();
  try {
    // Create items in bulk
    const itemRows = assets.map(a => ({
      stock_take_id: stockTake.id,
      asset_id: a.id,
      expected_quantity: a.quantity || 0,
      status: 'pending'
    }));

    await StockTakeItem.bulkCreate(itemRows, { transaction });

    stockTake.status = 'in_progress';
    stockTake.started_at = new Date();
    await stockTake.save({ transaction });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const progress = await computeSummary(stockTake.id);

  await ActivityLog.log({
    actionType: 'STOCK_TAKE_STARTED',
    entityType: 'STOCK_TAKE',
    entityId: stockTake.id,
    userId: req.user?.id,
    summary: `Stock take ${stockTake.reference} started with ${assets.length} items`,
    metadata: { reference: stockTake.reference, itemCount: assets.length }
  });

  res.json({
    success: true,
    data: { stockTake, progress },
    message: `Stock take started with ${assets.length} items`
  });
});

// ---------------------------------------------------------------------------
// Item operations
// ---------------------------------------------------------------------------

/**
 * GET /:id/items
 * Get stock take items — paginated, filterable.
 */
exports.getItems = asyncHandler(async (req, res) => {
  const { status, search, hasVariance, page = 1, limit = 50 } = req.query;
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }

  const where = { stock_take_id: stockTake.id };
  if (status) where.status = status;
  if (hasVariance === 'true') {
    where.variance = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: 0 }] };
  }

  // Asset search filter
  let assetWhere;
  if (search) {
    assetWhere = {
      [Op.or]: [
        { asset_tag: { [Op.iLike]: `%${search}%` } },
        { make: { [Op.iLike]: `%${search}%` } },
        { model: { [Op.iLike]: `%${search}%` } },
        { serial_number: { [Op.iLike]: `%${search}%` } }
      ]
    };
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await StockTakeItem.findAndCountAll({
    where,
    include: [{
      model: Asset,
      as: 'asset',
      attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'asset_type', 'quantity', 'condition'],
      where: assetWhere,
      required: true
    }],
    order: [['id', 'ASC']],
    limit: parseInt(limit),
    offset
  });

  res.json({
    success: true,
    data: {
      items: rows,
      blind_count: stockTake.blind_count,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    }
  });
});

/**
 * PUT /:id/items/:itemId
 * Update a single item count.
 */
exports.updateItem = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;
  const stockTake = await StockTake.findByPk(id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (!['in_progress', 'under_review'].includes(stockTake.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_COUNTING', message: 'Stock take is not in counting or review status' }
    });
  }

  const item = await StockTakeItem.findOne({
    where: { id: itemId, stock_take_id: id },
    include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'quantity', 'condition'] }]
  });
  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Stock take item not found' }
    });
  }

  const { counted_quantity, resolution, resolution_notes, serial_verified } = req.body;

  if (counted_quantity !== undefined) {
    const qty = parseInt(counted_quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUANTITY', message: 'Counted quantity must be a non-negative integer' }
      });
    }
    item.counted_quantity = qty;
    item.variance = qty - item.expected_quantity;
    item.status = 'counted';
    item.counted_by = req.user?.id;
    item.counted_at = new Date();

    // Auto-set resolution for matches
    if (item.variance === 0) {
      item.resolution = 'match';
    } else if (item.resolution === 'match') {
      // Clear match resolution if variance changed
      item.resolution = null;
    }
  }

  if (resolution !== undefined) item.resolution = resolution;
  if (resolution_notes !== undefined) item.resolution_notes = resolution_notes;
  if (serial_verified !== undefined) item.serial_verified = serial_verified;

  await item.save();

  res.json({ success: true, data: { item } });
});

/**
 * POST /:id/items/batch-count
 * Batch update counts: [{ itemId, counted_quantity }]
 */
exports.batchCount = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (stockTake.status !== 'in_progress') {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_COUNTING', message: 'Stock take is not in counting status' }
    });
  }

  const { counts } = req.body;
  if (!Array.isArray(counts) || counts.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'counts array is required' }
    });
  }

  const updated = [];
  for (const { itemId, counted_quantity } of counts) {
    const item = await StockTakeItem.findOne({
      where: { id: itemId, stock_take_id: stockTake.id }
    });
    if (!item) continue;

    const qty = parseInt(counted_quantity);
    if (isNaN(qty) || qty < 0) continue;

    item.counted_quantity = qty;
    item.variance = qty - item.expected_quantity;
    item.status = 'counted';
    item.counted_by = req.user?.id;
    item.counted_at = new Date();
    if (item.variance === 0) item.resolution = 'match';
    else if (item.resolution === 'match') item.resolution = null;

    await item.save();
    updated.push(item.id);
  }

  res.json({
    success: true,
    data: { updated_count: updated.length },
    message: `${updated.length} items updated`
  });
});

// ---------------------------------------------------------------------------
// Review & Finalize
// ---------------------------------------------------------------------------

/**
 * POST /:id/submit-review
 * Move to under_review — all items must be counted.
 */
exports.submitReview = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (stockTake.status !== 'in_progress') {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_COUNTING', message: 'Stock take must be in progress to submit for review' }
    });
  }

  // Check all items are counted
  const uncounted = await StockTakeItem.count({
    where: { stock_take_id: stockTake.id, counted_quantity: null }
  });
  if (uncounted > 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'UNCOUNTED_ITEMS', message: `${uncounted} items have not been counted yet` }
    });
  }

  stockTake.status = 'under_review';
  stockTake.completed_at = new Date();
  await stockTake.save();

  res.json({ success: true, data: { stockTake }, message: 'Stock take submitted for review' });
});

/**
 * POST /:id/finalize
 * Apply adjustments — Admin/Manager only. All discrepancies must be resolved.
 */
exports.finalize = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (stockTake.status !== 'under_review') {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_REVIEW', message: 'Stock take must be under review to finalize' }
    });
  }

  // All items must be counted
  const uncounted = await StockTakeItem.count({
    where: { stock_take_id: stockTake.id, counted_quantity: null }
  });
  if (uncounted > 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'UNCOUNTED_ITEMS', message: `${uncounted} items have not been counted` }
    });
  }

  // All discrepancies must have a resolution
  const unresolved = await StockTakeItem.count({
    where: {
      stock_take_id: stockTake.id,
      variance: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: 0 }] },
      resolution: null
    }
  });
  if (unresolved > 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'UNRESOLVED', message: `${unresolved} discrepancies have not been resolved` }
    });
  }

  // Apply adjustments in a transaction
  const transaction = await sequelize.transaction();
  try {
    const items = await StockTakeItem.findAll({
      where: { stock_take_id: stockTake.id },
      include: [{ model: Asset, as: 'asset' }],
      transaction
    });

    let adjustmentsMade = 0;

    for (const item of items) {
      if (!item.asset || item.variance === 0 || item.variance == null) continue;

      // Skip adjustments for miscounts
      if (item.resolution === 'miscount') continue;

      // Adjust asset quantity
      item.asset.quantity = item.counted_quantity;
      await item.asset.save({ transaction });
      await item.asset.updateComputedStatus(transaction);

      item.status = 'adjusted';
      await item.save({ transaction });
      adjustmentsMade++;

      // Log inventory event
      await InventoryItemEvent.log({
        inventoryItemId: item.asset.id,
        eventType: 'STOCK_ADJUSTED',
        actorUserId: req.user?.id,
        source: 'USER',
        referenceType: 'stock_take',
        referenceId: String(stockTake.id),
        summary: `Stock adjusted: ${item.expected_quantity} → ${item.counted_quantity} (${item.resolution || 'adjustment'})`,
        details: {
          stockTakeId: stockTake.id,
          stockTakeRef: stockTake.reference,
          expectedQuantity: item.expected_quantity,
          countedQuantity: item.counted_quantity,
          variance: item.variance,
          resolution: item.resolution,
          resolutionNotes: item.resolution_notes
        }
      }, transaction);
    }

    const summary = await computeSummary(stockTake.id);
    summary.adjustments_made = adjustmentsMade;

    stockTake.status = 'finalized';
    stockTake.finalized_at = new Date();
    stockTake.finalized_by = req.user?.id;
    stockTake.summary = summary;
    await stockTake.save({ transaction });

    await transaction.commit();

    await ActivityLog.log({
      actionType: 'STOCK_TAKE_FINALIZED',
      entityType: 'STOCK_TAKE',
      entityId: stockTake.id,
      userId: req.user?.id,
      summary: `Stock take ${stockTake.reference} finalized — ${adjustmentsMade} adjustments applied`,
      metadata: { reference: stockTake.reference, summary }
    });

    res.json({
      success: true,
      data: { stockTake, summary },
      message: `Stock take finalized. ${adjustmentsMade} inventory adjustments applied.`
    });
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
});

/**
 * POST /:id/cancel
 */
exports.cancel = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (stockTake.status === 'finalized') {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_FINALIZED', message: 'Cannot cancel a finalized stock take' }
    });
  }

  stockTake.status = 'cancelled';
  await stockTake.save();

  res.json({ success: true, data: { stockTake }, message: 'Stock take cancelled' });
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * GET /:id/discrepancies
 * Items with variance != 0.
 */
exports.discrepancies = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }

  const items = await StockTakeItem.findAll({
    where: {
      stock_take_id: stockTake.id,
      variance: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: 0 }] }
    },
    include: [{
      model: Asset,
      as: 'asset',
      attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'quantity', 'condition']
    }],
    order: [['variance', 'ASC']]
  });

  res.json({ success: true, data: { items, count: items.length } });
});

/**
 * GET /:id/export
 * CSV export of all items.
 */
exports.export = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }

  const items = await StockTakeItem.findAll({
    where: { stock_take_id: stockTake.id },
    include: [{
      model: Asset,
      as: 'asset',
      attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'asset_type', 'condition']
    }],
    order: [['id', 'ASC']]
  });

  const header = 'Asset Tag,Make,Model,Serial Number,Category,Type,Condition,Expected Qty,Counted Qty,Variance,Status,Resolution,Notes';
  const rows = items.map(i => {
    const a = i.asset || {};
    return [
      a.asset_tag || '',
      a.make || '',
      a.model || '',
      a.serial_number || '',
      a.category || '',
      a.asset_type || '',
      a.condition || '',
      i.expected_quantity,
      i.counted_quantity != null ? i.counted_quantity : '',
      i.variance != null ? i.variance : '',
      i.status,
      i.resolution || '',
      (i.resolution_notes || '').replace(/"/g, '""')
    ].map(v => `"${v}"`).join(',');
  });

  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="stock-take-${stockTake.reference}.csv"`);
  res.send(csv);
});

/**
 * GET /:id/lookup?code=XXXXX
 * Lookup by serial_number or asset_tag (for scanner).
 */
exports.lookup = asyncHandler(async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_CODE', message: 'code query parameter is required' }
    });
  }

  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }

  // Find asset by serial_number or asset_tag
  const asset = await Asset.findOne({
    where: {
      [Op.or]: [
        { serial_number: code },
        { asset_tag: code }
      ],
      deleted_at: null
    }
  });

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: { code: 'ASSET_NOT_FOUND', message: 'No asset found with that code' }
    });
  }

  // Find the corresponding stock take item
  const item = await StockTakeItem.findOne({
    where: { stock_take_id: stockTake.id, asset_id: asset.id },
    include: [{
      model: Asset,
      as: 'asset',
      attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'quantity', 'condition']
    }]
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_IN_STOCK_TAKE', message: `Asset ${asset.asset_tag} is not part of this stock take` }
    });
  }

  res.json({ success: true, data: { item } });
});

module.exports = exports;
