const express = require('express');
const router = express.Router();
const importBatchController = require('../controllers/importBatchController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/v1/import-batches - List all import batches
router.get('/', importBatchController.list);

// GET /api/v1/import-batches/:id - Get single batch details
router.get('/:id', importBatchController.getById);

// GET /api/v1/import-batches/:id/assets - Get assets from a batch
router.get('/:id/assets', importBatchController.getBatchAssets);

// GET /api/v1/import-batches/:id/error-report - Download error report
router.get('/:id/error-report', importBatchController.getErrorReport);

// POST /api/v1/import-batches/:id/revert - Admin-only: Revert a batch
router.post('/:id/revert', requireRole(['Manager', 'Admin']), importBatchController.revert);

module.exports = router;
