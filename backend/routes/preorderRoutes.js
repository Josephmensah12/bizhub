const express = require('express');
const router = express.Router();
const preorderController = require('../controllers/preorderController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', requireRole(['Sales', 'Manager', 'Admin']), preorderController.list);
router.post('/', requireRole(['Sales', 'Manager', 'Admin']), preorderController.create);
router.get('/:id', requireRole(['Sales', 'Manager', 'Admin']), preorderController.getById);
router.post('/:id/deposit', requireRole(['Sales', 'Manager', 'Admin']), preorderController.recordDeposit);
router.post('/:id/link-asset', requireRole(['Sales', 'Manager', 'Admin']), preorderController.linkAsset);
router.post('/:id/notify-customer', requireRole(['Sales', 'Manager', 'Admin']), preorderController.notifyCustomer);
router.post('/:id/complete', requireRole(['Sales', 'Manager', 'Admin']), preorderController.complete);
router.post('/:id/reject', requireRole(['Sales', 'Manager', 'Admin']), preorderController.reject);
router.post('/:id/resale-complete', requireRole(['Sales', 'Manager', 'Admin']), preorderController.resaleComplete);

module.exports = router;
