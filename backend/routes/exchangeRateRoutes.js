const express = require('express');
const router = express.Router();
const exchangeRateController = require('../controllers/exchangeRateController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/v1/exchange-rates/latest?base=USD&quote=GHS
router.get('/latest', exchangeRateController.getLatestRate);

// POST /api/v1/exchange-rates/convert
router.post('/convert', exchangeRateController.convertCurrency);

// GET /api/v1/exchange-rates/cached
router.get('/cached', exchangeRateController.getCachedRates);

module.exports = router;
