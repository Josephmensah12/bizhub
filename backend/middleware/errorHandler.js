/**
 * Error handling middleware for Express
 */

const errorHandler = (err, req, res, next) => {
  // Log error for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }

  // Default error response
  let statusCode = err.statusCode || 500;
  let errorResponse = {
    success: false,
    error: {
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'An unexpected error occurred'
    }
  };

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    errorResponse.error.code = 'VALIDATION_ERROR';
    errorResponse.error.message = 'Validation failed';
    errorResponse.error.fields = {};

    err.errors.forEach(error => {
      errorResponse.error.fields[error.path] = error.message;
    });
  }

  // Sequelize unique constraint errors
  else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    errorResponse.error.code = 'DUPLICATE_ENTRY';
    errorResponse.error.message = 'A record with this value already exists';
    errorResponse.error.fields = {};

    err.errors.forEach(error => {
      errorResponse.error.fields[error.path] = `${error.path} must be unique`;
    });
  }

  // Sequelize foreign key constraint errors
  else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    errorResponse.error.code = 'FOREIGN_KEY_ERROR';
    errorResponse.error.message = 'Referenced record does not exist';
  }

  // JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorResponse.error.code = 'INVALID_TOKEN';
    errorResponse.error.message = 'Invalid authentication token';
  }

  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorResponse.error.code = 'TOKEN_EXPIRED';
    errorResponse.error.message = 'Authentication token has expired';
  }

  // Express-validator errors
  else if (err.array && typeof err.array === 'function') {
    statusCode = 400;
    errorResponse.error.code = 'VALIDATION_ERROR';
    errorResponse.error.message = 'Validation failed';
    errorResponse.error.fields = {};

    err.array().forEach(error => {
      errorResponse.error.fields[error.param] = error.msg;
    });
  }

  // Custom application errors with fields
  else if (err.fields) {
    errorResponse.error.fields = err.fields;
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.error.message = 'An unexpected error occurred';
    delete errorResponse.error.stack;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Create custom error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'SERVER_ERROR', fields = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  AppError,
  asyncHandler
};
