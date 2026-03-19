const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

const expenseEditors = requireRole(['Admin', 'Manager']);
const adminOnly = requireRole(['Admin']);

// ─── Recurring expenses (must come before /:id) ─────────────
router.get('/recurring', expenseEditors, expenseController.listRecurring);
router.post('/recurring', expenseEditors, expenseController.createRecurring);
router.post('/recurring/generate', adminOnly, expenseController.generateRecurring);
router.patch('/recurring/:id', expenseEditors, expenseController.updateRecurring);
router.delete('/recurring/:id', adminOnly, expenseController.removeRecurring);

// ─── Analytics ───────────────────────────────────────────────
router.get('/analytics', expenseController.analytics);

// ─── Expense CRUD ────────────────────────────────────────────
router.get('/', expenseController.list);
router.get('/:id', expenseController.detail);
router.post('/', requireRole(['Admin', 'Manager', 'Sales']), expenseController.create);
router.patch('/:id', expenseEditors, expenseController.update);
router.delete('/:id', adminOnly, expenseController.remove);

module.exports = router;
