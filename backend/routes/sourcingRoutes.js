/**
 * Sourcing Routes
 *
 * Phone sourcing batch management, warranty claims, and sourcing reports.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const sourcingController = require('../controllers/sourcingController');
const warrantyController = require('../controllers/sourcingWarrantyController');
const reportController = require('../controllers/sourcingReportController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Role shortcuts
const adminOnly = requireRole(['Admin']);
const adminOrManager = requireRole(['Admin', 'Manager']);

// --- Warranty claim routes (BEFORE /:id to avoid param capture) ---
router.get('/warranty/claims', adminOrManager, warrantyController.listClaims);
router.post('/warranty/claims', adminOrManager, warrantyController.createClaim);
router.patch('/warranty/claims/:id', adminOrManager, warrantyController.updateClaim);
router.get('/warranty/expiring', adminOrManager, warrantyController.expiring);

// --- Verification template (ALL authenticated users) ---
router.get('/verification-template', sourcingController.verificationTemplate);

// --- Bulk import (Admin only) ---
router.post('/import', adminOnly, upload.single('file'), sourcingController.importBatch);

// --- Report routes (BEFORE /:id to avoid param capture) ---
router.get('/reports/supplier-scorecard', adminOnly, reportController.supplierScorecard);
router.get('/reports/model-profitability', adminOnly, reportController.modelProfitability);
router.get('/reports/warranty-summary', adminOnly, reportController.warrantySummary);

// --- Sourcing batch CRUD ---
router.get('/', adminOnly, sourcingController.list);
router.post('/', adminOnly, sourcingController.create);
router.get('/:id', adminOnly, sourcingController.detail);
router.patch('/:id', adminOnly, sourcingController.update);
router.get('/:id/performance', adminOnly, sourcingController.performance);

module.exports = router;
