const express = require('express');
const router = express.Router();
const expenseCategoryController = require('../controllers/expenseCategoryController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// All authenticated users can list (filtered by role)
router.get('/', expenseCategoryController.list);

// Admin & Manager: create, update
const adminOrManager = requireRole(['Admin', 'Manager']);
router.post('/', adminOrManager, expenseCategoryController.create);
router.patch('/:id', adminOrManager, expenseCategoryController.update);

// Admin only: delete (deactivate)
router.delete('/:id', requireRole(['Admin']), expenseCategoryController.remove);

module.exports = router;
