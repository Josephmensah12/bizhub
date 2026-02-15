const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Change own password — available to ALL authenticated users (must be before /:id)
router.post('/change-password', userController.changeOwnPassword);

// GET /api/v1/users
router.get('/', requireRole(['Admin', 'Manager']), userController.list);

// POST /api/v1/users
router.post('/', requireRole(['Admin']), userController.create);

// GET /api/v1/users/:id
router.get('/:id', requireRole(['Admin', 'Manager']), userController.getById);

// PUT /api/v1/users/:id
router.put('/:id', requireRole(['Admin']), userController.update);

// DELETE /api/v1/users/:id
router.delete('/:id', requireRole(['Admin']), userController.deactivate);

// POST /api/v1/users/:id/reset-password (Admin only)
router.post('/:id/reset-password', requireRole(['Admin']), userController.resetPassword);

module.exports = router;
