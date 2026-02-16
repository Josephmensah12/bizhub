const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Personal performance — available to ALL authenticated users
router.get('/my-performance', reportController.myPerformance);

// GET /api/v1/reports/sales
router.get('/sales', requireRole(['Manager', 'Admin']), reportController.salesReport);

// GET /api/v1/reports/top-sellers
router.get('/top-sellers', requireRole(['Manager', 'Admin']), reportController.topSellers);

// GET /api/v1/reports/staff-performance
router.get('/staff-performance', requireRole(['Manager', 'Admin']), reportController.staffPerformance);

// GET /api/v1/reports/customer-insights
router.get('/customer-insights', requireRole(['Manager', 'Admin']), reportController.customerInsights);

// GET /api/v1/reports/margin-analysis — Admin ONLY (profit data)
router.get('/margin-analysis', requireRole(['Admin']), reportController.marginAnalysis);

// GET /api/v1/reports/inventory-aging
router.get('/inventory-aging', requireRole(['Warehouse', 'Manager', 'Admin']), reportController.inventoryAgingReport);

// GET /api/v1/reports/low-stock
router.get('/low-stock', requireRole(['Warehouse', 'Manager', 'Admin']), reportController.lowStockReport);

// GET /api/v1/reports/preorder-sla
router.get('/preorder-sla', requireRole(['Manager', 'Admin']), reportController.preorderSLAReport);

// GET /api/v1/reports/reconciliation
router.get('/reconciliation', requireRole(['Admin', 'Manager']), reportController.reconciliation);

module.exports = router;
