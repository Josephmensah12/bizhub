const express = require('express');
const router = express.Router();
const warrantyController = require('../controllers/warrantyController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', warrantyController.list);
router.post('/', requireRole(['Sales', 'Manager', 'Admin']), warrantyController.create);
router.get('/:id', warrantyController.getById);

// Warranty claims
router.post('/claims', requireRole(['Sales', 'Manager', 'Admin']), warrantyController.submitClaim);
router.patch('/claims/:id', requireRole(['Manager', 'Admin']), warrantyController.updateClaim);
router.post('/claims/:id/complete', requireRole(['Manager', 'Admin']), warrantyController.completeClaim);

module.exports = router;
