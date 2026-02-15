const { Asset, User, InventoryItemEvent, sequelize } = require('../models');
const { Op } = require('sequelize');
const { generateAssetTag } = require('../utils/assetTagGenerator');
const { getReservedQuantity } = require('../services/inventoryAvailabilityService');
const { validationResult } = require('express-validator');
const { getValuationSummary } = require('../services/valuationService');
const { sanitizeAssetForRole, canSeeCost } = require('../middleware/permissions');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/v1/assets
 * List assets with pagination, search, and filters
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = '',
    category,
    assetType,
    status,
    condition,
    make,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = req.query;

  const offset = (page - 1) * limit;

  // Build where clause
  const where = {};

  if (search) {
    where[Op.or] = [
      { asset_tag: { [Op.iLike]: `%${search}%` } },
      { serial_number: { [Op.iLike]: `%${search}%` } },
      { make: { [Op.iLike]: `%${search}%` } },
      { model: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Handle multi-select filters (comma-separated values)
  if (category) {
    const categories = category.split(',').map(c => c.trim()).filter(Boolean);
    where.category = categories.length === 1 ? categories[0] : { [Op.in]: categories };
  }
  if (assetType) {
    const types = assetType.split(',').map(t => t.trim()).filter(Boolean);
    where.asset_type = types.length === 1 ? types[0] : { [Op.in]: types };
  }
  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { [Op.in]: statuses };
  }
  if (condition) {
    const conditions = condition.split(',').map(c => c.trim()).filter(Boolean);
    where.condition = conditions.length === 1 ? conditions[0] : { [Op.in]: conditions };
  }
  if (make) {
    const makes = make.split(',').map(m => m.trim()).filter(Boolean);
    if (makes.length === 1) {
      where.make = { [Op.iLike]: `%${makes[0]}%` };
    } else {
      where.make = { [Op.or]: makes.map(m => ({ [Op.iLike]: `%${m}%` })) };
    }
  }

  const { count, rows } = await Asset.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[sortBy, sortOrder]],
    include: [
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      { model: User, as: 'updater', attributes: ['id', 'full_name'] }
    ],
    attributes: {
      include: [
        [
          sequelize.literal(`(
            SELECT COALESCE(SUM(ii.quantity), 0)
            FROM invoice_items ii
            JOIN invoices i ON ii.invoice_id = i.id
            WHERE ii.asset_id = "Asset"."id"
              AND i.status NOT IN ('CANCELLED', 'PAID')
              AND ii.voided_at IS NULL
          )`),
          'reserved_quantity'
        ],
        [
          sequelize.literal(`(
            "Asset"."quantity" - (
              SELECT COALESCE(SUM(ii.quantity), 0)
              FROM invoice_items ii
              JOIN invoices i ON ii.invoice_id = i.id
              WHERE ii.asset_id = "Asset"."id"
                AND i.status NOT IN ('CANCELLED', 'PAID')
                AND ii.voided_at IS NULL
            )
          )`),
          'available_quantity'
        ]
      ]
    }
  });

  res.json({
    success: true,
    data: {
      assets: rows.map(a => sanitizeAssetForRole(a, req.user?.role)),
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
 * GET /api/v1/assets/:id
 * Get single asset by ID
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const asset = await Asset.findByPk(id, {
    include: [
      { model: User, as: 'creator', attributes: ['id', 'full_name', 'email'] },
      { model: User, as: 'updater', attributes: ['id', 'full_name', 'email'] }
    ]
  });

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Asset not found'
      }
    });
  }

  res.json({
    success: true,
    data: { asset: sanitizeAssetForRole(asset, req.user?.role) }
  });
});

/**
 * POST /api/v1/assets
 * Create new asset
 */
exports.create = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array()
      }
    });
  }

  // Generate asset tag
  const assetTag = await generateAssetTag();

  const assetData = {
    ...req.body,
    asset_tag: assetTag,
    created_by: req.user?.id,
    updated_by: req.user?.id
  };

  const asset = await Asset.create(assetData);

  // Log creation event
  await InventoryItemEvent.logCreated(asset, req.user?.id);

  res.status(201).json({
    success: true,
    data: { asset },
    message: 'Asset created successfully'
  });
});

/**
 * PUT /api/v1/assets/:id
 * Update asset
 */
exports.update = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array()
      }
    });
  }

  const { id } = req.params;
  const asset = await Asset.findByPk(id);

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Asset not found'
      }
    });
  }

  // Prevent updating immutable fields
  const updateData = { ...req.body };
  delete updateData.asset_tag;
  delete updateData.id;
  updateData.updated_by = req.user?.id;

  // Capture before values for logging
  const trackableFields = ['status', 'condition', 'price', 'cost', 'make', 'model', 'serial_number', 'specs', 'category', 'asset_type'];
  const beforeValues = {};
  const afterValues = {};
  const changedFields = [];

  for (const field of trackableFields) {
    if (updateData[field] !== undefined && updateData[field] !== asset[field]) {
      changedFields.push(field);
      beforeValues[field] = asset[field];
      afterValues[field] = updateData[field];
    }
  }

  await asset.update(updateData);

  // Log update event if there were tracked changes
  if (changedFields.length > 0) {
    await InventoryItemEvent.logUpdated(asset, changedFields, beforeValues, afterValues, req.user?.id);
  }

  res.json({
    success: true,
    data: { asset },
    message: 'Asset updated successfully'
  });
});

/**
 * DELETE /api/v1/assets/:id
 * Delete asset (soft delete)
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const asset = await Asset.findByPk(id);

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Asset not found'
      }
    });
  }

  // Check if asset has active reservations (on any non-cancelled invoice)
  const reserved = await getReservedQuantity(asset.id);
  if (reserved > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CANNOT_DELETE_RESERVED',
        message: 'Cannot delete items that are on active invoices'
      }
    });
  }

  // Set deleted_by before soft delete
  await asset.update({ deleted_by: req.user?.id });
  await asset.destroy();

  // Log soft delete event
  await InventoryItemEvent.logSoftDeleted(asset, req.user?.id);

  res.json({
    success: true,
    data: { deletedIds: [asset.id] },
    message: 'Asset deleted successfully'
  });
});

/**
 * DELETE /api/v1/assets/bulk
 * Bulk delete multiple assets (soft delete)
 */
exports.bulkDelete = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'ids must be a non-empty array of asset IDs'
      }
    });
  }

  // Limit bulk delete to prevent abuse
  if (ids.length > 100) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TOO_MANY_ITEMS',
        message: 'Cannot delete more than 100 items at once'
      }
    });
  }

  // Find all assets
  const assets = await Asset.findAll({
    where: { id: { [Op.in]: ids } }
  });

  const foundIds = assets.map(a => a.id);
  const notFoundIds = ids.filter(id => !foundIds.includes(id));

  // Check for assets with active reservations
  const { computeBulkAvailability } = require('../services/inventoryAvailabilityService');
  const availabilityMap = await computeBulkAvailability(foundIds);
  const reservedAssets = assets.filter(a => {
    const info = availabilityMap.get(a.id);
    return info && info.reserved > 0;
  });
  if (reservedAssets.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'HAS_RESERVED_ITEMS',
        message: `Cannot delete ${reservedAssets.length} item(s) that are on active invoices. Remove them from selection.`,
        reservedIds: reservedAssets.map(a => a.id)
      }
    });
  }

  // Set deleted_by on all assets before soft delete
  await Asset.update(
    { deleted_by: req.user?.id },
    { where: { id: { [Op.in]: foundIds } } }
  );

  // Soft delete found assets
  const deletedCount = await Asset.destroy({
    where: { id: { [Op.in]: foundIds } }
  });

  // Log soft delete events for each asset
  for (const asset of assets) {
    await InventoryItemEvent.logSoftDeleted(asset, req.user?.id);
  }

  res.json({
    success: true,
    data: {
      deletedCount,
      deletedIds: foundIds, // Return deleted IDs for undo functionality
      requestedCount: ids.length,
      notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
    },
    message: `Successfully deleted ${deletedCount} asset(s)`
  });
});

/**
 * GET /api/v1/assets/filters/options
 * Get filter options (unique values for filters)
 */
exports.getFilterOptions = asyncHandler(async (req, res) => {
  const assetTypes = await Asset.findAll({
    attributes: ['asset_type'],
    group: ['asset_type'],
    raw: true
  });

  const statuses = await Asset.findAll({
    attributes: ['status'],
    group: ['status'],
    raw: true
  });

  const conditions = await Asset.findAll({
    attributes: ['condition'],
    where: { condition: { [Op.ne]: null } },
    group: ['condition'],
    raw: true
  });

  const makes = await Asset.findAll({
    attributes: ['make'],
    group: ['make'],
    raw: true
  });

  res.json({
    success: true,
    data: {
      assetTypes: assetTypes.map(a => a.asset_type),
      statuses: statuses.map(s => s.status),
      conditions: conditions.map(c => c.condition),
      makes: makes.map(m => m.make)
    }
  });
});

/**
 * GET /api/v1/assets/export/template
 * Download import template
 */
exports.downloadTemplate = asyncHandler(async (req, res) => {
  const { format = 'csv' } = req.query;

  const headers = [
    'assetType',
    'serialNumber',
    'make',
    'model',
    'status',
    'condition',
    'quantity',
    'category',
    'subcategory',
    'specs',
    'ramGB',
    'storageGB',
    'storageType',
    'cpu',
    'gpu',
    'screenSizeInches',
    'resolution',
    'batteryHealthPercent',
    'majorCharacteristics',
    'cost',
    'price',
    'currency'
  ];

  const sampleRow = [
    'Laptop',
    'SN123456789',
    'HP',
    'EliteBook 840 G8',
    'In Stock',
    'Renewed',
    '1',
    'Laptops',
    'Business',
    'Intel i7, 16GB RAM, 512GB SSD',
    '16',
    '512',
    'SSD',
    'Intel Core i7-1165G7',
    'Intel Iris Xe',
    '14',
    '1920x1080',
    '85',
    'Touchscreen,Backlit keyboard,Fingerprint',
    '800',
    '1200',
    'GHS'
  ];

  if (format === 'csv') {
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=asset-import-template.csv');
    res.send(csv);
  } else {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FORMAT',
        message: 'Only CSV format is supported for now'
      }
    });
  }
});

/**
 * GET /api/v1/assets/valuation-summary
 * Get inventory valuation summary with cascading breakdown
 */
exports.getValuationSummary = asyncHandler(async (req, res) => {
  const { category, assetType, status, condition, make } = req.query;

  const filters = {};
  if (category) filters.category = category;
  if (assetType) filters.assetType = assetType;
  if (status) filters.status = status;
  if (condition) filters.condition = condition;
  if (make) filters.make = make;

  const summary = await getValuationSummary(filters);

  // Strip cost/profit data for non-privileged roles
  if (!canSeeCost(req.user?.role)) {
    if (summary.totals) {
      delete summary.totals.totalCost;
      delete summary.totals.projectedProfit;
      delete summary.totals.markupPercent;
    }
    if (summary.breakdown) {
      summary.breakdown = summary.breakdown.map(b => {
        const { totalCost, profit, markupPercent, ...rest } = b;
        return rest;
      });
    }
  }

  res.json({
    success: true,
    data: summary
  });
});

/**
 * GET /api/v1/assets/deleted
 * List soft-deleted assets (Recycle Bin)
 */
exports.listDeleted = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = '',
    category,
    assetType,
    sortBy = 'deleted_at',
    sortOrder = 'DESC'
  } = req.query;

  const offset = (page - 1) * limit;

  // Build where clause
  const where = {};

  if (search) {
    where[Op.or] = [
      { asset_tag: { [Op.iLike]: `%${search}%` } },
      { serial_number: { [Op.iLike]: `%${search}%` } },
      { make: { [Op.iLike]: `%${search}%` } },
      { model: { [Op.iLike]: `%${search}%` } }
    ];
  }

  if (category) where.category = category;
  if (assetType) where.asset_type = assetType;

  // Use paranoid: false to include soft-deleted items
  // and filter to ONLY show deleted items
  const { count, rows } = await Asset.findAndCountAll({
    where: {
      ...where,
      deleted_at: { [Op.ne]: null }
    },
    paranoid: false, // Include soft-deleted records
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[sortBy, sortOrder]],
    include: [
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      { model: User, as: 'deleter', attributes: ['id', 'full_name'] }
    ]
  });

  res.json({
    success: true,
    data: {
      assets: rows.map(a => sanitizeAssetForRole(a, req.user?.role)),
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
 * POST /api/v1/assets/restore
 * Restore soft-deleted assets
 */
exports.restore = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'ids must be a non-empty array of asset IDs'
      }
    });
  }

  // Limit restore to prevent abuse
  if (ids.length > 100) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TOO_MANY_ITEMS',
        message: 'Cannot restore more than 100 items at once'
      }
    });
  }

  // Find soft-deleted assets with paranoid: false
  const deletedAssets = await Asset.findAll({
    where: {
      id: { [Op.in]: ids },
      deleted_at: { [Op.ne]: null }
    },
    paranoid: false
  });

  const foundIds = deletedAssets.map(a => a.id);
  const notFoundIds = ids.filter(id => !foundIds.includes(id));

  if (foundIds.length === 0) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'No deleted assets found with the provided IDs'
      }
    });
  }

  // Restore assets by clearing deleted_at and deleted_by
  const [restoredCount] = await Asset.update(
    {
      deleted_at: null,
      deleted_by: null
    },
    {
      where: { id: { [Op.in]: foundIds } },
      paranoid: false // Allow updating soft-deleted records
    }
  );

  // Log restore events for each asset
  for (const asset of deletedAssets) {
    await InventoryItemEvent.logRestored(asset, req.user?.id);
  }

  res.json({
    success: true,
    data: {
      restoredCount,
      restoredIds: foundIds,
      requestedCount: ids.length,
      notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined
    },
    message: `Successfully restored ${restoredCount} asset(s)`
  });
});

/**
 * DELETE /api/v1/assets/permanent
 * Permanently delete soft-deleted assets (Admin only)
 */
exports.permanentDelete = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  // Check admin permission
  if (!req.user?.role || !['Admin', 'Manager'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only Admin or Manager can permanently delete assets'
      }
    });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'ids must be a non-empty array of asset IDs'
      }
    });
  }

  // Limit permanent delete
  if (ids.length > 50) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TOO_MANY_ITEMS',
        message: 'Cannot permanently delete more than 50 items at once'
      }
    });
  }

  // Find soft-deleted assets only (paranoid: false to see them)
  const deletedAssets = await Asset.findAll({
    where: {
      id: { [Op.in]: ids },
      deleted_at: { [Op.ne]: null } // Must already be soft-deleted
    },
    paranoid: false
  });

  const foundIds = deletedAssets.map(a => a.id);

  if (foundIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NOT_DELETED',
        message: 'Can only permanently delete items that are already in the recycle bin'
      }
    });
  }

  // Check for assets with active reservations (extra safety)
  const { computeBulkAvailability: computeBulkAvailPerm } = require('../services/inventoryAvailabilityService');
  const permAvailMap = await computeBulkAvailPerm(foundIds);
  const permReservedAssets = deletedAssets.filter(a => {
    const info = permAvailMap.get(a.id);
    return info && info.reserved > 0;
  });
  if (permReservedAssets.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'HAS_RESERVED_ITEMS',
        message: `Cannot permanently delete ${permReservedAssets.length} item(s) that are on active invoices`,
        reservedIds: permReservedAssets.map(a => a.id)
      }
    });
  }

  // Permanently delete (force: true bypasses paranoid)
  const deletedCount = await Asset.destroy({
    where: { id: { [Op.in]: foundIds } },
    force: true // Permanent delete
  });

  res.json({
    success: true,
    data: {
      deletedCount,
      deletedIds: foundIds
    },
    message: `Permanently deleted ${deletedCount} asset(s)`
  });
});

/**
 * GET /api/v1/assets/:id/history
 * Get history/audit timeline for an inventory item
 */
exports.getHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const offset = (page - 1) * limit;

  // Verify asset exists (including soft-deleted)
  const asset = await Asset.findByPk(id, { paranoid: false });

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Asset not found'
      }
    });
  }

  // Get events with pagination
  const { count, rows: events } = await InventoryItemEvent.findAndCountAll({
    where: { inventory_item_id: id },
    order: [['occurred_at', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset),
    include: [
      { model: User, as: 'actor', attributes: ['id', 'full_name', 'email'] }
    ]
  });

  // Transform events for frontend display
  const formattedEvents = events.map(event => ({
    id: event.id,
    eventType: event.event_type,
    label: event.getEventLabel(),
    occurredAt: event.occurred_at,
    source: event.source,
    summary: event.summary,
    details: event.details_json,
    referenceType: event.reference_type,
    referenceId: event.reference_id,
    actor: event.actor ? {
      id: event.actor.id,
      name: event.actor.full_name
    } : null
  }));

  res.json({
    success: true,
    data: {
      events: formattedEvents,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    }
  });
});
