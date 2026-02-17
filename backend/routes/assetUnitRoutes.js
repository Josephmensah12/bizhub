const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('../controllers/assetUnitController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/v1/assets/:assetId/units - list units
router.get('/', controller.list);

// GET /api/v1/assets/:assetId/units/summary - unit counts by status
router.get('/summary', controller.summary);

// POST /api/v1/assets/:assetId/units - add single unit
router.post('/', requireRole(['Admin', 'Manager', 'Warehouse']), controller.create);

// POST /api/v1/assets/:assetId/units/bulk - bulk add units
router.post('/bulk', requireRole(['Admin', 'Manager', 'Warehouse']), controller.bulkCreate);

// PUT /api/v1/assets/:assetId/units/:unitId - update unit
router.put('/:unitId', requireRole(['Admin', 'Manager', 'Warehouse']), controller.update);

// DELETE /api/v1/assets/:assetId/units/:unitId - delete unit
router.delete('/:unitId', requireRole(['Admin', 'Manager']), controller.remove);

module.exports = router;
