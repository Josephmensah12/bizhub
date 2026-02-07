const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const db = require('../models');

const User = db.User;

/**
 * Generate JWT token
 * Default expiry is 7 days for better user experience
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRY || '7d'
    }
  );
};

/**
 * POST /api/v1/auth/login
 * Authenticate user and return JWT token
 */
exports.login = asyncHandler(async (req, res, next) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    throw new AppError('Username and password are required', 400, 'VALIDATION_ERROR', {
      username: !username ? 'Username is required' : undefined,
      password: !password ? 'Password is required' : undefined
    });
  }

  // Find user
  const user = await User.findOne({ where: { username } });

  if (!user || !user.is_active) {
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }

  // Update last login
  await user.update({ last_login: new Date() });

  // Generate token
  const token = generateToken(user);

  // Return response
  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    },
    message: 'Login successful'
  });
});

/**
 * POST /api/v1/auth/logout
 * Logout (client-side token invalidation)
 */
exports.logout = asyncHandler(async (req, res, next) => {
  // In a JWT-based auth system, logout is handled client-side by removing the token
  // This endpoint is mostly for consistency and potential future server-side token blacklisting

  res.json({
    success: true,
    message: 'Logout successful'
  });
});

/**
 * GET /api/v1/auth/me
 * Get current authenticated user info
 */
exports.getCurrentUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByPk(req.user.id, {
    attributes: ['id', 'username', 'full_name', 'email', 'role', 'phone', 'is_active', 'created_at', 'last_login']
  });

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  res.json({
    success: true,
    data: user
  });
});

/**
 * POST /api/v1/auth/refresh
 * Refresh JWT token (get new token if current one is still valid)
 */
exports.refreshToken = asyncHandler(async (req, res, next) => {
  // User is already authenticated via middleware
  const user = await User.findByPk(req.user.id);

  if (!user || !user.is_active) {
    throw new AppError('User not found or inactive', 401, 'UNAUTHORIZED');
  }

  // Generate new token
  const token = generateToken(user);

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    },
    message: 'Token refreshed successfully'
  });
});
