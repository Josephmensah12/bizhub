const express = require('express');
const router = express.Router();
const { storefrontAuth, storefrontCors } = require('../middleware/storefrontAuth');
const storefront = require('../controllers/storefrontController');

// Apply storefront CORS to all routes in this router
router.use(storefrontCors());

// --- Paystack webhook (NO API key — Paystack calls this directly) ---
router.post('/webhooks/paystack', storefront.handlePaystackWebhook);

// --- All other routes require API key ---
router.use(storefrontAuth);

// Products
router.get('/products/featured', storefront.getFeaturedProducts);
router.get('/products/:id', storefront.getProductById);
router.get('/products', storefront.getProducts);
router.get('/categories', storefront.getCategories);

// Orders
router.post('/orders', storefront.createOrder);
router.get('/orders/:id', storefront.getOrder);
router.post('/orders/:id/initiate-payment', storefront.initiatePayment);

// Customers
router.post('/customers', storefront.createOrFindCustomer);

module.exports = router;
