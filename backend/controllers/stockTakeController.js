/**
 * Stock Take Controller
 *
 * CRUD + workflow operations for physical inventory counting sessions.
 */

const { StockTake, StockTakeItem, StockTakeScan, StockTakeBatch, StockTakeUnitNote, Asset, AssetUnit, User, InventoryItemEvent, ActivityLog, sequelize } = require('../models');
const { Op } = require('sequelize');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeSummary(stockTakeId) {
  const items = await StockTakeItem.findAll({
    where: { stock_take_id: stockTakeId },
    attributes: ['status', 'variance', 'counted_quantity', 'count_method']
  });
  const total_items = items.length;
  const counted = items.filter(i => i.counted_quantity != null).length;
  const matched = items.filter(i => i.variance === 0).length;
  const discrepancies = items.filter(i => i.variance != null && i.variance !== 0).length;
  const serial_items = items.filter(i => i.count_method === 'serial').length;
  const quantity_items = items.filter(i => i.count_method === 'quantity').length;
  return { total_items, counted, matched, discrepancies, serial_items, quantity_items };
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

  await StockTakeScan.destroy({ where: { stock_take_id: stockTake.id } });
  await StockTakeBatch.destroy({ where: { stock_take_id: stockTake.id } });
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
    attributes: ['id', 'quantity', 'is_serialized']
  });

  if (assets.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ASSETS', message: 'No assets match the stock take scope' }
    });
  }

  // For serialized assets, compute expected quantity excluding Sold and Written Off units
  // Note: Scrapped units are still physically present and should be counted
  const serializedIds = assets.filter(a => a.is_serialized).map(a => a.id);
  let unitCountMap = {};
  if (serializedIds.length > 0) {
    const [rows] = await sequelize.query(
      `SELECT asset_id, COUNT(*) AS cnt
         FROM asset_units
        WHERE asset_id IN (:ids) AND status NOT IN ('Sold', 'Written Off')
        GROUP BY asset_id`,
      { replacements: { ids: serializedIds } }
    );
    rows.forEach(r => { unitCountMap[r.asset_id] = parseInt(r.cnt, 10); });
  }

  // For non-serialized assets, compute reserved quantities on delivered open invoices
  // Only subtract items that have physically left the store (fulfillment_type = 'delivered')
  // Items on 'held' (layaway) invoices are still in store and should be counted
  const nonSerializedIds = assets.filter(a => !a.is_serialized).map(a => a.id);
  let reservedMap = {};
  if (nonSerializedIds.length > 0) {
    const [rows] = await sequelize.query(
      `SELECT ii.asset_id, COALESCE(SUM(ii.quantity), 0) AS reserved
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
        WHERE ii.asset_id IN (:ids)
          AND i.status NOT IN ('CANCELLED', 'PAID')
          AND ii.voided_at IS NULL
          AND COALESCE(i.fulfillment_type, 'delivered') = 'delivered'
        GROUP BY ii.asset_id`,
      { replacements: { ids: nonSerializedIds } }
    );
    rows.forEach(r => { reservedMap[r.asset_id] = parseInt(r.reserved, 10); });
  }

  const transaction = await sequelize.transaction();
  try {
    // Create items in bulk — set count_method based on is_serialized
    // Non-serialized: expected = quantity - reserved on open invoices
    const itemRows = assets.map(a => ({
      stock_take_id: stockTake.id,
      asset_id: a.id,
      count_method: a.is_serialized ? 'serial' : 'quantity',
      expected_quantity: a.is_serialized
        ? (unitCountMap[a.id] || 0)
        : Math.max((a.quantity || 0) - (reservedMap[a.id] || 0), 0),
      status: 'pending'
    }));

    await StockTakeItem.bulkCreate(itemRows, { transaction });

    stockTake.status = 'in_progress';
    stockTake.started_at = new Date();
    await stockTake.save({ transaction });

    // Create the first batch
    await StockTakeBatch.create({
      stock_take_id: stockTake.id,
      batch_number: 1,
      status: 'active',
      target_size: 20,
      scanned_count: 0,
      started_at: new Date(),
      created_by: req.user?.id
    }, { transaction });

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
  const { status, search, hasVariance, countMethod, page = 1, limit = 50 } = req.query;
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }

  const where = { stock_take_id: stockTake.id };
  if (status) where.status = status;
  if (countMethod && ['serial', 'quantity'].includes(countMethod)) {
    where.count_method = countMethod;
  }
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
      attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'asset_type', 'quantity', 'condition', 'is_serialized'],
      where: assetWhere,
      required: true
    }],
    order: [['id', 'ASC']],
    limit: parseInt(limit),
    offset
  });

  // For serialized assets, attach scan count per item
  const itemIds = rows.map(r => r.id);
  const scanCounts = await StockTakeScan.findAll({
    where: { stock_take_item_id: { [Op.in]: itemIds } },
    attributes: [
      'stock_take_item_id',
      [sequelize.fn('COUNT', sequelize.col('id')), 'scan_count']
    ],
    group: ['stock_take_item_id'],
    raw: true
  });
  const scanCountMap = {};
  for (const sc of scanCounts) {
    scanCountMap[sc.stock_take_item_id] = parseInt(sc.scan_count);
  }

  const data = rows.map(r => {
    const json = r.toJSON();
    json.scan_count = scanCountMap[r.id] || 0;
    return json;
  });

  res.json({
    success: true,
    data: {
      items: data,
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
    // Block manual count updates for serial items — scans are the source of truth
    if (item.count_method === 'serial') {
      return res.status(400).json({
        success: false,
        error: { code: 'SERIAL_COUNT_LOCKED', message: 'Serial items are counted by scanning. Manual count is not allowed.' }
      });
    }

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

    // Skip serial items — they are counted by scanning
    if (item.count_method === 'serial') continue;

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

  // Check all items are counted (or have reasons for unscanned units)
  const uncountedItems = await StockTakeItem.findAll({
    where: { stock_take_id: stockTake.id, counted_quantity: null },
    include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'is_serialized'] }]
  });

  if (uncountedItems.length > 0) {
    // For serial items: allow if every unscanned unit has a reason
    const needsAttention = [];
    for (const item of uncountedItems) {
      if (item.count_method === 'serial') {
        // Get all units for this asset
        const allUnits = await AssetUnit.findAll({
          where: { asset_id: item.asset_id },
          attributes: ['id']
        });
        const scannedUnitIds = (await StockTakeScan.findAll({
          where: { stock_take_item_id: item.id },
          attributes: ['asset_unit_id']
        })).map(s => s.asset_unit_id);

        const unscannedIds = allUnits.filter(u => !scannedUnitIds.includes(u.id)).map(u => u.id);

        if (unscannedIds.length > 0) {
          // Check each unscanned unit has a reason
          const reasons = await StockTakeUnitNote.findAll({
            where: { stock_take_id: stockTake.id, asset_unit_id: unscannedIds }
          });
          const reasonedIds = new Set(reasons.filter(r => r.reason).map(r => r.asset_unit_id));
          const missingReasons = unscannedIds.filter(uid => !reasonedIds.has(uid));

          if (missingReasons.length > 0) {
            needsAttention.push({
              item_id: item.id,
              asset_tag: item.asset?.asset_tag,
              missing_reasons: missingReasons.length
            });
          } else {
            // All unscanned units have reasons — set counted_quantity to scan count
            item.counted_quantity = scannedUnitIds.length;
            item.variance = scannedUnitIds.length - item.expected_quantity;
            item.status = 'counted';
            item.counted_at = new Date();
            await item.save();
          }
        }
      } else {
        // Quantity items must be manually counted
        needsAttention.push({
          item_id: item.id,
          asset_tag: item.asset?.asset_tag,
          missing_reasons: 0
        });
      }
    }

    if (needsAttention.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNCOUNTED_ITEMS',
          message: `${needsAttention.length} items need attention — enter reasons for unscanned units`,
          items: needsAttention
        }
      });
    }
  }

  stockTake.status = 'under_review';
  stockTake.completed_at = new Date();
  const summary = await computeSummary(stockTake.id);
  stockTake.summary = summary;
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

  // All items must be counted (or have reasons for unscanned units)
  const uncountedItems = await StockTakeItem.findAll({
    where: { stock_take_id: stockTake.id, counted_quantity: null },
    include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'is_serialized'] }]
  });

  if (uncountedItems.length > 0) {
    const needsAttention = [];
    for (const item of uncountedItems) {
      if (item.count_method === 'serial') {
        const allUnits = await AssetUnit.findAll({
          where: { asset_id: item.asset_id },
          attributes: ['id']
        });
        const scannedUnitIds = (await StockTakeScan.findAll({
          where: { stock_take_item_id: item.id },
          attributes: ['asset_unit_id']
        })).map(s => s.asset_unit_id);

        const unscannedIds = allUnits.filter(u => !scannedUnitIds.includes(u.id)).map(u => u.id);

        if (unscannedIds.length > 0) {
          const reasons = await StockTakeUnitNote.findAll({
            where: { stock_take_id: stockTake.id, asset_unit_id: unscannedIds }
          });
          const reasonedIds = new Set(reasons.filter(r => r.reason).map(r => r.asset_unit_id));
          const missingReasons = unscannedIds.filter(uid => !reasonedIds.has(uid));

          if (missingReasons.length > 0) {
            needsAttention.push({
              item_id: item.id,
              asset_tag: item.asset?.asset_tag,
              missing_reasons: missingReasons.length
            });
          } else {
            item.counted_quantity = scannedUnitIds.length;
            item.variance = scannedUnitIds.length - item.expected_quantity;
            item.status = 'counted';
            item.counted_at = new Date();
            await item.save();
          }
        }
      } else {
        needsAttention.push({
          item_id: item.id,
          asset_tag: item.asset?.asset_tag,
          missing_reasons: 0
        });
      }
    }

    if (needsAttention.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNCOUNTED_ITEMS',
          message: `${needsAttention.length} items need attention — enter reasons for unscanned units`,
          items: needsAttention
        }
      });
    }
  }

  // Note: unresolved variances are allowed — they will be skipped during adjustment

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

      // Skip adjustments for miscounts or unresolved variances
      if (item.resolution === 'miscount' || !item.resolution) continue;

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
    include: [
      {
        model: Asset,
        as: 'asset',
        attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'asset_type', 'condition', 'is_serialized']
      },
      {
        model: StockTakeScan,
        as: 'scans',
        include: [{ model: AssetUnit, as: 'unit', attributes: ['serial_number', 'cpu', 'memory', 'storage'] }]
      }
    ],
    order: [['id', 'ASC']]
  });

  // Fetch all unit notes for this stock take
  const unitNotes = await StockTakeUnitNote.findAll({
    where: { stock_take_id: stockTake.id },
    include: [{ model: AssetUnit, as: 'unit', attributes: ['serial_number'] }]
  });
  const notesByItem = new Map();
  for (const n of unitNotes) {
    const arr = notesByItem.get(n.stock_take_item_id) || [];
    const reasonLabel = n.reason ? `[${n.reason}]` : '';
    const noteText = n.notes || '';
    arr.push(`${n.unit?.serial_number || 'unknown'}: ${reasonLabel}${reasonLabel && noteText ? ' ' : ''}${noteText}`);
    notesByItem.set(n.stock_take_item_id, arr);
  }

  const header = 'Asset Tag,Make,Model,Serial Number,Category,Type,Condition,Count Method,Expected Qty,Counted Qty,Variance,Status,Resolution,Notes,Scanned Serials,Unit Notes';
  const rows = items.map(i => {
    const a = i.asset || {};
    const scannedSerials = (i.scans || []).map(s => s.serial_number).join('; ');
    const unitNotesStr = (notesByItem.get(i.id) || []).join('; ');
    return [
      a.asset_tag || '',
      a.make || '',
      a.model || '',
      a.serial_number || '',
      a.category || '',
      a.asset_type || '',
      a.condition || '',
      (i.count_method || 'quantity').toUpperCase(),
      i.expected_quantity,
      i.counted_quantity != null ? i.counted_quantity : '',
      i.variance != null ? i.variance : '',
      i.status,
      i.resolution || '',
      (i.resolution_notes || '').replace(/"/g, '""'),
      scannedSerials,
      unitNotesStr.replace(/"/g, '""')
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

  // First try asset by serial_number or asset_tag (case-insensitive)
  const codeUpper = code.toUpperCase();
  let asset = await Asset.findOne({
    where: {
      [Op.or]: [
        sequelize.where(sequelize.fn('UPPER', sequelize.col('serial_number')), codeUpper),
        sequelize.where(sequelize.fn('UPPER', sequelize.col('asset_tag')), codeUpper)
      ],
      deleted_at: null
    }
  });

  let unit = null;

  // If not found at asset level, search asset_units by serial_number (case-insensitive)
  if (!asset) {
    unit = await AssetUnit.findOne({
      where: sequelize.where(sequelize.fn('UPPER', sequelize.col('serial_number')), codeUpper),
      include: [{ model: Asset, as: 'product', where: { deleted_at: null } }]
    });
    if (unit) asset = unit.product;
  }

  // Fallback: search asset_units by barcode (SalesBinder SKU)
  if (!asset) {
    unit = await AssetUnit.findOne({
      where: sequelize.where(sequelize.fn('UPPER', sequelize.col('barcode')), codeUpper),
      include: [{ model: Asset, as: 'product', where: { deleted_at: null } }]
    });
    if (unit) asset = unit.product;
  }

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
      attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'category', 'quantity', 'condition', 'is_serialized']
    }]
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_IN_STOCK_TAKE', message: `Asset ${asset.asset_tag} is not part of this stock take` }
    });
  }

  const result = item.toJSON();
  if (unit) result.matched_unit = { id: unit.id, serial_number: unit.serial_number };

  res.json({ success: true, data: { item: result } });
});

// ---------------------------------------------------------------------------
// Serial Scanning
// ---------------------------------------------------------------------------

/**
 * POST /:id/scans
 * Add a serial scan. Looks up the AssetUnit by serial_number, finds the parent
 * StockTakeItem, creates a StockTakeScan, and recomputes counted_quantity.
 * Body: { serial_number }
 */
exports.addScan = asyncHandler(async (req, res) => {
  const { serial_number } = req.body;
  if (!serial_number || !serial_number.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_SERIAL', message: 'serial_number is required' }
    });
  }

  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }
  if (!['in_progress', 'under_review'].includes(stockTake.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_COUNTING', message: 'Stock take is not in counting status' }
    });
  }

  const sn = serial_number.trim();
  const snUpper = sn.toUpperCase();

  // Check for duplicate scan in this session (case-insensitive)
  const existing = await StockTakeScan.findOne({
    where: {
      stock_take_id: stockTake.id,
      [Op.and]: sequelize.where(sequelize.fn('UPPER', sequelize.col('serial_number')), snUpper)
    }
  });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_SCAN', message: `Serial ${sn} already scanned in this stock take` }
    });
  }

  // Find the asset unit by serial_number or barcode (case-insensitive)
  let unit = await AssetUnit.findOne({
    where: sequelize.where(sequelize.fn('UPPER', sequelize.col('AssetUnit.serial_number')), snUpper),
    include: [{ model: Asset, as: 'product', where: { deleted_at: null } }]
  });

  // Fallback: search by barcode column (SalesBinder SKU printed on sticker)
  if (!unit) {
    unit = await AssetUnit.findOne({
      where: sequelize.where(sequelize.fn('UPPER', sequelize.col('AssetUnit.barcode')), snUpper),
      include: [{ model: Asset, as: 'product', where: { deleted_at: null } }]
    });
  }

  if (!unit) {
    // Also try asset-level serial_number or asset_tag (case-insensitive)
    const asset = await Asset.findOne({
      where: {
        [Op.or]: [
          sequelize.where(sequelize.fn('UPPER', sequelize.col('serial_number')), snUpper),
          sequelize.where(sequelize.fn('UPPER', sequelize.col('asset_tag')), snUpper)
        ],
        deleted_at: null
      }
    });
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { code: 'SERIAL_NOT_FOUND', message: `No unit or asset found with serial ${sn}` }
      });
    }
    // Non-serialized asset match — don't create a scan record, just return the item
    const item = await StockTakeItem.findOne({
      where: { stock_take_id: stockTake.id, asset_id: asset.id },
      include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'is_serialized'] }]
    });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_IN_STOCK_TAKE', message: `Asset ${asset.asset_tag} is not part of this stock take` }
      });
    }
    return res.json({
      success: true,
      data: { item: item.toJSON(), scan: null, non_serialized: true },
      message: `This item is set to quantity-only counting. Use the manual count field.`
    });
  }

  const asset = unit.product;

  // Warn if unit has been sold or written off — it should not be in physical inventory
  const unitWarning = unit.status === 'Sold'
    ? { code: 'SOLD_UNIT_SCANNED', message: `Warning: ${unit.serial_number} is marked as SOLD. This unit should not be in stock.` }
    : unit.status === 'Written Off'
      ? { code: 'WRITTEN_OFF_UNIT_SCANNED', message: `Warning: ${unit.serial_number} has been WRITTEN OFF. This unit should not be in stock.` }
      : null;

  // Find the stock take item for this asset
  const item = await StockTakeItem.findOne({
    where: { stock_take_id: stockTake.id, asset_id: asset.id }
  });
  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_IN_STOCK_TAKE', message: `Asset ${asset.asset_tag} is not part of this stock take` }
    });
  }

  // Reject scan for quantity-only items
  if (item.count_method === 'quantity') {
    return res.status(400).json({
      success: false,
      error: { code: 'QUANTITY_ONLY', message: `This item is set to quantity-only counting. Use the manual count field for ${asset.make} ${asset.model}.` }
    });
  }

  // Find or create active batch
  let activeBatch = await StockTakeBatch.findOne({
    where: { stock_take_id: stockTake.id, status: 'active' }
  });

  if (!activeBatch) {
    // Get next batch number
    const lastBatch = await StockTakeBatch.findOne({
      where: { stock_take_id: stockTake.id },
      order: [['batch_number', 'DESC']]
    });
    const nextNum = lastBatch ? lastBatch.batch_number + 1 : 1;
    activeBatch = await StockTakeBatch.create({
      stock_take_id: stockTake.id,
      batch_number: nextNum,
      status: 'active',
      target_size: 20,
      scanned_count: 0,
      started_at: new Date(),
      created_by: req.user?.id
    });
  }

  // Check if this unit was already scanned (by unit ID, not just serial text)
  const existingUnitScan = await StockTakeScan.findOne({
    where: { stock_take_id: stockTake.id, asset_unit_id: unit.id }
  });
  if (existingUnitScan) {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_SCAN', message: `Unit ${unit.serial_number} already scanned in this stock take (scanned via ${existingUnitScan.serial_number})` }
    });
  }

  // Create the scan record — store the actual serial_number (not barcode) for consistency
  const scan = await StockTakeScan.create({
    stock_take_id: stockTake.id,
    stock_take_item_id: item.id,
    asset_id: asset.id,
    asset_unit_id: unit.id,
    serial_number: unit.serial_number,
    stock_take_batch_id: activeBatch.id,
    scanned_by: req.user?.id,
    scanned_at: new Date()
  });

  // Increment batch scanned_count
  activeBatch.scanned_count += 1;

  // Auto-close batch at target_size and create next batch
  let newBatchCreated = false;
  if (activeBatch.scanned_count >= activeBatch.target_size) {
    activeBatch.status = 'closed';
    activeBatch.closed_at = new Date();
    await activeBatch.save();

    // Create next batch
    const nextNum = activeBatch.batch_number + 1;
    activeBatch = await StockTakeBatch.create({
      stock_take_id: stockTake.id,
      batch_number: nextNum,
      status: 'active',
      target_size: 20,
      scanned_count: 0,
      started_at: new Date(),
      created_by: req.user?.id
    });
    newBatchCreated = true;
  } else {
    await activeBatch.save();
  }

  // Recompute counted_quantity from scan count
  const scanCount = await StockTakeScan.count({
    where: { stock_take_item_id: item.id }
  });
  item.counted_quantity = scanCount;
  item.variance = scanCount - item.expected_quantity;
  item.status = 'counted';
  item.counted_by = req.user?.id;
  item.counted_at = new Date();
  if (item.variance === 0) item.resolution = 'match';
  else if (item.resolution === 'match') item.resolution = null;
  await item.save();

  // Return enriched data
  const scanData = scan.toJSON();
  scanData.unit = { id: unit.id, serial_number: unit.serial_number, cpu: unit.cpu, memory: unit.memory, storage: unit.storage };
  scanData.batch_number = newBatchCreated ? activeBatch.batch_number - 1 : activeBatch.batch_number;

  const itemData = item.toJSON();
  itemData.asset = { id: asset.id, asset_tag: asset.asset_tag, make: asset.make, model: asset.model, is_serialized: asset.is_serialized };
  itemData.scan_count = scanCount;

  res.status(201).json({
    success: true,
    data: { scan: scanData, item: itemData, batch: activeBatch.toJSON(), new_batch_created: newBatchCreated, warning: unitWarning },
    message: `Scanned: ${sn} → ${asset.make} ${asset.model}`
  });
});

/**
 * DELETE /:id/scans/:scanId
 * Remove a scan and recompute the counted_quantity.
 */
exports.removeScan = asyncHandler(async (req, res) => {
  const { id, scanId } = req.params;
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
      error: { code: 'NOT_COUNTING', message: 'Stock take is not in counting status' }
    });
  }

  const scan = await StockTakeScan.findOne({
    where: { id: scanId, stock_take_id: id }
  });
  if (!scan) {
    return res.status(404).json({
      success: false,
      error: { code: 'SCAN_NOT_FOUND', message: 'Scan record not found' }
    });
  }

  const itemId = scan.stock_take_item_id;
  const batchId = scan.stock_take_batch_id;
  await scan.destroy();

  // Decrement batch scanned_count
  if (batchId) {
    const batch = await StockTakeBatch.findByPk(batchId);
    if (batch) {
      batch.scanned_count = Math.max(0, batch.scanned_count - 1);
      await batch.save();
    }
  }

  // Recompute counted_quantity
  const scanCount = await StockTakeScan.count({
    where: { stock_take_item_id: itemId }
  });
  const item = await StockTakeItem.findByPk(itemId);
  if (item) {
    item.counted_quantity = scanCount > 0 ? scanCount : null;
    item.variance = scanCount > 0 ? scanCount - item.expected_quantity : null;
    item.status = scanCount > 0 ? 'counted' : 'pending';
    if (item.variance === 0) item.resolution = 'match';
    else if (item.resolution === 'match') item.resolution = null;
    await item.save();
  }

  res.json({
    success: true,
    data: { item_id: itemId, scan_count: scanCount },
    message: 'Scan removed'
  });
});

/**
 * GET /:id/items/:itemId/scans
 * List all asset units for the product with scan status.
 * Returns { units: [...], scans: [...] } where each unit has a `scanned` flag.
 */
exports.getItemScans = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;

  const item = await StockTakeItem.findOne({
    where: { id: itemId, stock_take_id: id }
  });
  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Stock take item not found' }
    });
  }

  // Fetch all scans for this item
  const scans = await StockTakeScan.findAll({
    where: { stock_take_item_id: itemId },
    include: [
      { model: AssetUnit, as: 'unit', attributes: ['id', 'serial_number', 'cpu', 'cpu_model', 'memory', 'storage', 'status'] },
      { model: User, as: 'scanner', attributes: ['id', 'full_name'] }
    ],
    order: [['scanned_at', 'DESC']]
  });

  // Fetch ALL asset units for the parent product
  const allUnits = await AssetUnit.findAll({
    where: { asset_id: item.asset_id },
    attributes: ['id', 'serial_number', 'cpu', 'cpu_model', 'memory', 'storage', 'status'],
    order: [['serial_number', 'ASC']]
  });

  // Build a set of scanned unit IDs for quick lookup
  const scannedUnitIds = new Set(scans.map(s => s.asset_unit_id));

  // Fetch unit-level notes for this item
  const unitNotes = await StockTakeUnitNote.findAll({
    where: { stock_take_item_id: itemId },
    attributes: ['asset_unit_id', 'reason', 'notes']
  });
  const notesByUnit = new Map(unitNotes.map(n => [n.asset_unit_id, { reason: n.reason, notes: n.notes }]));

  // Enrich each unit with scan info and notes
  const units = allUnits.map(u => {
    const json = u.toJSON();
    json.scanned = scannedUnitIds.has(u.id);
    const scan = scans.find(s => s.asset_unit_id === u.id);
    json.scanned_by = scan?.scanner?.full_name || null;
    json.scanned_at = scan?.scanned_at || null;
    const noteData = notesByUnit.get(u.id);
    json.reason = noteData?.reason || '';
    json.notes = noteData?.notes || '';
    return json;
  });

  res.json({
    success: true,
    data: { units, scans, total_units: allUnits.length, scanned_count: scans.length }
  });
});

/**
 * PUT /:id/items/:itemId/unit-notes/:unitId
 * Create or update a note on a specific serial number (asset unit) within a stock take.
 */
exports.updateUnitNote = asyncHandler(async (req, res) => {
  const { id, itemId, unitId } = req.params;
  const { reason, notes } = req.body;

  const VALID_REASONS = ['sold_not_invoiced', 'in_repair', 'on_loan', 'lost_stolen', 'damaged', 'relocated', 'other'];

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
      error: { code: 'NOT_ACTIVE', message: 'Stock take is not in counting or review status' }
    });
  }

  const item = await StockTakeItem.findOne({
    where: { id: itemId, stock_take_id: id }
  });
  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Stock take item not found' }
    });
  }

  if (reason && !VALID_REASONS.includes(reason)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REASON', message: `Invalid reason. Valid: ${VALID_REASONS.join(', ')}` }
    });
  }

  const trimmedNotes = (notes || '').trim();
  const trimmedReason = (reason || '').trim() || null;

  if (!trimmedNotes && !trimmedReason) {
    // Delete note if both empty
    await StockTakeUnitNote.destroy({
      where: { stock_take_id: id, stock_take_item_id: itemId, asset_unit_id: unitId }
    });
    return res.json({ success: true, data: { reason: '', notes: '' }, message: 'Note removed' });
  }

  const [unitNote] = await StockTakeUnitNote.upsert({
    stock_take_id: parseInt(id),
    stock_take_item_id: parseInt(itemId),
    asset_unit_id: parseInt(unitId),
    reason: trimmedReason,
    notes: trimmedNotes || null,
    created_by: req.user?.id || null
  });

  res.json({ success: true, data: { reason: unitNote.reason || '', notes: unitNote.notes || '' }, message: 'Note saved' });
});

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

/**
 * GET /:id/batches
 * List all batches for a stock take, with scanned_count and status.
 */
exports.getBatches = asyncHandler(async (req, res) => {
  const stockTake = await StockTake.findByPk(req.params.id);
  if (!stockTake) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Stock take not found' }
    });
  }

  const batches = await StockTakeBatch.findAll({
    where: { stock_take_id: stockTake.id },
    include: [{ model: User, as: 'creator', attributes: ['id', 'full_name'] }],
    order: [['batch_number', 'DESC']]
  });

  res.json({ success: true, data: { batches } });
});

/**
 * POST /:id/batches/:batchId/close
 * Manually close/finish a batch (for partial batches < 20).
 */
exports.closeBatch = asyncHandler(async (req, res) => {
  const { id, batchId } = req.params;
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
      error: { code: 'NOT_COUNTING', message: 'Stock take is not in counting status' }
    });
  }

  const batch = await StockTakeBatch.findOne({
    where: { id: batchId, stock_take_id: id }
  });
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: { code: 'BATCH_NOT_FOUND', message: 'Batch not found' }
    });
  }
  if (batch.status === 'closed') {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_CLOSED', message: 'Batch is already closed' }
    });
  }

  batch.status = 'closed';
  batch.closed_at = new Date();
  await batch.save();

  // Create a new active batch
  const nextNum = batch.batch_number + 1;
  const newBatch = await StockTakeBatch.create({
    stock_take_id: id,
    batch_number: nextNum,
    status: 'active',
    target_size: 20,
    scanned_count: 0,
    started_at: new Date(),
    created_by: req.user?.id
  });

  res.json({
    success: true,
    data: { closedBatch: batch.toJSON(), newBatch: newBatch.toJSON() },
    message: `Batch #${batch.batch_number} closed (${batch.scanned_count} scans). Batch #${nextNum} started.`
  });
});

/**
 * GET /:id/batches/:batchId/scans
 * List all scans within a specific batch.
 */
exports.getBatchScans = asyncHandler(async (req, res) => {
  const { id, batchId } = req.params;

  const batch = await StockTakeBatch.findOne({
    where: { id: batchId, stock_take_id: id }
  });
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: { code: 'BATCH_NOT_FOUND', message: 'Batch not found' }
    });
  }

  const scans = await StockTakeScan.findAll({
    where: { stock_take_batch_id: batchId },
    include: [
      { model: AssetUnit, as: 'unit', attributes: ['id', 'serial_number', 'cpu', 'cpu_model', 'memory', 'storage'] },
      { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model'] },
      { model: User, as: 'scanner', attributes: ['id', 'full_name'] }
    ],
    order: [['scanned_at', 'ASC']]
  });

  res.json({
    success: true,
    data: { batch: batch.toJSON(), scans, count: scans.length }
  });
});

module.exports = exports;
