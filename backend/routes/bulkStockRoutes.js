const express = require('express');
const router = express.Router();
const bulkStockController = require('../controllers/bulkStockController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', bulkStockController.list);
router.post('/', requireRole(['Warehouse', 'Manager', 'Admin']), bulkStockController.create);
router.get('/:id', bulkStockController.getById);
router.patch('/:id', requireRole(['Warehouse', 'Manager', 'Admin']), bulkStockController.update);
router.patch('/:id/adjust', requireRole(['Warehouse', 'Manager', 'Admin']), bulkStockController.adjustQuantity);

module.exports = router;
