const express = require('express');
const router = express.Router();
const productModelController = require('../controllers/productModelController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', productModelController.list);
router.post('/', requireRole(['Admin', 'Manager']), productModelController.create);
router.get('/:id', productModelController.getById);
router.put('/:id', requireRole(['Admin', 'Manager']), productModelController.update);
router.delete('/:id', requireRole(['Admin']), productModelController.delete);

module.exports = router;
