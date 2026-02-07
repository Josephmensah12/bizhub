# Controllers Implementation Guide

## Overview

Controllers handle the business logic for each route. They receive requests from routes, interact with models, and send responses.

## Controller Pattern

Each controller should follow this pattern:

```javascript
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const db = require('../models');

// Get the model
const ModelName = db.ModelName;

/**
 * List all items with pagination and filtering
 */
exports.list = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50, /* filters */ } = req.query;

  // Build query conditions
  const where = {};
  // Add filters to where clause

  // Query database with pagination
  const { count, rows } = await ModelName.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
    order: [['created_at', 'DESC']]
  });

  res.json({
    success: true,
    data: rows,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      total_pages: Math.ceil(count / limit)
    }
  });
});

/**
 * Get single item by ID
 */
exports.getById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const item = await ModelName.findByPk(id, {
    // include associated models if needed
  });

  if (!item) {
    throw new AppError('Item not found', 404, 'NOT_FOUND');
  }

  res.json({
    success: true,
    data: item
  });
});

/**
 * Create new item
 */
exports.create = asyncHandler(async (req, res, next) => {
  // Validate input (use express-validator in routes)
  const data = req.body;

  // Create item
  const item = await ModelName.create(data);

  res.status(201).json({
    success: true,
    data: item,
    message: 'Item created successfully'
  });
});

/**
 * Update item
 */
exports.update = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const data = req.body;

  const item = await ModelName.findByPk(id);

  if (!item) {
    throw new AppError('Item not found', 404, 'NOT_FOUND');
  }

  await item.update(data);

  res.json({
    success: true,
    data: item,
    message: 'Item updated successfully'
  });
});

/**
 * Delete/deactivate item
 */
exports.delete = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const item = await ModelName.findByPk(id);

  if (!item) {
    throw new AppError('Item not found', 404, 'NOT_FOUND');
  }

  // Soft delete (preferred)
  await item.update({ deleted_at: new Date() });
  // Or hard delete: await item.destroy();

  res.json({
    success: true,
    message: 'Item deleted successfully'
  });
});
```

## Controllers to Implement

1. ✅ **authController.js** - DONE (reference implementation)
2. **userController.js** - User management CRUD
3. **dashboardController.js** - Dashboard metrics aggregation
4. **productModelController.js** - Product catalog management
5. **assetController.js** - Asset/inventory management (complex, high priority)
6. **bulkStockController.js** - Bulk inventory management
7. **invoiceController.js** - Sales and invoicing (complex, high priority)
8. **customerController.js** - Customer management
9. **preorderController.js** - Preorder workflow (complex)
10. **warrantyController.js** - Warranty management
11. **repairController.js** - Repair ticket management
12. **reportController.js** - Report generation

## Key Implementation Notes

### Asset Controller (High Priority)

The asset controller needs to handle complex workflows:
- Receive stock (single/batch)
- Status transitions: Received → Diagnostics → Wipe → QC → Ready for Sale
- Each transition creates an inventory movement record
- Diagnostics/wipe/QC endpoints need to create related records AND update asset status
- Validate business rules (e.g., can't sell an asset unless status is Ready/Reserved)

### Invoice Controller (High Priority)

The invoice controller handles the sales workflow:
- Create invoice with multiple line items (assets + bulk stock)
- Validate asset availability before adding to invoice
- Reserve assets when invoice created
- Process payments (support split tender)
- When invoice fully paid:
  - Mark assets as Sold
  - Decrement bulk stock quantities
  - Create inventory movements
- Handle cancellations and refunds

### Preorder Controller

Implements the unique preorder workflow:
- Track deposit payments
- Calculate SLA dates
- Link arrived assets
- Handle customer rejections
- Calculate resale recovery amounts

### Dashboard Controller

Aggregates metrics from multiple tables:
- Use raw SQL queries or Sequelize complex queries
- Consider caching results (5-minute cache recommended)
- Filter data based on user role (Sales can't see costs, etc.)

## Error Handling

All controllers use the `asyncHandler` wrapper to catch errors:

```javascript
exports.myAction = asyncHandler(async (req, res, next) => {
  // Your code here
  // Errors are automatically caught and passed to error handler
});
```

To throw custom errors:

```javascript
throw new AppError('Custom error message', 400, 'ERROR_CODE', {
  field1: 'Field error message',
  field2: 'Another error'
});
```

## Validation

Use express-validator in routes for input validation:

```javascript
const { body, validationResult } = require('express-validator');

router.post('/', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR',
      errors.array().reduce((acc, err) => {
        acc[err.param] = err.msg;
        return acc;
      }, {})
    ));
  }
  next();
}, controller.action);
```

## Transaction Handling

For operations that modify multiple tables (e.g., completing a sale):

```javascript
const t = await db.sequelize.transaction();

try {
  // Update invoice
  await invoice.update({ status: 'Paid' }, { transaction: t });

  // Update asset
  await asset.update({ status: 'Sold' }, { transaction: t });

  // Create movement
  await InventoryMovement.create({ ... }, { transaction: t });

  await t.commit();
} catch (error) {
  await t.rollback();
  throw error;
}
```

## Next Steps

1. Implement User Controller (simple CRUD, good starting point)
2. Implement Product Model Controller (simple CRUD)
3. Implement Customer Controller (simple CRUD)
4. Implement Asset Controller (complex, core business logic)
5. Implement Invoice Controller (complex, core business logic)
6. Implement remaining controllers
7. Add unit tests for critical workflows
