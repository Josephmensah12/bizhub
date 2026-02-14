const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// GET /api/v1/reports/sales
router.get('/sales', requireRole(['Manager', 'Admin']), reportController.salesReport);

// GET /api/v1/reports/top-sellers
router.get('/top-sellers', requireRole(['Manager', 'Admin']), reportController.topSellers);

// GET /api/v1/reports/staff-performance
router.get('/staff-performance', requireRole(['Manager', 'Admin']), reportController.staffPerformance);

// GET /api/v1/reports/customer-insights
router.get('/customer-insights', requireRole(['Manager', 'Admin']), reportController.customerInsights);

// GET /api/v1/reports/margin-analysis
router.get('/margin-analysis', requireRole(['Manager', 'Admin']), reportController.marginAnalysis);

// GET /api/v1/reports/inventory-aging
router.get('/inventory-aging', requireRole(['Manager', 'Admin']), reportController.inventoryAgingReport);

// GET /api/v1/reports/low-stock
router.get('/low-stock', requireRole(['Warehouse', 'Manager', 'Admin']), reportController.lowStockReport);

// GET /api/v1/reports/preorder-sla
router.get('/preorder-sla', requireRole(['Manager', 'Admin']), reportController.preorderSLAReport);

module.exports = router;
