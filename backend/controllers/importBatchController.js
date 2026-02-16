/**
 * Import Batch Controller
 *
 * Handles import history listing and admin rollback operations
 */

const { ImportBatch, Asset, User, sequelize } = require('../models');
const { Op } = require('sequelize');

// Async handler wrapper
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/import-batches
 * List all import batches with pagination
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = req.query;

  const offset = (page - 1) * limit;

  const where = {};
  if (status) where.status = status;

  const { count, rows } = await ImportBatch.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[sortBy, sortOrder]],
    include: [
      { model: User, as: 'createdBy', attributes: ['id', 'full_name', 'email'] },
      { model: User, as: 'revertedBy', attributes: ['id', 'full_name', 'email'] }
    ]
  });

  res.json({
    success: true,
    data: {
      batches: rows,
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
 * GET /api/v1/import-batches/:id
 * Get single import batch details
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const batch = await ImportBatch.findByPk(id, {
    include: [
      { model: User, as: 'createdBy', attributes: ['id', 'full_name', 'email'] },
      { model: User, as: 'revertedBy', attributes: ['id', 'full_name', 'email'] }
    ]
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Import batch not found'
      }
    });
  }

  // Get count of assets still linked to this batch (not deleted)
  const assetCount = await Asset.count({
    where: { import_batch_id: id }
  });

  res.json({
    success: true,
    data: {
      batch,
      currentAssetCount: assetCount
    }
  });
});

/**
 * GET /api/v1/import-batches/:id/assets
 * Get assets created by a specific import batch
 */
exports.getBatchAssets = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 50, includeDeleted = false } = req.query;

  const batch = await ImportBatch.findByPk(id);
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Import batch not found'
      }
    });
  }

  const offset = (page - 1) * limit;

  // Use paranoid: false to include soft-deleted assets if requested
  const queryOptions = {
    where: { import_batch_id: id },
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['created_at', 'ASC']],
    attributes: ['id', 'asset_tag', 'category', 'asset_type', 'make', 'model', 'serial_number', 'status', 'deleted_at']
  };

  if (includeDeleted === 'true') {
    queryOptions.paranoid = false;
  }

  const { count, rows } = await Asset.findAndCountAll(queryOptions);

  res.json({
    success: true,
    data: {
      assets: rows,
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
 * POST /api/v1/import-batches/:id/revert
 * Admin-only: Revert (soft-delete) all assets from an import batch
 */
exports.revert = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // Check admin permission
  if (!req.user?.role || !['Admin', 'Manager'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only Admin or Manager can revert import batches'
      }
    });
  }

  const batch = await ImportBatch.findByPk(id);
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Import batch not found'
      }
    });
  }

  // Check if already reverted
  if (batch.status === 'reverted') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'ALREADY_REVERTED',
        message: 'This import batch has already been reverted'
      }
    });
  }

  // Check if batch can be reverted (must be completed or completed_with_errors)
  if (!['completed', 'completed_with_errors'].includes(batch.status)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_STATUS',
        message: `Cannot revert batch with status: ${batch.status}`
      }
    });
  }

  // Count assets to be reverted
  const assetCount = await Asset.count({
    where: { import_batch_id: id }
  });

  if (assetCount === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NO_ASSETS',
        message: 'No assets to revert in this batch'
      }
    });
  }

  // Check for sold items (cannot delete sold items)
  const soldCount = await Asset.count({
    where: {
      import_batch_id: id,
      status: 'Sold'
    }
  });

  if (soldCount > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'HAS_SOLD_ITEMS',
        message: `Cannot revert: ${soldCount} items from this batch have been sold. Please handle them manually first.`
      }
    });
  }

  // Perform revert in transaction
  const transaction = await sequelize.transaction();

  try {
    // Soft-delete all assets from this batch (with audit trail)
    const [deletedCount] = await Asset.update(
      {
        deleted_at: new Date(),
        deleted_by: req.user?.id
      },
      {
        where: {
          import_batch_id: id,
          deleted_at: null
        },
        transaction
      }
    );

    // Update batch status
    await batch.update({
      status: 'reverted',
      reverted_at: new Date(),
      reverted_by_user_id: req.user?.id,
      revert_reason: reason || null
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      data: {
        deletedCount,
        batch: await ImportBatch.findByPk(id, {
          include: [
            { model: User, as: 'createdBy', attributes: ['id', 'full_name'] },
            { model: User, as: 'revertedBy', attributes: ['id', 'full_name'] }
          ]
        })
      },
      message: `Successfully reverted ${deletedCount} assets from import batch`
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * GET /api/v1/import-batches/:id/error-report
 * Download error report for a batch
 */
exports.getErrorReport = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const batch = await ImportBatch.findByPk(id);
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Import batch not found'
      }
    });
  }

  if (!batch.error_report_json || batch.error_report_json.length === 0) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NO_ERRORS',
        message: 'No error report available for this batch'
      }
    });
  }

  res.json({
    success: true,
    data: {
      batchId: id,
      fileName: batch.original_file_name,
      errors: batch.error_report_json
    }
  });
});

module.exports = exports;
