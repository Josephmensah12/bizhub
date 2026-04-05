/**
 * Sourcing Controller
 *
 * CRUD operations for phone sourcing batches.
 */

const { SourcingBatch, AssetUnit, Asset, User, WarrantyClaim, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/sourcing
 * List sourcing batches with pagination and filters.
 */
exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, status, supplier_name } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  const where = {};
  if (status) where.status = status;
  if (supplier_name) where.supplier_name = { [Op.iLike]: `%${supplier_name}%` };

  const { rows: batches, count: total } = await SourcingBatch.findAndCountAll({
    where,
    attributes: {
      include: [
        [
          sequelize.literal(
            '(SELECT COUNT(*) FROM asset_units WHERE asset_units.sourcing_batch_id = "SourcingBatch".id)'
          ),
          'unit_count'
        ]
      ]
    },
    order: [['created_at', 'DESC']],
    limit: +limit,
    offset
  });

  return res.json({
    success: true,
    data: {
      batches,
      pagination: {
        page: +page,
        limit: +limit,
        total,
        totalPages: Math.ceil(total / +limit)
      }
    }
  });
});

/**
 * POST /api/v1/sourcing
 * Create a new sourcing batch.
 */
exports.create = asyncHandler(async (req, res) => {
  const data = { ...req.body, created_by: req.user.id };

  // Auto-compute warranty expiry
  if (data.arrival_date && data.warranty_days) {
    const arrival = new Date(data.arrival_date);
    arrival.setDate(arrival.getDate() + +data.warranty_days);
    data.warranty_expires_on = arrival;
  }

  const batch = await SourcingBatch.create(data);

  return res.status(201).json({
    success: true,
    data: batch
  });
});

/**
 * GET /api/v1/sourcing/:id
 * Get batch detail with units and warranty claims.
 */
exports.detail = asyncHandler(async (req, res) => {
  const batch = await SourcingBatch.findByPk(req.params.id, {
    include: [
      {
        model: AssetUnit,
        as: 'units',
        include: [{ model: Asset, as: 'asset', attributes: ['id', 'make', 'model'] }]
      },
      {
        model: WarrantyClaim,
        as: 'warrantyClaims'
      }
    ]
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Sourcing batch not found' }
    });
  }

  return res.json({ success: true, data: batch });
});

/**
 * PATCH /api/v1/sourcing/:id
 * Update a sourcing batch.
 */
exports.update = asyncHandler(async (req, res) => {
  const batch = await SourcingBatch.findByPk(req.params.id);
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Sourcing batch not found' }
    });
  }

  const updates = { ...req.body };

  // Auto-compute warranty expiry when arrival_date is being set
  if (updates.arrival_date) {
    const warrantyDays = updates.warranty_days || batch.warranty_days;
    if (warrantyDays) {
      const arrival = new Date(updates.arrival_date);
      arrival.setDate(arrival.getDate() + +warrantyDays);
      updates.warranty_expires_on = arrival;
    }
  }

  await batch.update(updates);

  return res.json({ success: true, data: batch });
});

/**
 * GET /api/v1/sourcing/:id/performance
 * Get performance metrics for a sourcing batch from the performance view.
 */
exports.performance = asyncHandler(async (req, res) => {
  const results = await sequelize.query(
    'SELECT * FROM view_sourcing_performance WHERE batch_id = :id',
    {
      replacements: { id: req.params.id },
      type: QueryTypes.SELECT
    }
  );

  return res.json({ success: true, data: results });
});
