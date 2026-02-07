const express = require('express');
const router = express.Router();
const repairController = require('../controllers/repairController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', requireRole(['Technician', 'Manager', 'Admin']), repairController.list);
router.post('/', requireRole(['Sales', 'Technician', 'Manager', 'Admin']), repairController.create);
router.get('/:id', requireRole(['Technician', 'Manager', 'Admin']), repairController.getById);
router.patch('/:id', requireRole(['Technician', 'Manager', 'Admin']), repairController.update);
router.post('/:id/complete', requireRole(['Technician', 'Manager', 'Admin']), repairController.complete);

module.exports = router;
