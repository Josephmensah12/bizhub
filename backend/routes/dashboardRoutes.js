const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/v1/dashboard/metrics
router.get('/metrics', dashboardController.getMetrics);

// GET /api/v1/dashboard/category-breakdown
router.get('/category-breakdown', dashboardController.getCategoryBreakdown);

// GET /api/v1/dashboard/conversion-efficiency
router.get('/conversion-efficiency', dashboardController.getConversionEfficiency);

module.exports = router;
