/**
 * Return Routes
 *
 * Invoice returns, refunds, and exchanges management
 */

const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication + Admin or Manager only
router.use(authenticate);
router.use(requireRole(['Admin', 'Manager']));

// Return management
// GET /api/v1/returns/:returnId - Get single return
router.get('/:returnId', returnController.getReturn);

// POST /api/v1/returns/:returnId/finalize - Finalize return
router.post('/:returnId/finalize', returnController.finalizeReturn);

// POST /api/v1/returns/:returnId/cancel - Cancel draft return
router.post('/:returnId/cancel', returnController.cancelReturn);

module.exports = router;
