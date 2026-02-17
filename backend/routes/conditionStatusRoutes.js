const express = require('express');
const router = express.Router();
const controller = require('../controllers/conditionStatusController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// GET /api/v1/condition-statuses — list all (any authenticated user)
router.get('/', controller.list);

// POST /api/v1/condition-statuses — create (Admin only)
router.post('/', requireRole(['Admin']), controller.create);

// PUT /api/v1/condition-statuses/:id — update (Admin only)
router.put('/:id', requireRole(['Admin']), controller.update);

// DELETE /api/v1/condition-statuses/:id — delete (Admin only)
router.delete('/:id', requireRole(['Admin']), controller.remove);

// PUT /api/v1/condition-statuses/:id/set-default
router.put('/:id/set-default', requireRole(['Admin']), controller.setDefault);

module.exports = router;
