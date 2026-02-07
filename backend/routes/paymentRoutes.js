/**
 * Payment Routes
 *
 * Routes for listing and viewing payment transactions
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/v1/payments - List all payment transactions
router.get('/', paymentController.list);

// GET /api/v1/payments/methods - Get available payment methods for filters
router.get('/methods', paymentController.getPaymentMethods);

module.exports = router;
