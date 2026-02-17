/**
 * Condition Status Controller
 *
 * CRUD for configurable asset condition statuses with valuation rules.
 */

const { ConditionStatus, Asset, sequelize } = require('../models');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

/**
 * GET /api/v1/condition-statuses
 * List all condition statuses ordered by sort_order
 */
exports.list = asyncHandler(async (req, res) => {
  const statuses = await ConditionStatus.findAll({
    order: [['sort_order', 'ASC'], ['name', 'ASC']]
  });

  res.json({
    success: true,
    data: { conditionStatuses: statuses }
  });
});

/**
 * POST /api/v1/condition-statuses
 * Create a new condition status (Admin only)
 */
exports.create = asyncHandler(async (req, res) => {
  const { name, valuation_rule, valuation_value, color, sort_order, is_default } = req.body;

  if (!name || !name.trim()) {
    throw new AppError('Name is required', 400, 'VALIDATION_ERROR');
  }

  const result = await sequelize.transaction(async (transaction) => {
    // If setting as default, unset existing default
    if (is_default) {
      await ConditionStatus.update(
        { is_default: false },
        { where: { is_default: true }, transaction }
      );
    }

    const status = await ConditionStatus.create({
      name: name.trim(),
      valuation_rule: valuation_rule || 'selling_price',
      valuation_value: valuation_value != null ? valuation_value : null,
      color: color || '#6b7280',
      sort_order: sort_order != null ? sort_order : 0,
      is_default: is_default || false
    }, { transaction });

    return status;
  });

  res.status(201).json({
    success: true,
    data: { conditionStatus: result }
  });
});

/**
 * PUT /api/v1/condition-statuses/:id
 * Update a condition status (Admin only)
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, valuation_rule, valuation_value, color, sort_order, is_default } = req.body;

  const status = await ConditionStatus.findByPk(id);
  if (!status) {
    throw new AppError('Condition status not found', 404, 'NOT_FOUND');
  }

  await sequelize.transaction(async (transaction) => {
    // If setting as default, unset existing default
    if (is_default && !status.is_default) {
      await ConditionStatus.update(
        { is_default: false },
        { where: { is_default: true }, transaction }
      );
    }

    if (name !== undefined) status.name = name.trim();
    if (valuation_rule !== undefined) status.valuation_rule = valuation_rule;
    if (valuation_value !== undefined) status.valuation_value = valuation_value;
    if (color !== undefined) status.color = color;
    if (sort_order !== undefined) status.sort_order = sort_order;
    if (is_default !== undefined) status.is_default = is_default;

    await status.save({ transaction });
  });

  res.json({
    success: true,
    data: { conditionStatus: status }
  });
});

/**
 * DELETE /api/v1/condition-statuses/:id
 * Delete a condition status (Admin only, blocked if assets use it)
 */
exports.remove = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const status = await ConditionStatus.findByPk(id);
  if (!status) {
    throw new AppError('Condition status not found', 404, 'NOT_FOUND');
  }

  // Check if any assets use this condition
  const assetCount = await Asset.count({ where: { condition_status_id: id } });
  if (assetCount > 0) {
    throw new AppError(
      `Cannot delete: ${assetCount} asset(s) are using this condition status. Reassign them first.`,
      400,
      'IN_USE'
    );
  }

  await status.destroy();

  res.json({
    success: true,
    data: { message: 'Condition status deleted' }
  });
});

/**
 * PUT /api/v1/condition-statuses/:id/set-default
 * Set a condition status as the default (unsets previous default)
 */
exports.setDefault = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const status = await ConditionStatus.findByPk(id);
  if (!status) {
    throw new AppError('Condition status not found', 404, 'NOT_FOUND');
  }

  await sequelize.transaction(async (transaction) => {
    await ConditionStatus.update(
      { is_default: false },
      { where: { is_default: true }, transaction }
    );
    status.is_default = true;
    await status.save({ transaction });
  });

  res.json({
    success: true,
    data: { conditionStatus: status }
  });
});
