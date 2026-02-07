const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/v1/dashboard/metrics
router.get('/metrics', dashboardController.getMetrics);

module.exports = router;
