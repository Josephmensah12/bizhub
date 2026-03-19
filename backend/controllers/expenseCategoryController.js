/**
 * Expense Category Controller
 * CRUD for expense categories with sensitive-category filtering.
 */

const { ExpenseCategory, sequelize } = require('../models');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/expense-categories
 * List categories. Non-admin users cannot see sensitive categories.
 */
exports.list = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'Admin';

  const where = {};
  if (!isAdmin) {
    where.is_sensitive = false;
  }
  if (req.query.active !== undefined) {
    where.is_active = req.query.active === 'true';
  }

  const categories = await ExpenseCategory.findAll({
    where,
    order: [['sort_order', 'ASC'], ['name', 'ASC']]
  });

  res.json({ success: true, data: { categories } });
});

/**
 * POST /api/v1/expense-categories
 * Create a new category (Admin only).
 */
exports.create = asyncHandler(async (req, res) => {
  const { name, is_sensitive, is_active, sort_order } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Category name is required' }
    });
  }

  const category = await ExpenseCategory.create({
    name: name.trim(),
    is_sensitive: is_sensitive || false,
    is_active: is_active !== undefined ? is_active : true,
    sort_order: sort_order || 0
  });

  res.status(201).json({ success: true, data: { category } });
});

/**
 * PATCH /api/v1/expense-categories/:id
 * Update a category (Admin only).
 */
exports.update = asyncHandler(async (req, res) => {
  const category = await ExpenseCategory.findByPk(req.params.id);
  if (!category) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Category not found' }
    });
  }

  const { name, is_sensitive, is_active, sort_order } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (is_sensitive !== undefined) updates.is_sensitive = is_sensitive;
  if (is_active !== undefined) updates.is_active = is_active;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  await category.update(updates);

  res.json({ success: true, data: { category } });
});

/**
 * DELETE /api/v1/expense-categories/:id
 * Soft-deactivate a category (Admin only).
 */
exports.remove = asyncHandler(async (req, res) => {
  const category = await ExpenseCategory.findByPk(req.params.id);
  if (!category) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Category not found' }
    });
  }

  await category.update({ is_active: false });
  res.json({ success: true, message: 'Category deactivated' });
});
