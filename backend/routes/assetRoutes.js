const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const assetImportController = require('../controllers/assetImportController');
const assetImportWizardController = require('../controllers/assetImportWizardController');
const { authenticate, requireRole } = require('../middleware/auth');
const { body } = require('express-validator');
const { getFullTaxonomy, createCustomValue, isValidCategoryAsync, validateTaxonomyAsync } = require('../utils/inventoryTaxonomy');

// All routes require authentication
router.use(authenticate);

// Validation rules
// Note: { values: 'falsy' } treats empty strings, null, undefined as "no value" (skips validation)
const optionalFalsy = { values: 'falsy' };

const assetValidation = [
  // Category is required and must be valid (checks hardcoded + custom)
  body('category')
    .notEmpty().withMessage('Category is required')
    .custom(async (value) => {
      const valid = await isValidCategoryAsync(value);
      if (!valid) {
        throw new Error(`Invalid category: "${value}"`);
      }
      return true;
    }),

  // Asset type is required, must be valid, and must match category (checks hardcoded + custom)
  body('asset_type')
    .notEmpty().withMessage('Asset type is required')
    .custom(async (value, { req }) => {
      const result = await validateTaxonomyAsync(req.body.category, value);
      if (!result.valid) {
        throw new Error(result.error);
      }
      return true;
    }),

  // Serial number is conditionally required (only when quantity = 1 or not specified)
  body('serial_number').custom((value, { req }) => {
    const quantity = parseInt(req.body.quantity) || 1;
    // If quantity > 1, serial_number is optional
    if (quantity > 1) {
      return true;
    }
    // If quantity = 1, serial_number is required
    if (!value || value.trim() === '') {
      throw new Error('Serial number is required when quantity is 1');
    }
    return true;
  }),
  body('make').notEmpty().withMessage('Make is required'),
  body('model').notEmpty().withMessage('Model is required'),
  body('status').optional(optionalFalsy).isIn(['In Stock', 'Processing', 'Reserved', 'Sold', 'In Repair', 'Returned']),
  body('condition').optional(optionalFalsy).isIn(['New', 'Open Box', 'Renewed', 'Used', '']),
  body('ram_gb').optional(optionalFalsy).isInt({ min: 0 }),
  body('storage_gb').optional(optionalFalsy).isInt({ min: 0 }),
  body('storage_type').optional(optionalFalsy).isIn(['HDD', 'SSD', 'NVMe', 'Other', '']),
  body('screen_size_inches').optional(optionalFalsy).isFloat({ min: 0 }),
  body('battery_health_percent').optional(optionalFalsy).isInt({ min: 0, max: 100 }),
  body('quantity').optional(optionalFalsy).isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('cost_amount').optional(optionalFalsy).isFloat({ min: 0 }),
  body('cost_currency').optional(optionalFalsy).isIn(['USD', 'GHS', 'GBP']).withMessage('Cost currency must be USD, GHS, or GBP'),
  body('price_amount').optional(optionalFalsy).isFloat({ min: 0 }),
  body('price_currency').optional(optionalFalsy).isIn(['USD', 'GHS', 'GBP']).withMessage('Price currency must be USD, GHS, or GBP')
];

// GET /api/v1/assets/taxonomy - Get taxonomy for dropdowns (merged with custom values)
router.get('/taxonomy', async (req, res) => {
  try {
    const data = await getFullTaxonomy();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch taxonomy' } });
  }
});

// POST /api/v1/assets/taxonomy/custom - Create a custom taxonomy value
router.post('/taxonomy/custom', requireRole(['Warehouse', 'Manager', 'Admin']), async (req, res) => {
  try {
    const { value_type, value, parent_category } = req.body;

    if (!value_type || !value) {
      return res.status(400).json({
        success: false,
        error: { message: 'value_type and value are required' }
      });
    }

    if (!['category', 'asset_type'].includes(value_type)) {
      return res.status(400).json({
        success: false,
        error: { message: 'value_type must be category or asset_type' }
      });
    }

    const canonicalValue = await createCustomValue(value_type, value, parent_category, req.user?.id);
    res.json({ success: true, data: { value: canonicalValue } });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { message: err.message }
    });
  }
});

// GET /api/v1/assets/filters/options
router.get('/filters/options', assetController.getFilterOptions);

// GET /api/v1/assets/export/template
router.get('/export/template', assetController.downloadTemplate);

// GET /api/v1/assets/valuation-summary - Inventory valuation with drilldown
router.get('/valuation-summary', assetController.getValuationSummary);

// GET /api/v1/assets
router.get('/', assetController.list);

// POST /api/v1/assets/import (legacy - still supported)
router.post('/import', requireRole(['Warehouse', 'Manager', 'Admin']), assetImportController.bulkImport);

// Import Wizard endpoints
router.post('/import/preview', requireRole(['Warehouse', 'Manager', 'Admin']), assetImportWizardController.previewFile);
router.post('/import/validate', requireRole(['Warehouse', 'Manager', 'Admin']), assetImportWizardController.validateImport);
router.post('/import/commit', requireRole(['Warehouse', 'Manager', 'Admin']), assetImportWizardController.commitImport);

// POST /api/v1/assets
router.post('/', requireRole(['Warehouse', 'Manager', 'Admin']), assetValidation, assetController.create);

// DELETE /api/v1/assets/bulk - Bulk delete multiple assets
router.delete('/bulk', requireRole(['Manager', 'Admin']), assetController.bulkDelete);

// GET /api/v1/assets/deleted - List soft-deleted assets (Recycle Bin)
router.get('/deleted', assetController.listDeleted);

// POST /api/v1/assets/restore - Restore soft-deleted assets
router.post('/restore', requireRole(['Warehouse', 'Manager', 'Admin']), assetController.restore);

// DELETE /api/v1/assets/permanent - Permanently delete (Admin only)
router.delete('/permanent', requireRole(['Admin']), assetController.permanentDelete);

// GET /api/v1/assets/:id/history - Get inventory item event history
router.get('/:id/history', assetController.getHistory);

// GET /api/v1/assets/:id
router.get('/:id', assetController.getById);

// PUT /api/v1/assets/:id
router.put('/:id', requireRole(['Warehouse', 'Technician', 'Manager', 'Admin']), assetValidation, assetController.update);

// DELETE /api/v1/assets/:id
router.delete('/:id', requireRole(['Manager', 'Admin']), assetController.delete);

module.exports = router;
