const express = require('express');
const router = express.Router();
const financialReportController = require('../controllers/financialReportController');
const { authenticate, requireRole } = require('../middleware/auth');

// All financial report routes require Admin
router.use(authenticate);
router.use(requireRole(['Admin']));

router.get('/pnl', financialReportController.profitAndLoss);
router.get('/revenue-vs-expense', financialReportController.revenueVsExpense);
router.get('/summary', financialReportController.summary);

module.exports = router;
