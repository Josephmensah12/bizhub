const cors = require('cors');

/**
 * Storefront API key authentication middleware.
 * Validates x-api-key header or Authorization: Bearer <key> against STOREFRONT_API_KEY env var.
 */
function storefrontAuth(req, res, next) {
  const apiKey = req.headers['x-api-key']
    || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  const expectedKey = process.env.STOREFRONT_API_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'CONFIG_ERROR', message: 'Storefront API key not configured' }
    });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key' }
    });
  }

  next();
}

/**
 * CORS middleware for storefront routes.
 * Allows origins listed in STOREFRONT_ALLOWED_ORIGINS env var (comma-separated), defaults to *.
 */
function storefrontCors() {
  const allowedOriginsEnv = process.env.STOREFRONT_ALLOWED_ORIGINS;

  let origin;
  if (!allowedOriginsEnv || allowedOriginsEnv === '*') {
    origin = '*';
  } else {
    const origins = allowedOriginsEnv.split(',').map(o => o.trim()).filter(Boolean);
    origin = (reqOrigin, callback) => {
      if (!reqOrigin || origins.includes(reqOrigin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    };
  }

  return cors({
    origin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
    credentials: false
  });
}

module.exports = { storefrontAuth, storefrontCors };
