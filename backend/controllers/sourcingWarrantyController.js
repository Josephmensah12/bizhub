/**
 * Sourcing Warranty Controller
 *
 * Manage warranty claims for sourcing batches.
 */

const { SourcingBatch, AssetUnit, WarrantyClaim, sequelize } = require('../models');
const { Op } = require('sequelize');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/sourcing/warranty/claims
 * List warranty claims with pagination and filters.
 */
exports.listClaims = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, sourcing_batch_id, status } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  const where = {};
  if (sourcing_batch_id) where.sourcing_batch_id = sourcing_batch_id;
  if (status) where.status = status;

  const { rows: claims, count: total } = await WarrantyClaim.findAndCountAll({
    where,
    include: [
      {
        model: AssetUnit,
        as: 'unit',
        attributes: ['id', 'serial_number']
      },
      {
        model: SourcingBatch,
        as: 'batch',
        attributes: ['id', 'batch_reference', 'supplier_name']
      }
    ],
    order: [['created_at', 'DESC']],
    limit: +limit,
    offset
  });

  return res.json({
    success: true,
    data: {
      claims,
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
 * POST /api/v1/sourcing/warranty/claims
 * Create a new warranty claim.
 */
exports.createClaim = asyncHandler(async (req, res) => {
  const { sourcing_batch_id, asset_unit_id } = req.body;

  // Validate batch exists
  const batch = await SourcingBatch.findByPk(sourcing_batch_id);
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Sourcing batch not found' }
    });
  }

  // Validate unit belongs to batch
  const unit = await AssetUnit.findOne({
    where: { id: asset_unit_id, sourcing_batch_id }
  });
  if (!unit) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_UNIT', message: 'Unit does not belong to this sourcing batch' }
    });
  }

  // Check warranty hasn't expired
  if (batch.warranty_expires_on && new Date(batch.warranty_expires_on) < new Date()) {
    return res.status(400).json({
      success: false,
      error: { code: 'WARRANTY_EXPIRED', message: 'Warranty has expired for this batch' }
    });
  }

  const claim = await WarrantyClaim.create({
    ...req.body,
    created_by: req.user.id
  });

  return res.status(201).json({ success: true, data: claim });
});

/**
 * PATCH /api/v1/sourcing/warranty/claims/:id
 * Update a warranty claim. Handles refund logic when status set to 'refunded'.
 */
exports.updateClaim = asyncHandler(async (req, res) => {
  const claim = await WarrantyClaim.findByPk(req.params.id);
  if (!claim) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Warranty claim not found' }
    });
  }

  const updates = { ...req.body };

  // Handle refund logic
  if (updates.status === 'refunded' && updates.refund_amount_usd > 0) {
    const result = await sequelize.transaction(async (transaction) => {
      const batch = await SourcingBatch.findByPk(claim.sourcing_batch_id, { transaction });
      const refundGhs = parseFloat(updates.refund_amount_usd) * parseFloat(batch.fx_rate_at_purchase || 1);
      updates.refund_amount_ghs = refundGhs;

      const unit = await AssetUnit.findByPk(claim.asset_unit_id, { transaction });

      if (updates.resolution_type === 'full_refund') {
        unit.landed_cost_ghs = 0;
        unit.status = 'Returned to Supplier';
      } else {
        unit.landed_cost_ghs = Math.max(0, parseFloat(unit.landed_cost_ghs || 0) - refundGhs);
      }

      await unit.save({ transaction });
      await claim.update(updates, { transaction });

      if (typeof batch.recomputeTotals === 'function') {
        await batch.recomputeTotals(transaction);
      }

      return claim;
    });

    return res.json({ success: true, data: result });
  }

  await claim.update(updates);
  return res.json({ success: true, data: claim });
});

/**
 * GET /api/v1/sourcing/warranty/expiring
 * Find batches with warranties expiring within N days.
 */
exports.expiring = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 7;
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  const batches = await SourcingBatch.findAll({
    where: {
      warranty_expires_on: {
        [Op.gte]: now,
        [Op.lte]: future
      }
    },
    include: [
      {
        model: AssetUnit,
        as: 'units',
        where: {
          status: { [Op.ne]: 'Sold' }
        },
        required: false
      }
    ],
    order: [['warranty_expires_on', 'ASC']]
  });

  // Filter out units that have open claims
  const result = [];
  for (const batch of batches) {
    const batchData = batch.toJSON();
    if (batchData.units && batchData.units.length > 0) {
      const unitIds = batchData.units.map(u => u.id);
      const openClaims = await WarrantyClaim.findAll({
        where: {
          asset_unit_id: { [Op.in]: unitIds },
          status: { [Op.notIn]: ['resolved', 'refunded', 'rejected'] }
        },
        attributes: ['asset_unit_id']
      });
      const claimedUnitIds = new Set(openClaims.map(c => c.asset_unit_id));
      batchData.units = batchData.units.filter(u => !claimedUnitIds.has(u.id));
    }
    result.push(batchData);
  }

  return res.json({ success: true, data: result });
});
