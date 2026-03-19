const express = require('express');
const router = express.Router();
const expenseCategoryController = require('../controllers/expenseCategoryController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// All authenticated users can list (filtered by role)
router.get('/', expenseCategoryController.list);

// Admin only: create, update, delete
const adminOnly = requireRole(['Admin']);
router.post('/', adminOnly, expenseCategoryController.create);
router.patch('/:id', adminOnly, expenseCategoryController.update);
router.delete('/:id', adminOnly, expenseCategoryController.remove);

module.exports = router;
