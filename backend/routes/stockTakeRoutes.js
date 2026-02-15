const express = require('express');
const router = express.Router();
const stockTakeController = require('../controllers/stockTakeController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// CRUD
router.get('/', stockTakeController.list);
router.post('/', requireRole(['Admin', 'Manager', 'Warehouse']), stockTakeController.create);
router.get('/:id', stockTakeController.getById);
router.put('/:id', requireRole(['Admin', 'Manager', 'Warehouse']), stockTakeController.update);
router.delete('/:id', requireRole(['Admin', 'Manager']), stockTakeController.delete);

// Workflow
router.post('/:id/start', requireRole(['Admin', 'Manager', 'Warehouse']), stockTakeController.start);
router.post('/:id/submit-review', stockTakeController.submitReview);
router.post('/:id/finalize', requireRole(['Admin', 'Manager']), stockTakeController.finalize);
router.post('/:id/cancel', requireRole(['Admin', 'Manager']), stockTakeController.cancel);

// Items
router.get('/:id/items', stockTakeController.getItems);
router.put('/:id/items/:itemId', stockTakeController.updateItem);
router.post('/:id/items/batch-count', stockTakeController.batchCount);

// Queries
router.get('/:id/discrepancies', stockTakeController.discrepancies);
router.get('/:id/export', stockTakeController.export);
router.get('/:id/lookup', stockTakeController.lookup);

module.exports = router;
