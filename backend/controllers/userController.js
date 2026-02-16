/**
 * User Controller
 * CRUD operations for user management (Admin only, list/view for Manager)
 */

const bcrypt = require('bcrypt');
const { User, ActivityLog } = require('../models');
const { Op } = require('sequelize');
const { defaultMaxDiscount } = require('../middleware/permissions');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const VALID_ROLES = ['Admin', 'Manager', 'Sales', 'Technician', 'Warehouse'];

/**
 * GET /api/v1/users
 * List users (Admin + Manager)
 */
exports.list = asyncHandler(async (req, res) => {
  const { role, is_active, search, page = 1, limit = 50 } = req.query;

  const where = {};
  if (role) where.role = role;
  if (is_active !== undefined) where.is_active = is_active === 'true';
  if (search) {
    where[Op.or] = [
      { username: { [Op.iLike]: `%${search}%` } },
      { full_name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: { exclude: ['password_hash'] },
    order: [['full_name', 'ASC']],
    limit: parseInt(limit),
    offset
  });

  res.json({
    success: true,
    data: {
      users: rows,
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
 * GET /api/v1/users/:id
 * Get single user (Admin + Manager)
 */
exports.getById = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    attributes: { exclude: ['password_hash'] }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }

  res.json({ success: true, data: { user } });
});

/**
 * POST /api/v1/users
 * Create user (Admin only)
 */
exports.create = asyncHandler(async (req, res) => {
  const { username, email, password, role, full_name, phone, max_discount_percent } = req.body;

  // Validate required fields
  if (!username || !email || !password || !role || !full_name) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'username, email, password, role, and full_name are required' }
    });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' }
    });
  }

  // Check uniqueness
  const existing = await User.findOne({
    where: { [Op.or]: [{ username }, { email }] }
  });
  if (existing) {
    const field = existing.username === username ? 'username' : 'email';
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE', message: `A user with this ${field} already exists` }
    });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const discountValue = max_discount_percent !== undefined
    ? max_discount_percent
    : defaultMaxDiscount(role);

  const user = await User.create({
    username,
    email,
    password_hash,
    role,
    full_name,
    phone: phone || null,
    max_discount_percent: discountValue
  });

  // Return without password_hash
  const userData = user.toJSON();
  delete userData.password_hash;

  await ActivityLog.log({
    actionType: 'USER_CREATED',
    entityType: 'USER',
    entityId: user.id,
    userId: req.user.id,
    summary: `Created user ${user.full_name} (${user.role})`,
    metadata: { username: user.username, role: user.role }
  });

  res.status(201).json({ success: true, data: { user: userData } });
});

/**
 * PUT /api/v1/users/:id
 * Update user (Admin only)
 */
exports.update = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }

  const { username, email, role, full_name, phone, is_active, max_discount_percent } = req.body;

  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }
    });
  }

  // Last admin protection: prevent removing the last active Admin
  if (user.role === 'Admin' && ((role && role !== 'Admin') || (is_active === false))) {
    const adminCount = await User.count({ where: { role: 'Admin', is_active: true } });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'LAST_ADMIN', message: 'Cannot remove the last active Admin. Promote another user first.' }
      });
    }
  }

  // Check uniqueness if changing username/email
  if (username && username !== user.username) {
    const dup = await User.findOne({ where: { username } });
    if (dup) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Username already taken' }
      });
    }
    user.username = username;
  }

  if (email && email !== user.email) {
    const dup = await User.findOne({ where: { email } });
    if (dup) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Email already in use' }
      });
    }
    user.email = email;
  }

  if (role) user.role = role;
  if (full_name) user.full_name = full_name;
  if (phone !== undefined) user.phone = phone || null;
  if (is_active !== undefined) user.is_active = is_active;
  if (max_discount_percent !== undefined) user.max_discount_percent = max_discount_percent;

  await user.save();

  await ActivityLog.log({
    actionType: 'USER_UPDATED',
    entityType: 'USER',
    entityId: user.id,
    userId: req.user.id,
    summary: `Updated user ${user.full_name}`,
    metadata: { changes: Object.keys(req.body) }
  });

  const userData = user.toJSON();
  delete userData.password_hash;

  res.json({ success: true, data: { user: userData } });
});

/**
 * DELETE /api/v1/users/:id
 * Deactivate user (Admin only) — soft deactivation, not hard delete
 */
exports.deactivate = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }

  // Prevent self-deactivation
  if (user.id === req.user.id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Cannot deactivate your own account' }
    });
  }

  // Last admin protection
  if (user.role === 'Admin') {
    const adminCount = await User.count({ where: { role: 'Admin', is_active: true } });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'LAST_ADMIN', message: 'Cannot remove the last active Admin. Promote another user first.' }
      });
    }
  }

  user.is_active = false;
  await user.save();

  await ActivityLog.log({
    actionType: 'USER_DEACTIVATED',
    entityType: 'USER',
    entityId: user.id,
    userId: req.user.id,
    summary: `Deactivated user ${user.full_name}`
  });

  res.json({ success: true, message: 'User deactivated' });
});

/**
 * POST /api/v1/users/:id/reset-password
 * Admin resets another user's password
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }

  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'new_password is required and must be at least 6 characters' }
    });
  }

  user.password_hash = await bcrypt.hash(new_password, 10);
  await user.save();

  await ActivityLog.log({
    actionType: 'PASSWORD_RESET',
    entityType: 'USER',
    entityId: user.id,
    userId: req.user.id,
    summary: `Admin reset password for ${user.full_name}`
  });

  res.json({ success: true, message: 'Password reset successfully' });
});

/**
 * POST /api/v1/users/change-password
 * Any authenticated user changes their own password
 */
exports.changeOwnPassword = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'current_password and new_password are required' }
    });
  }

  if (new_password.length < 6) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 6 characters' }
    });
  }

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' }
    });
  }

  user.password_hash = await bcrypt.hash(new_password, 10);
  await user.save();

  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = exports;
