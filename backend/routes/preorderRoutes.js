const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const preorderController = require('../controllers/preorderController');

// All routes require authentication
router.use(authenticate);

// Summary must come before /:id
router.get('/summary', preorderController.summary);
router.get('/', preorderController.list);
router.get('/:id', preorderController.getById);
router.post('/', requireRole(['Admin', 'Manager', 'Sales']), preorderController.create);
router.put('/:id', requireRole(['Admin', 'Manager', 'Sales']), preorderController.update);
router.put('/:id/status', requireRole(['Admin', 'Manager', 'Sales']), preorderController.updateStatus);
router.post('/:id/convert-to-invoice', requireRole(['Admin', 'Manager']), preorderController.convertToInvoice);
router.delete('/:id', requireRole(['Admin', 'Manager']), preorderController.remove);

module.exports = router;
