const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { storefrontAuth, storefrontCors } = require('../middleware/storefrontAuth');
const storefront = require('../controllers/storefrontController');

const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});

const writeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});

// Apply storefront CORS to all routes in this router
router.use(storefrontCors());

// --- Paystack webhook (NO API key, NO rate limit — Paystack calls this directly) ---
router.post('/webhooks/paystack', storefront.handlePaystackWebhook);

// --- All other routes require API key ---
router.use(storefrontAuth);

// Products
router.get('/products/featured', readLimiter, storefront.getFeaturedProducts);
router.get('/products/:id', readLimiter, storefront.getProductById);
router.get('/products', readLimiter, storefront.getProducts);
router.get('/categories', readLimiter, storefront.getCategories);

// Orders
router.post('/orders', writeLimiter, storefront.createOrder);
router.get('/orders/:id', readLimiter, storefront.getOrder);
router.post('/orders/:id/initiate-payment', writeLimiter, storefront.initiatePayment);

// Customers
router.post('/customers', writeLimiter, storefront.createOrFindCustomer);

module.exports = router;
