/**
 * Write-Off Routes
 *
 * Inventory write-off management with approval workflow
 */

const express = require('express');
const router = express.Router();
const writeOffController = require('../controllers/writeOffController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Role guards
const writeOffViewers = requireRole(['Admin', 'Manager', 'Warehouse']);
const writeOffApprovers = requireRole(['Admin', 'Manager']);
const writeOffAdmins = requireRole(['Admin']);

// GET /api/v1/write-offs/summary - Monthly totals for dashboard/reports
router.get('/summary', writeOffApprovers, writeOffController.summary);

// GET /api/v1/write-offs/salvage-units - Salvage/scrapped units available for write-off
router.get('/salvage-units', writeOffViewers, writeOffController.salvageUnits);

// GET /api/v1/write-offs - List write-offs with filters
router.get('/', writeOffViewers, writeOffController.list);

// GET /api/v1/write-offs/:id - Get single write-off
router.get('/:id', writeOffViewers, writeOffController.getById);

// POST /api/v1/write-offs - Create new write-off
router.post('/', writeOffViewers, writeOffController.create);

// POST /api/v1/write-offs/bulk - Bulk create from selected units
router.post('/bulk', writeOffViewers, writeOffController.bulkCreate);

// POST /api/v1/write-offs/:id/approve - Approve pending write-off
router.post('/:id/approve', writeOffApprovers, writeOffController.approve);

// POST /api/v1/write-offs/:id/reject - Reject pending write-off
router.post('/:id/reject', writeOffApprovers, writeOffController.reject);

// POST /api/v1/write-offs/:id/reverse - Reverse approved write-off (Admin only)
router.post('/:id/reverse', writeOffAdmins, writeOffController.reverse);

module.exports = router;
