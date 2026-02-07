/**
 * Customer Routes
 *
 * CRUD + merge + duplicate check + import
 */

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const customerImportController = require('../controllers/customerImportController');
const returnController = require('../controllers/returnController');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/v1/customers/options - Get dropdown options
router.get('/options', customerController.getOptions);

// POST /api/v1/customers/check-duplicate - Check for duplicates
router.post('/check-duplicate', customerController.checkDuplicate);

// POST /api/v1/customers/normalize-phone - Preview phone normalization
router.post('/normalize-phone', customerController.normalizePhonePreview);

// Import endpoints
router.post('/import/preview', requireRole(['Sales', 'Warehouse', 'Manager', 'Admin']), customerImportController.previewFile);
router.post('/import/validate', requireRole(['Sales', 'Warehouse', 'Manager', 'Admin']), customerImportController.validateImport);
router.post('/import/commit', requireRole(['Sales', 'Warehouse', 'Manager', 'Admin']), customerImportController.commitImport);

// GET /api/v1/customers - List customers
router.get('/', customerController.list);

// POST /api/v1/customers - Create customer
router.post('/', customerController.create);

// GET /api/v1/customers/:id - Get customer by ID
router.get('/:id', customerController.getById);

// PUT /api/v1/customers/:id - Update customer
router.put('/:id', customerController.update);

// DELETE /api/v1/customers/:id - Delete customer
router.delete('/:id', requireRole(['Manager', 'Admin']), customerController.delete);

// POST /api/v1/customers/:existingId/merge - Merge into existing customer
router.post('/:existingId/merge', customerController.merge);

// Store credit endpoints
// GET /api/v1/customers/:customerId/credits - Get customer's store credits
router.get('/:customerId/credits', returnController.getCustomerCredits);

// POST /api/v1/customers/:customerId/credits/apply - Apply store credit to invoice
router.post('/:customerId/credits/apply', returnController.applyCredit);

module.exports = router;
