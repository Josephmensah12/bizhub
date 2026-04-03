const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const forecastController = require('../controllers/forecastController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Personal performance — available to ALL authenticated users
router.get('/my-performance', reportController.myPerformance);

// All other reports — Admin only
const adminOnly = requireRole(['Admin']);

router.get('/sales', adminOnly, reportController.salesReport);
router.get('/top-sellers', adminOnly, reportController.topSellers);
router.get('/staff-performance', adminOnly, reportController.staffPerformance);
router.get('/customer-insights', adminOnly, reportController.customerInsights);
router.get('/margin-analysis', adminOnly, reportController.marginAnalysis);
router.get('/inventory-aging', adminOnly, reportController.inventoryAgingReport);
router.get('/low-stock', adminOnly, reportController.lowStockReport);
router.get('/preorder-sla', adminOnly, reportController.preorderSLAReport);
router.get('/reconciliation', adminOnly, reportController.reconciliation);
router.get('/inventory-valuation', adminOnly, reportController.inventoryValuation);
router.get('/forecast', adminOnly, forecastController.forecast);

module.exports = router;
