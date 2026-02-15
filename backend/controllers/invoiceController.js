/**
 * Invoice Controller
 *
 * CRUD operations for invoices with payments and inventory locking
 */

const { Invoice, InvoiceItem, InvoicePayment, Customer, Asset, User, CompanyProfile, ActivityLog, InventoryItemEvent, CustomerCreditApplication, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sanitizeInvoiceForRole, canSeeCost, canEditInvoices, canVoidInvoices } = require('../middleware/permissions');
const exchangeRateService = require('../services/exchangeRateService');
const { checkAndReserve, computeAvailability } = require('../services/inventoryAvailabilityService');
const invoicePdfService = require('../services/invoicePdfService');
const path = require('path');
const fs = require('fs');

/**
 * Recalculate invoice totals based on active transactions
 * Handles both PAYMENT and REFUND transaction types
 */
async function recalculateInvoiceTotals(invoice, dbTransaction = null) {
  const queryOptions = dbTransaction ? { transaction: dbTransaction } : {};

  // Get all active (non-voided) transactions for this invoice
  const transactions = await InvoicePayment.findAll({
    where: {
      invoice_id: invoice.id,
      voided_at: null
    },
    ...queryOptions
  });

  // Calculate net paid: payments - refunds + credits applied
  let paymentsSum = 0;
  let refundsSum = 0;

  for (const tx of transactions) {
    const amount = parseFloat(tx.amount) || 0;
    if (tx.transaction_type === 'PAYMENT') {
      paymentsSum += amount;
    } else if (tx.transaction_type === 'REFUND') {
      refundsSum += amount;
    }
  }

  // Include store credit applications (matches returnController logic)
  let creditsApplied = 0;
  if (CustomerCreditApplication) {
    const creditApps = await CustomerCreditApplication.findAll({
      where: {
        invoice_id: invoice.id,
        voided_at: null
      },
      ...queryOptions
    });
    for (const app of creditApps) {
      creditsApplied += parseFloat(app.amount_applied) || 0;
    }
  }

  const netPaid = Math.max(0, paymentsSum - refundsSum + creditsApplied);
  const totalAmount = parseFloat(invoice.total_amount) || 0;
  const balanceDue = Math.max(0, totalAmount - netPaid);

  // Update invoice fields
  invoice.amount_paid = netPaid;
  invoice.balance_due = invoice.status === 'CANCELLED' ? 0 : balanceDue;

  // Determine status (don't change CANCELLED)
  if (invoice.status !== 'CANCELLED') {
    if (netPaid <= 0) {
      invoice.status = 'UNPAID';
    } else if (netPaid >= totalAmount) {
      invoice.status = 'PAID';
    } else {
      invoice.status = 'PARTIALLY_PAID';
    }
  }

  await invoice.save(queryOptions);

  return {
    paymentsSum,
    refundsSum,
    netPaid,
    balanceDue,
    status: invoice.status
  };
}

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/v1/invoices
 * List invoices with filters and aggregated metrics
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    dateFrom,
    dateTo,
    status,
    customerId,
    page = 1,
    limit = 50,
    sortBy = 'invoice_date',
    sortOrder = 'DESC'
  } = req.query;

  // Default to current month
  const now = new Date();
  const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const startDate = dateFrom ? new Date(dateFrom) : defaultDateFrom;
  const endDate = dateTo ? new Date(dateTo) : defaultDateTo;

  // Build where clause
  const where = {
    invoice_date: {
      [Op.between]: [startDate, endDate]
    }
  };

  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { [Op.in]: statuses };
  }

  if (customerId) {
    where.customer_id = customerId;
  }

  // Sales users can only see their own invoices
  if (req.user?.role === 'Sales') {
    where.created_by = req.user.id;
  }

  const offset = (page - 1) * limit;

  // Get invoices
  const { count, rows } = await Invoice.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[sortBy, sortOrder]],
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'first_name', 'last_name', 'company_name'] },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  // Calculate aggregated metrics for the date range (all invoices)
  const metrics = await Invoice.findOne({
    where,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('total_amount')), 'totalRevenue'],
      [sequelize.fn('SUM', sequelize.col('amount_paid')), 'totalCollected'],
      [sequelize.fn('SUM', sequelize.col('balance_due')), 'totalOutstanding'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount']
    ],
    raw: true
  });

  const totalRevenue = parseFloat(metrics.totalRevenue) || 0;
  const totalCollected = parseFloat(metrics.totalCollected) || 0;
  const totalOutstanding = parseFloat(metrics.totalOutstanding) || 0;

  // Net metrics: non-cancelled invoices (for profit/margin and net total)
  const netWhere = { ...where, status: { [Op.ne]: 'CANCELLED' } };
  const netMetrics = await Invoice.findOne({
    where: netWhere,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('total_amount')), 'netTotal'],
      [sequelize.fn('SUM', sequelize.col('total_cost_amount')), 'netCost'],
      [sequelize.fn('SUM', sequelize.col('total_profit_amount')), 'netProfit'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'netCount']
    ],
    raw: true
  });
  const netTotal = parseFloat(netMetrics.netTotal) || 0;
  const netCost = parseFloat(netMetrics.netCost) || 0;
  const netProfit = parseFloat(netMetrics.netProfit) || 0;
  const netCount = parseInt(netMetrics.netCount) || 0;
  const netMarginPercent = netCost > 0 ? ((netProfit / netCost) * 100) : 0;

  // Add display name to invoices
  const invoices = rows.map(inv => {
    const data = inv.toJSON();
    if (data.customer) {
      data.customer.displayName = data.customer.first_name
        ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
        : data.customer.company_name || 'Unknown';
    }
    return data;
  });

  // Sanitize cost data from each invoice based on role
  const sanitizedInvoices = invoices.map(inv => sanitizeInvoiceForRole(inv, req.user?.role));

  // Strip cost/profit metrics for non-privileged roles
  const metricsData = {
    totalRevenue,
    totalCollected,
    totalOutstanding,
    invoiceCount: parseInt(metrics.invoiceCount) || 0,
    netTotal,
    netCount
  };
  if (canSeeCost(req.user?.role)) {
    metricsData.totalCost = netCost;
    metricsData.totalProfit = netProfit;
    metricsData.marginPercent = parseFloat(netMarginPercent.toFixed(2));
  }

  res.json({
    success: true,
    data: {
      invoices: sanitizedInvoices,
      metrics: metricsData,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      },
      dateRange: {
        from: startDate.toISOString(),
        to: endDate.toISOString()
      }
    }
  });
});

/**
 * GET /api/v1/invoices/:id
 * Get single invoice with items and payments
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const invoice = await Invoice.findByPk(id, {
    include: [
      { model: Customer, as: 'customer' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      { model: User, as: 'updater', attributes: ['id', 'full_name'] },
      { model: User, as: 'cancelledBy', attributes: ['id', 'full_name'] },
      {
        model: InvoiceItem,
        as: 'items',
        include: [
          {
            model: Asset,
            as: 'asset',
            attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'status', 'condition']
          },
          { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
        ]
      },
      {
        model: InvoicePayment,
        as: 'payments',
        include: [
          { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] }
        ],
        order: [['payment_date', 'DESC']]
      }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  const data = invoice.toJSON();
  if (data.customer) {
    data.customer.displayName = data.customer.first_name
      ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
      : data.customer.company_name || 'Unknown';
  }

  res.json({
    success: true,
    data: { invoice: sanitizeInvoiceForRole(data, req.user?.role) }
  });
});

/**
 * POST /api/v1/invoices
 * Create new invoice (always UNPAID)
 */
exports.create = asyncHandler(async (req, res) => {
  const {
    customerId, customer_id,
    invoiceDate, invoice_date,
    currency = 'GHS',
    notes
  } = req.body;

  const _customerId = customerId || customer_id;
  const _invoiceDate = invoiceDate || invoice_date || new Date();

  // Validate customer exists if provided
  if (_customerId) {
    const customer = await Customer.findByPk(_customerId);
    if (!customer) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CUSTOMER', message: 'Customer not found' }
      });
    }
  }

  // Generate invoice number
  const invoiceNumber = await Invoice.generateInvoiceNumber();

  const invoice = await Invoice.create({
    invoice_number: invoiceNumber,
    customer_id: _customerId,
    invoice_date: _invoiceDate,
    status: 'UNPAID', // Always UNPAID on creation
    currency,
    notes,
    amount_paid: 0,
    balance_due: 0, // Will be updated when items are added
    created_by: req.user?.id,
    updated_by: req.user?.id
  });

  // Reload with associations
  await invoice.reload({
    include: [
      { model: Customer, as: 'customer' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  // Log activity
  await ActivityLog.logInvoiceCreated(invoice, req.user?.id);

  res.status(201).json({
    success: true,
    data: { invoice },
    message: 'Invoice created successfully'
  });
});

/**
 * PATCH /api/v1/invoices/:id
 * Update invoice (customer, date, notes, currency)
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Admin or Manager
  if (!req.user || !canEditInvoices(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only admins and managers can edit invoices' }
    });
  }

  const {
    customerId, customer_id,
    invoiceDate, invoice_date,
    currency,
    notes
  } = req.body;

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Can only edit UNPAID or PARTIALLY_PAID invoices
  if (!['UNPAID', 'PARTIALLY_PAID'].includes(invoice.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_LOCKED', message: 'Can only update unpaid or partially paid invoices' }
    });
  }

  // Track changes for audit log
  const changes = {};

  const _customerId = customerId || customer_id;
  const _invoiceDate = invoiceDate || invoice_date;

  // Validate customer if changing
  if (_customerId !== undefined && _customerId !== invoice.customer_id) {
    if (_customerId) {
      const customer = await Customer.findByPk(_customerId);
      if (!customer) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_CUSTOMER', message: 'Customer not found' }
        });
      }
    }
    changes.customer_id = { from: invoice.customer_id, to: _customerId };
    invoice.customer_id = _customerId;
  }

  if (_invoiceDate !== undefined) {
    changes.invoice_date = { from: invoice.invoice_date, to: _invoiceDate };
    invoice.invoice_date = _invoiceDate;
  }

  if (currency !== undefined) {
    changes.currency = { from: invoice.currency, to: currency };
    invoice.currency = currency;
  }

  if (notes !== undefined) {
    changes.notes = { from: invoice.notes, to: notes };
    invoice.notes = notes;
  }

  invoice.updated_by = req.user?.id;
  await invoice.save();

  // Log the edit
  await ActivityLog.log({
    actorUserId: req.user.id,
    actionType: 'INVOICE_UPDATED',
    entityType: 'INVOICE',
    entityId: invoice.id,
    summary: `Invoice ${invoice.invoice_number} updated`,
    metadata: { invoiceNumber: invoice.invoice_number, changes }
  });

  // Reload with associations
  await invoice.reload({
    include: [
      { model: Customer, as: 'customer' },
      { model: InvoiceItem, as: 'items' }
    ]
  });

  res.json({
    success: true,
    data: { invoice },
    message: 'Invoice updated successfully'
  });
});

/**
 * POST /api/v1/invoices/:id/items
 * Add inventory item to invoice
 */
exports.addItem = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Admin, Manager, or Sales (own invoices only)
  if (!req.user) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Authentication required' }
    });
  }
  if (!canEditInvoices(req.user.role) && req.user.role !== 'Sales') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to add items' }
    });
  }

  const {
    assetId, asset_id,
    unitPrice, unit_price,
    quantity = 1
  } = req.body;

  const _assetId = assetId || asset_id;
  const _unitPrice = unitPrice || unit_price;

  if (!_assetId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_ASSET', message: 'Asset ID is required' }
    });
  }

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Sales users can only modify their own invoices
  if (req.user.role === 'Sales' && invoice.created_by !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You can only modify your own invoices' }
    });
  }

  // Can only add items to invoices that are not paid (fully or partially) or cancelled
  if (['PAID', 'PARTIALLY_PAID', 'CANCELLED'].includes(invoice.status)) {
    const msg = invoice.status === 'CANCELLED'
      ? 'Cannot add items to cancelled invoices'
      : 'Cannot add items to invoices with payments. Void the payment first.';
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_LOCKED', message: msg }
    });
  }

  const transaction = await sequelize.transaction();

  try {
    // Lock asset row and check availability (SELECT FOR UPDATE)
    const { available, asset } = await computeAvailability(_assetId, { transaction });

    if (!asset) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'ASSET_NOT_FOUND', message: 'Inventory item not found' }
      });
    }

    if (asset.deleted_at) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'ASSET_DELETED', message: 'Inventory item has been deleted' }
      });
    }

    // Check if asset is already on this invoice
    const existingItem = await InvoiceItem.findOne({
      where: { invoice_id: id, asset_id: _assetId },
      transaction
    });

    // `available` already reflects current state:
    //   - For new items: available = on_hand - all_reserved
    //   - For existing items on this invoice: their qty IS counted in reserved,
    //     and we're adding MORE on top, so we check the additional qty against available.
    // In both cases, the check is: requested additional qty <= available.
    if (quantity > available) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: {
          code: 'ASSET_UNAVAILABLE',
          message: `Insufficient stock: ${available} available, ${quantity} requested`
        }
      });
    }

    if (existingItem) {
      // Increment quantity on existing line item (beforeSave hook recalculates totals)
      existingItem.quantity += quantity;
      await existingItem.save({ transaction });

      // Update asset computed status
      await asset.updateComputedStatus(transaction);

      // Log inventory event - added to invoice
      await InventoryItemEvent.logAddedToInvoice(asset, invoice, req.user?.id, transaction);

      await transaction.commit();

      // Recalculate invoice totals
      await invoice.recalculateTotals();

      // Reload item with asset
      await existingItem.reload({
        include: [{ model: Asset, as: 'asset' }]
      });

      // Log the edit
      await ActivityLog.log({
        actorUserId: req.user.id,
        actionType: 'INVOICE_ITEM_ADDED',
        entityType: 'INVOICE',
        entityId: invoice.id,
        summary: `Item quantity updated on invoice ${invoice.invoice_number}: ${asset.asset_tag} qty +${quantity}`,
        metadata: { invoiceNumber: invoice.invoice_number, assetTag: asset.asset_tag, assetId: _assetId, quantityAdded: quantity, newQuantity: existingItem.quantity }
      });

      return res.status(200).json({
        success: true,
        data: { item: existingItem, invoice },
        message: 'Item quantity updated on invoice'
      });
    }

    // Calculate cost in invoice currency
    let unitCost = parseFloat(asset.cost_amount) || 0;
    const originalCostCurrency = asset.cost_currency || 'USD';
    const originalCostAmount = unitCost;

    // Convert cost to invoice currency if different
    if (originalCostCurrency !== invoice.currency && unitCost > 0) {
      const fxRate = await exchangeRateService.getExchangeRate(originalCostCurrency, invoice.currency);
      const convertedCost = await exchangeRateService.convertAmount(unitCost, originalCostCurrency, invoice.currency);
      unitCost = convertedCost;

      // Store FX info on invoice if not already set
      if (!invoice.fx_rate_used) {
        invoice.fx_rate_source = 'hardcoded';
        invoice.fx_rate_used = fxRate;
        invoice.fx_fetched_at = new Date();
        await invoice.save({ transaction });
      }
    }

    // Use asset's selling price if no unit price provided
    const sellingPrice = _unitPrice !== undefined
      ? parseFloat(_unitPrice)
      : (parseFloat(asset.price_amount) || 0);

    // Create description from asset
    const description = `${asset.make} ${asset.model}${asset.serial_number ? ` (S/N: ${asset.serial_number})` : ''} [${asset.asset_tag}]`;

    // Create invoice item — this IS the reservation (no counter update needed)
    const item = await InvoiceItem.create({
      invoice_id: id,
      asset_id: _assetId,
      description,
      quantity,
      unit_price_amount: sellingPrice,
      unit_cost_amount: unitCost,
      original_cost_currency: originalCostCurrency,
      original_cost_amount: originalCostAmount
    }, { transaction });

    // Update asset computed status
    await asset.updateComputedStatus(transaction);

    // Log inventory event - added to invoice
    await InventoryItemEvent.logAddedToInvoice(asset, invoice, req.user?.id, transaction);

    await transaction.commit();

    // Recalculate invoice totals
    await invoice.recalculateTotals();

    // Reload item with asset
    await item.reload({
      include: [{ model: Asset, as: 'asset' }]
    });

    // Log the edit
    await ActivityLog.log({
      actorUserId: req.user.id,
      actionType: 'INVOICE_ITEM_ADDED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      summary: `Item added to invoice ${invoice.invoice_number}: ${asset.asset_tag}`,
      metadata: { invoiceNumber: invoice.invoice_number, assetTag: asset.asset_tag, assetId: _assetId, quantity, unitPrice: sellingPrice }
    });

    res.status(201).json({
      success: true,
      data: { item, invoice },
      message: 'Item added to invoice'
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * PATCH /api/v1/invoices/:id/items/:itemId
 * Update item selling price and/or discount on invoice
 */
exports.updateItemPrice = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;

  // Admin, Manager, or Sales (own invoices, for discount application during creation)
  if (!req.user) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Authentication required' }
    });
  }
  if (!canEditInvoices(req.user.role) && req.user.role !== 'Sales') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to edit invoice items' }
    });
  }

  const {
    unitPrice, unit_price,
    discount_type, discountType,
    discount_value, discountValue,
    quantity
  } = req.body;

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Sales users can only modify their own invoices
  if (req.user.role === 'Sales' && invoice.created_by !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You can only modify your own invoices' }
    });
  }

  if (['PAID', 'CANCELLED'].includes(invoice.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_LOCKED', message: 'Cannot update items on paid or cancelled invoices' }
    });
  }

  const item = await InvoiceItem.findOne({
    where: { id: itemId, invoice_id: id }
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Invoice item not found' }
    });
  }

  const changes = {};

  // Validate quantity if provided
  if (quantity !== undefined) {
    const newQty = parseInt(quantity, 10);
    if (!Number.isInteger(newQty) || newQty < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUANTITY', message: 'Quantity must be an integer >= 1' }
      });
    }
  }

  // Update price if provided
  const priceVal = unitPrice ?? unit_price;
  if (priceVal !== undefined) {
    const newPrice = parseFloat(priceVal);
    if (isNaN(newPrice) || newPrice < 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PRICE', message: 'Unit price must be a non-negative number' }
      });
    }
    changes.oldPrice = item.unit_price_amount;
    changes.newPrice = newPrice;
    item.unit_price_amount = newPrice;
  }

  // Update discount if provided
  const _discountType = discount_type || discountType;
  const _discountValue = discount_value ?? discountValue;

  if (_discountType !== undefined) {
    if (!['none', 'percentage', 'fixed'].includes(_discountType)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DISCOUNT_TYPE', message: 'Discount type must be none, percentage, or fixed' }
      });
    }
    item.discount_type = _discountType;
  }

  if (_discountValue !== undefined) {
    const dv = parseFloat(_discountValue);
    if (isNaN(dv) || dv < 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DISCOUNT_VALUE', message: 'Discount value must be a non-negative number' }
      });
    }
    if (item.discount_type === 'percentage' && dv > 100) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DISCOUNT_VALUE', message: 'Percentage discount cannot exceed 100%' }
      });
    }
    item.discount_value = dv;
  }

  // If discount type set to 'none', reset value
  if (item.discount_type === 'none') {
    item.discount_value = 0;
  }

  changes.discount_type = item.discount_type;
  changes.discount_value = item.discount_value;

  // Enforce discount limit based on user's max_discount_percent
  if (item.discount_type !== 'none' && item.discount_value > 0) {
    const dbUser = await User.findByPk(req.user.id, { attributes: ['max_discount_percent'] });
    const maxDiscount = dbUser?.max_discount_percent != null ? parseFloat(dbUser.max_discount_percent) : null;
    if (maxDiscount !== null) {
      let effectivePercent;
      if (item.discount_type === 'percentage') {
        effectivePercent = item.discount_value;
      } else {
        // fixed: calculate effective percentage
        const preDiscount = (item.quantity || 1) * (item.unit_price_amount || 0);
        effectivePercent = preDiscount > 0 ? (item.discount_value / preDiscount) * 100 : 0;
      }
      if (effectivePercent > maxDiscount) {
        return res.status(400).json({
          success: false,
          error: { code: 'DISCOUNT_LIMIT_EXCEEDED', message: `Maximum discount for your role is ${maxDiscount}%. Contact a manager for higher discounts.` }
        });
      }
    }
  }

  // Handle quantity update
  const newQty = quantity !== undefined ? parseInt(quantity, 10) : null;
  const needsAvailabilityCheck = newQty !== null && newQty > item.quantity;

  if (needsAvailabilityCheck) {
    // Increasing quantity — must check stock within a transaction
    const transaction = await sequelize.transaction();
    try {
      const delta = newQty - item.quantity;
      const { available } = await computeAvailability(item.asset_id, { transaction });
      // available = onHand - reserved (reserved includes this item's current qty)
      // We need delta more units, so check: delta <= available
      if (delta > available) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: { code: 'INSUFFICIENT_STOCK', message: `Only ${available} more units available (need ${delta})` }
        });
      }
      changes.oldQuantity = item.quantity;
      changes.newQuantity = newQty;
      item.quantity = newQty;

      // beforeSave hook recalculates totals including discount
      await item.save({ transaction });

      // Update asset computed status
      const asset = await Asset.findByPk(item.asset_id, { transaction });
      if (asset) await asset.updateComputedStatus(transaction);

      await transaction.commit();

      // Recalculate invoice totals (outside transaction, follows existing pattern)
      await invoice.recalculateTotals();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } else {
    // Decreasing or unchanged quantity, or no quantity change — no availability check needed
    if (newQty !== null && newQty !== item.quantity) {
      changes.oldQuantity = item.quantity;
      changes.newQuantity = newQty;
      item.quantity = newQty;
    }

    // beforeSave hook recalculates totals including discount
    await item.save();

    // Recalculate invoice totals
    await invoice.recalculateTotals();

    // Update asset computed status if quantity changed
    if (changes.oldQuantity !== undefined) {
      const asset = await Asset.findByPk(item.asset_id);
      if (asset) await asset.updateComputedStatus();
    }
  }

  // Reload item with asset
  await item.reload({
    include: [{ model: Asset, as: 'asset' }]
  });

  // Log the edit
  await ActivityLog.log({
    actorUserId: req.user.id,
    actionType: 'INVOICE_UPDATED',
    entityType: 'INVOICE',
    entityId: invoice.id,
    summary: `Item updated on invoice ${invoice.invoice_number}: ${item.description}`,
    metadata: { invoiceNumber: invoice.invoice_number, itemId, description: item.description, changes }
  });

  res.json({
    success: true,
    data: { item, invoice },
    message: 'Item updated'
  });
});

/**
 * PATCH /api/v1/invoices/:id/discount
 * Update invoice-level discount
 */
exports.updateInvoiceDiscount = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Admin, Manager, or Sales (own invoices)
  if (!req.user) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Authentication required' }
    });
  }
  if (!canEditInvoices(req.user.role) && req.user.role !== 'Sales') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to edit invoice discounts' }
    });
  }

  const {
    discount_type, discountType,
    discount_value, discountValue
  } = req.body;

  const _discountType = discount_type || discountType;
  const _discountValue = discount_value ?? discountValue;

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Sales users can only modify their own invoices
  if (req.user.role === 'Sales' && invoice.created_by !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You can only modify your own invoices' }
    });
  }

  if (['PAID', 'CANCELLED'].includes(invoice.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_LOCKED', message: 'Cannot update discount on paid or cancelled invoices' }
    });
  }

  if (_discountType !== undefined) {
    if (!['none', 'percentage', 'fixed'].includes(_discountType)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DISCOUNT_TYPE', message: 'Discount type must be none, percentage, or fixed' }
      });
    }
    invoice.discount_type = _discountType;
  }

  if (_discountValue !== undefined) {
    const dv = parseFloat(_discountValue);
    if (isNaN(dv) || dv < 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DISCOUNT_VALUE', message: 'Discount value must be a non-negative number' }
      });
    }
    if (invoice.discount_type === 'percentage' && dv > 100) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DISCOUNT_VALUE', message: 'Percentage discount cannot exceed 100%' }
      });
    }
    invoice.discount_value = dv;
  }

  // If discount type set to 'none', reset value
  if (invoice.discount_type === 'none') {
    invoice.discount_value = 0;
  }

  // Enforce discount limit
  if (invoice.discount_type !== 'none' && invoice.discount_value > 0) {
    const dbUser = await User.findByPk(req.user.id, { attributes: ['max_discount_percent'] });
    const maxDiscount = dbUser?.max_discount_percent != null ? parseFloat(dbUser.max_discount_percent) : null;
    if (maxDiscount !== null) {
      let effectivePercent;
      if (invoice.discount_type === 'percentage') {
        effectivePercent = invoice.discount_value;
      } else {
        const subtotal = parseFloat(invoice.subtotal_amount) || 0;
        effectivePercent = subtotal > 0 ? (invoice.discount_value / subtotal) * 100 : 0;
      }
      if (effectivePercent > maxDiscount) {
        return res.status(400).json({
          success: false,
          error: { code: 'DISCOUNT_LIMIT_EXCEEDED', message: `Maximum discount for your role is ${maxDiscount}%. Contact a manager for higher discounts.` }
        });
      }
    }
  }

  invoice.updated_by = req.user?.id;

  // recalculateTotals will compute discount_amount, discount_percent, total_amount, etc.
  await invoice.recalculateTotals();

  // Log the edit
  await ActivityLog.log({
    actorUserId: req.user.id,
    actionType: 'INVOICE_UPDATED',
    entityType: 'INVOICE',
    entityId: invoice.id,
    summary: `Invoice discount updated on ${invoice.invoice_number}: ${invoice.discount_type} ${invoice.discount_value}`,
    metadata: { invoiceNumber: invoice.invoice_number, discount_type: invoice.discount_type, discount_value: invoice.discount_value, discount_amount: invoice.discount_amount }
  });

  // Reload with associations
  await invoice.reload({
    include: [
      { model: Customer, as: 'customer' },
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'status', 'condition'] }]
      }
    ]
  });

  res.json({
    success: true,
    data: { invoice },
    message: 'Invoice discount updated'
  });
});

/**
 * DELETE /api/v1/invoices/:id/items/:itemId
 * Remove item from invoice
 */
exports.removeItem = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;

  // Admin, Manager, or Sales (own invoices only during creation)
  if (!req.user) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Authentication required' }
    });
  }
  if (!canEditInvoices(req.user.role) && req.user.role !== 'Sales') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to remove invoice items' }
    });
  }

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Sales users can only modify their own invoices
  if (req.user.role === 'Sales' && invoice.created_by !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'You can only modify your own invoices' }
    });
  }

  // Can only remove items from invoices that are not paid (fully or partially) or cancelled
  if (['PAID', 'PARTIALLY_PAID', 'CANCELLED'].includes(invoice.status)) {
    const msg = invoice.status === 'CANCELLED'
      ? 'Cannot remove items from cancelled invoices'
      : 'Cannot remove items from invoices with payments. Void the payment first.';
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_LOCKED', message: msg }
    });
  }

  const item = await InvoiceItem.findOne({
    where: { id: itemId, invoice_id: id },
    include: [{ model: Asset, as: 'asset' }]
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Invoice item not found' }
    });
  }

  const transaction = await sequelize.transaction();

  try {
    // Capture item info before deletion for logging
    const removedDescription = item.description;
    const removedAssetTag = item.asset?.asset_tag;
    const removedQuantity = item.quantity;
    const assetRef = item.asset;

    // Delete the item — this releases the reservation automatically
    await item.destroy({ transaction });

    // Update asset computed status (will go back to 'In Stock' if no other active items)
    if (assetRef) {
      await assetRef.updateComputedStatus(transaction);
    }

    await transaction.commit();

    // Recalculate invoice totals
    await invoice.recalculateTotals();

    // Log the edit
    await ActivityLog.log({
      actorUserId: req.user.id,
      actionType: 'INVOICE_ITEM_REMOVED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      summary: `Item removed from invoice ${invoice.invoice_number}: ${removedAssetTag || removedDescription}`,
      metadata: { invoiceNumber: invoice.invoice_number, itemId, description: removedDescription, assetTag: removedAssetTag, quantity: removedQuantity }
    });

    res.json({
      success: true,
      data: { invoice },
      message: 'Item removed from invoice'
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * POST /api/v1/invoices/:id/items/:itemId/void
 * Void a line item on a PAID invoice (admin only, soft-delete with audit trail)
 */
exports.voidItem = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;
  const { reason, quantity: voidQty } = req.body;
  const userId = req.user?.id;

  // Admin or Manager
  if (!req.user || !canVoidInvoices(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only admins and managers can void invoice items' }
    });
  }

  if (!reason || reason.trim() === '') {
    return res.status(400).json({
      success: false,
      error: { code: 'REASON_REQUIRED', message: 'A reason is required when voiding an item' }
    });
  }

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  if (invoice.status !== 'PAID') {
    return res.status(400).json({
      success: false,
      error: { code: 'NOT_PAID', message: 'Items can only be voided on paid invoices. For unpaid invoices, remove the item instead.' }
    });
  }

  const item = await InvoiceItem.findOne({
    where: { id: itemId, invoice_id: id },
    include: [{ model: Asset, as: 'asset' }]
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Invoice item not found' }
    });
  }

  if (item.voided_at) {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_VOIDED', message: 'This item has already been voided' }
    });
  }

  // Determine how many to void (default: all)
  const quantityToVoid = voidQty ? parseInt(voidQty) : item.quantity;

  if (quantityToVoid <= 0 || quantityToVoid > item.quantity) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_QUANTITY', message: `Void quantity must be between 1 and ${item.quantity}` }
    });
  }

  const isFullVoid = quantityToVoid === item.quantity;

  // Block voiding if this would leave a paid invoice with zero non-voided items
  if (isFullVoid) {
    const nonVoidedCount = await InvoiceItem.count({
      where: { invoice_id: id, voided_at: null }
    });

    if (nonVoidedCount <= 1) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'LAST_ITEM',
          message: 'Cannot void the last item on a paid invoice. Void the payment first, then remove or cancel the invoice.'
        }
      });
    }
  }

  const dbTransaction = await sequelize.transaction();

  try {
    if (isFullVoid) {
      // Full void — mark the entire item as voided
      item.voided_at = new Date();
      item.voided_by_user_id = userId;
      item.void_reason = reason.trim();
      await item.save({ transaction: dbTransaction });
    } else {
      // Partial void — reduce original item qty, create a voided split line
      item.quantity -= quantityToVoid;
      await item.save({ transaction: dbTransaction }); // beforeSave hook recalculates totals

      await InvoiceItem.create({
        invoice_id: id,
        asset_id: item.asset_id,
        description: item.description,
        quantity: quantityToVoid,
        unit_price_amount: item.unit_price_amount,
        unit_cost_amount: item.unit_cost_amount,
        original_cost_currency: item.original_cost_currency,
        original_cost_amount: item.original_cost_amount,
        voided_at: new Date(),
        voided_by_user_id: userId,
        void_reason: reason.trim()
      }, { transaction: dbTransaction });
    }

    // Restore on_hand for voided quantity since payment had decremented it
    if (item.asset) {
      item.asset.quantity += quantityToVoid;
      await item.asset.save({ transaction: dbTransaction });
      await item.asset.updateComputedStatus(dbTransaction);
    }

    await dbTransaction.commit();

    // Recalculate invoice totals (excludes voided items)
    await invoice.recalculateTotals();

    // Log activity
    await ActivityLog.logInvoiceItemVoided(item, invoice, userId, reason.trim());

    // Reload invoice with all data
    const updatedInvoice = await Invoice.findByPk(id, {
      include: [
        { model: Customer, as: 'customer' },
        {
          model: InvoiceItem,
          as: 'items',
          include: [
            { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'status', 'condition'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ]
        },
        {
          model: InvoicePayment,
          as: 'payments',
          include: [
            { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ]
        }
      ]
    });

    const data = updatedInvoice.toJSON();
    if (data.customer) {
      data.customer.displayName = data.customer.first_name
        ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
        : data.customer.company_name || 'Unknown';
    }

    res.json({
      success: true,
      data: { invoice: data },
      message: 'Item voided successfully. Invoice totals recalculated.'
    });
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
});

/**
 * POST /api/v1/invoices/:id/transactions
 * Create a transaction (PAYMENT or REFUND) for invoice
 */
exports.createTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    transactionType, transaction_type,
    amount,
    comment,
    transactionDate, transaction_date, paymentDate, payment_date,
    paymentMethod, payment_method,
    paymentMethodOtherText, payment_method_other_text
  } = req.body;

  const VALID_PAYMENT_METHODS = ['Cash', 'MoMo', 'Card', 'ACH', 'Other'];
  const VALID_TRANSACTION_TYPES = ['PAYMENT', 'REFUND'];

  // Normalize field names
  const _transactionType = transactionType || transaction_type || 'PAYMENT';
  const _paymentMethod = paymentMethod || payment_method;
  const _paymentMethodOtherText = paymentMethodOtherText || payment_method_other_text;
  const _transactionDate = transactionDate || transaction_date || paymentDate || payment_date || new Date();

  // Validate transaction type
  if (!VALID_TRANSACTION_TYPES.includes(_transactionType)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_TYPE', message: `Transaction type must be one of: ${VALID_TRANSACTION_TYPES.join(', ')}` }
    });
  }

  // Validate amount
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
    });
  }

  // Validate payment method
  if (!_paymentMethod) {
    return res.status(400).json({
      success: false,
      error: { code: 'METHOD_REQUIRED', message: 'Payment method is required' }
    });
  }

  if (!VALID_PAYMENT_METHODS.includes(_paymentMethod)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_METHOD', message: `Invalid payment method. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}` }
    });
  }

  // If "Other", require specification
  if (_paymentMethod === 'Other' && (!_paymentMethodOtherText || _paymentMethodOtherText.trim() === '')) {
    return res.status(400).json({
      success: false,
      error: { code: 'OTHER_TEXT_REQUIRED', message: 'Please specify the payment method when selecting "Other"' }
    });
  }

  if (!comment || comment.trim() === '') {
    return res.status(400).json({
      success: false,
      error: { code: 'COMMENT_REQUIRED', message: 'Comment is required describing the transaction details' }
    });
  }

  const invoice = await Invoice.findByPk(id, {
    include: [
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset' }]
      }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  if (invoice.status === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_CANCELLED', message: 'Cannot add transaction to cancelled invoice' }
    });
  }

  // Block payments when all items have been fully returned
  if (_transactionType === 'PAYMENT' && invoice.items && invoice.items.length > 0) {
    const allReturned = invoice.items.every(item =>
      item.quantity_returned_total >= item.quantity
    );
    if (allReturned) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALL_ITEMS_RETURNED',
          message: 'Cannot record payment — all items on this invoice have been returned'
        }
      });
    }
  }

  const txAmount = parseFloat(amount);
  const currentPaid = parseFloat(invoice.amount_paid) || 0;
  const totalAmount = parseFloat(invoice.total_amount) || 0;

  // Validate based on transaction type
  if (_transactionType === 'PAYMENT') {
    // Check if already fully paid
    if (invoice.status === 'PAID') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_PAID', message: 'Invoice is already fully paid' }
      });
    }

    // Check for overpayment
    if (currentPaid + txAmount > totalAmount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'OVERPAYMENT',
          message: `Payment would exceed invoice total. Maximum allowed: ${(totalAmount - currentPaid).toFixed(2)} ${invoice.currency}`
        }
      });
    }
  } else if (_transactionType === 'REFUND') {
    // Check that refund doesn't make amount_paid negative
    if (currentPaid - txAmount < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REFUND_EXCEEDS_PAID',
          message: `Refund cannot exceed amount paid. Maximum refund allowed: ${currentPaid.toFixed(2)} ${invoice.currency}`
        }
      });
    }
  }

  const dbTransaction = await sequelize.transaction();

  try {
    // Create transaction record
    const txRecord = await InvoicePayment.create({
      invoice_id: id,
      transaction_type: _transactionType,
      payment_date: _transactionDate,
      amount: txAmount,
      currency: invoice.currency,
      payment_method: _paymentMethod,
      payment_method_other_text: _paymentMethod === 'Other' ? _paymentMethodOtherText.trim() : null,
      comment: comment.trim(),
      received_by_user_id: req.user?.id
    }, { transaction: dbTransaction });

    // Recalculate invoice totals
    const prevStatus = invoice.status;
    invoice.updated_by = req.user?.id;
    const totals = await recalculateInvoiceTotals(invoice, dbTransaction);

    // If invoice just became PAID, decrement on_hand and update status
    if (prevStatus !== 'PAID' && totals.status === 'PAID') {
      await invoice.handlePaidTransition(dbTransaction, req.user?.id);
    }

    // Log payment received event for each item on the invoice
    if (_transactionType === 'PAYMENT' && invoice.items) {
      for (const item of invoice.items) {
        if (item.asset) {
          await InventoryItemEvent.logPaymentReceived(item.asset, txRecord, invoice, req.user?.id, dbTransaction);
        }
      }
    }

    // Log activity
    if (_transactionType === 'PAYMENT') {
      await ActivityLog.logPaymentReceived(txRecord, invoice, req.user?.id);
    } else {
      await ActivityLog.logRefundRecorded(txRecord, invoice, req.user?.id);
    }

    await dbTransaction.commit();

    // Reload transaction with user
    await txRecord.reload({
      include: [
        { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
        { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
      ]
    });

    // Reload invoice with all data (including items so frontend doesn't lose them)
    await invoice.reload({
      include: [
        { model: Customer, as: 'customer' },
        {
          model: InvoiceItem,
          as: 'items',
          include: [
            { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'status', 'condition'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ]
        },
        {
          model: InvoicePayment,
          as: 'payments',
          include: [
            { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ],
          order: [['payment_date', 'DESC']]
        }
      ]
    });

    const typeLabel = _transactionType === 'PAYMENT' ? 'Payment' : 'Refund';
    let message = `${typeLabel} recorded successfully`;
    if (_transactionType === 'PAYMENT' && totals.status === 'PAID') {
      message = 'Payment received. Invoice is now fully paid.';
    }

    res.status(201).json({
      success: true,
      data: { transaction: txRecord, invoice },
      message
    });
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
});

/**
 * POST /api/v1/invoices/:id/payments (legacy endpoint - calls createTransaction)
 * Receive payment for invoice
 */
exports.receivePayment = asyncHandler(async (req, res, next) => {
  // Add transaction_type = PAYMENT and delegate
  req.body.transaction_type = 'PAYMENT';
  return exports.createTransaction(req, res, next);
});

/**
 * GET /api/v1/invoices/:id/transactions
 * Get transaction history for invoice
 */
exports.getTransactions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeVoided } = req.query;

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  const where = { invoice_id: id };
  if (includeVoided !== 'true') {
    where.voided_at = null;
  }

  const transactions = await InvoicePayment.findAll({
    where,
    include: [
      { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
      { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
    ],
    order: [['payment_date', 'DESC']]
  });

  // Calculate totals from active transactions only
  const activeTransactions = transactions.filter(tx => !tx.voided_at);
  let paymentsSum = 0;
  let refundsSum = 0;

  for (const tx of activeTransactions) {
    const amount = parseFloat(tx.amount) || 0;
    if (tx.transaction_type === 'PAYMENT') {
      paymentsSum += amount;
    } else if (tx.transaction_type === 'REFUND') {
      refundsSum += amount;
    }
  }

  res.json({
    success: true,
    data: {
      transactions,
      summary: {
        totalAmount: invoice.total_amount,
        paymentsSum,
        refundsSum,
        amountPaid: invoice.amount_paid,
        balanceDue: invoice.balance_due,
        transactionCount: transactions.length,
        activeCount: activeTransactions.length
      }
    }
  });
});

/**
 * POST /api/v1/invoices/:id/transactions/:txId/void
 * Void a transaction (soft delete with audit trail)
 */
exports.voidTransaction = asyncHandler(async (req, res) => {
  const { id, txId } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id;

  if (!reason || reason.trim() === '') {
    return res.status(400).json({
      success: false,
      error: { code: 'REASON_REQUIRED', message: 'A reason is required when voiding a transaction' }
    });
  }

  const invoice = await Invoice.findByPk(id, {
    include: [
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset' }]
      }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  if (invoice.status === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_CANCELLED', message: 'Cannot void transactions on a cancelled invoice' }
    });
  }

  const transaction = await InvoicePayment.findOne({
    where: { id: txId, invoice_id: id }
  });

  if (!transaction) {
    return res.status(404).json({
      success: false,
      error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' }
    });
  }

  if (transaction.voided_at) {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_VOIDED', message: 'This transaction has already been voided' }
    });
  }

  const dbTransaction = await sequelize.transaction();

  try {
    const prevStatus = invoice.status;

    // Void the transaction
    transaction.voided_at = new Date();
    transaction.voided_by_user_id = userId;
    transaction.void_reason = reason.trim();
    await transaction.save({ transaction: dbTransaction });

    // Recalculate invoice totals
    await recalculateInvoiceTotals(invoice, dbTransaction);

    // If invoice was PAID and is no longer PAID, restore on_hand
    if (prevStatus === 'PAID' && invoice.status !== 'PAID') {
      await invoice.handleUnpaidTransition(dbTransaction);
    }

    // Log activity
    await ActivityLog.logTransactionVoided(transaction, invoice, userId, reason.trim());

    await dbTransaction.commit();

    // Reload with associations
    const updatedTransaction = await InvoicePayment.findByPk(txId, {
      include: [
        { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
        { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
      ]
    });

    const updatedInvoice = await Invoice.findByPk(id, {
      include: [
        { model: Customer, as: 'customer' },
        {
          model: InvoiceItem,
          as: 'items',
          include: [
            { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'status', 'condition'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ]
        },
        {
          model: InvoicePayment,
          as: 'payments',
          include: [
            { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ]
        }
      ]
    });

    res.json({
      success: true,
      data: {
        transaction: updatedTransaction,
        invoice: updatedInvoice
      },
      message: `${transaction.transaction_type === 'PAYMENT' ? 'Payment' : 'Refund'} voided successfully`
    });
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
});

/**
 * GET /api/v1/invoices/:id/payments (legacy endpoint)
 * Get payment history for invoice
 */
exports.getPayments = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  const payments = await InvoicePayment.findAll({
    where: { invoice_id: id },
    include: [
      { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
      { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
    ],
    order: [['payment_date', 'DESC']]
  });

  res.json({
    success: true,
    data: {
      payments,
      summary: {
        totalAmount: invoice.total_amount,
        amountPaid: invoice.amount_paid,
        balanceDue: invoice.balance_due,
        paymentCount: payments.length
      }
    }
  });
});

/**
 * POST /api/v1/invoices/:id/cancel
 * Cancel invoice - Admin only, requires net paid = 0
 * Restores inventory and logs events for each item
 */
exports.cancel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id;

  // Admin or Manager
  if (!req.user || !canEditInvoices(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only admins and managers can cancel invoices'
      }
    });
  }

  const invoice = await Invoice.findByPk(id, {
    include: [
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset' }]
      },
      {
        model: InvoicePayment,
        as: 'payments',
        where: { voided_at: null },
        required: false
      }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  if (invoice.status === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_CANCELLED', message: 'Invoice is already cancelled' }
    });
  }

  // Calculate net paid from active transactions
  let paymentsSum = 0;
  let refundsSum = 0;

  if (invoice.payments) {
    for (const tx of invoice.payments) {
      const amount = parseFloat(tx.amount) || 0;
      if (tx.transaction_type === 'PAYMENT') {
        paymentsSum += amount;
      } else if (tx.transaction_type === 'REFUND') {
        refundsSum += amount;
      }
    }
  }

  const netPaid = paymentsSum - refundsSum;

  // Prevent cancelling if net paid > 0
  if (netPaid > 0) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'HAS_NET_PAYMENTS',
        message: `Cannot cancel invoice with outstanding payments. Net paid: ${netPaid.toFixed(2)} ${invoice.currency}. Refund all payments first so net paid = 0.`,
        details: {
          paymentsSum,
          refundsSum,
          netPaid
        }
      }
    });
  }

  const dbTransaction = await sequelize.transaction();

  try {
    // Set invoice to CANCELLED first so asset status queries exclude this invoice
    invoice.status = 'CANCELLED';
    invoice.subtotal_amount = 0;
    invoice.total_amount = 0;
    invoice.balance_due = 0;
    invoice.amount_paid = 0;
    invoice.total_cost_amount = 0;
    invoice.total_profit_amount = 0;
    invoice.margin_percent = null;
    invoice.cancelled_at = new Date();
    invoice.cancelled_by_user_id = userId;
    invoice.cancellation_reason = reason || null;
    invoice.updated_by = userId;
    await invoice.save({ transaction: dbTransaction });

    const releasedItems = [];

    // Update asset statuses — CANCELLED invoices are automatically excluded from reserved count
    for (const item of invoice.items) {
      if (item.asset && !item.voided_at) {
        const previousStatus = item.asset.status;

        // Update computed status (will go back to 'In Stock' if no other active items)
        await item.asset.updateComputedStatus(dbTransaction);

        const newStatus = item.asset.status;

        // Log invoice cancelled event
        await InventoryItemEvent.logInvoiceCancelled(
          item.asset,
          invoice,
          reason,
          userId,
          dbTransaction
        );

        // Log inventory released event
        await InventoryItemEvent.logInvoiceCancelledInventoryReleased(
          item.asset,
          invoice,
          newStatus,
          userId,
          dbTransaction
        );

        releasedItems.push({
          assetId: item.asset.id,
          assetTag: item.asset.asset_tag,
          previousStatus,
          newStatus
        });
      }
    }

    // Log activity
    await ActivityLog.logInvoiceCancelled(invoice, userId, reason);

    await dbTransaction.commit();

    // Reload invoice with associations
    await invoice.reload({
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'cancelledBy', attributes: ['id', 'full_name'] },
        {
          model: InvoiceItem,
          as: 'items',
          include: [
            { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'status', 'condition'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ]
        },
        {
          model: InvoicePayment,
          as: 'payments',
          include: [
            { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
            { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
          ]
        }
      ]
    });

    res.json({
      success: true,
      data: {
        invoice,
        releasedItemsCount: releasedItems.length,
        releasedItems
      },
      message: 'Invoice cancelled successfully. All items have been released back to inventory.'
    });
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
});

/**
 * DELETE /api/v1/invoices/:id
 * Soft-delete invoice (Admin only)
 * Preserves audit trail - does not hard-delete
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Admin-only check
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only Admin users can delete invoices'
      }
    });
  }

  const invoice = await Invoice.findByPk(id, {
    include: [
      { model: InvoiceItem, as: 'items' },
      { model: InvoicePayment, as: 'payments', where: { voided_at: null }, required: false }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  if (invoice.is_deleted) {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_DELETED', message: 'Invoice is already deleted' }
    });
  }

  // Only allow delete if invoice is UNPAID or CANCELLED with no active items
  if (invoice.status !== 'UNPAID' && invoice.status !== 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CANNOT_DELETE',
        message: 'Can only delete unpaid or cancelled invoices. Cancel the invoice first if needed.'
      }
    });
  }

  // If invoice has items and is not cancelled, require removal first
  if (invoice.status === 'UNPAID' && invoice.items && invoice.items.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'HAS_ITEMS',
        message: 'Remove all items before deleting invoice, or cancel the invoice first'
      }
    });
  }

  // Soft-delete the invoice
  invoice.is_deleted = true;
  invoice.deleted_at = new Date();
  invoice.deleted_by_user_id = userId;
  invoice.updated_by = userId;
  await invoice.save();

  res.json({
    success: true,
    data: {
      deleted: true,
      invoiceId: invoice.id
    },
    message: 'Invoice deleted successfully'
  });
});

/**
 * GET /api/v1/invoices/available-assets
 * Get inventory items available for invoicing
 */
exports.getAvailableAssets = asyncHandler(async (req, res) => {
  const { search, category, limit = 20, excludeInvoiceId } = req.query;

  // Use subquery to compute available quantity from invoice_items
  // When excludeInvoiceId is provided, that invoice's items are excluded from
  // the reserved count so the caller can do its own local subtraction.
  let searchClause = '';
  const replacements = {};

  if (search) {
    searchClause = `AND (a.asset_tag ILIKE :search OR a.serial_number ILIKE :search OR a.make ILIKE :search OR a.model ILIKE :search)`;
    replacements.search = `%${search}%`;
  }

  let categoryClause = '';
  if (category) {
    categoryClause = `AND a.category = :category`;
    replacements.category = category;
  }

  let excludeInvoiceClause = '';
  if (excludeInvoiceId) {
    excludeInvoiceClause = `AND i.id != :excludeInvoiceId`;
    replacements.excludeInvoiceId = excludeInvoiceId;
  }

  const [assets] = await sequelize.query(
    `SELECT a.id, a.asset_tag, a.make, a.model, a.serial_number,
            a.condition, a.status, a.quantity,
            a.cost_amount, a.cost_currency,
            a.price_amount, a.price_currency,
            a.category, a.asset_type,
            COALESCE(reserved.total, 0) AS reserved_quantity,
            (a.quantity - COALESCE(reserved.total, 0)) AS available_quantity
     FROM assets a
     LEFT JOIN (
       SELECT ii.asset_id, SUM(ii.quantity) AS total
       FROM invoice_items ii
       JOIN invoices i ON ii.invoice_id = i.id
       WHERE i.status NOT IN ('CANCELLED', 'PAID') AND ii.voided_at IS NULL
         ${excludeInvoiceClause}
       GROUP BY ii.asset_id
     ) reserved ON a.id = reserved.asset_id
     WHERE a.deleted_at IS NULL
       AND (a.quantity - COALESCE(reserved.total, 0)) > 0
       ${searchClause}
       ${categoryClause}
     ORDER BY a.created_at DESC
     LIMIT :limit`,
    {
      replacements: { ...replacements, limit: parseInt(limit) }
    }
  );

  res.json({
    success: true,
    data: { assets }
  });
});

/**
 * GET /api/v1/invoices/:id/pdf
 * Generate and serve invoice PDF
 */
exports.generatePdf = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { download } = req.query;

  const invoice = await Invoice.findByPk(id, {
    include: [
      { model: Customer, as: 'customer' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      {
        model: InvoiceItem,
        as: 'items',
        include: [
          {
            model: Asset,
            as: 'asset',
            attributes: ['id', 'asset_tag', 'make', 'model', 'serial_number', 'status']
          }
        ]
      },
      {
        model: InvoicePayment,
        as: 'payments',
        include: [
          { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] }
        ],
        order: [['payment_date', 'DESC']]
      }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Get company profile
  const companyProfile = await CompanyProfile.findOne({
    where: { is_active: true }
  });

  // Add display name to customer
  const invoiceData = invoice.toJSON();
  if (invoiceData.customer) {
    invoiceData.customer.displayName = invoiceData.customer.first_name
      ? `${invoiceData.customer.first_name} ${invoiceData.customer.last_name || ''}`.trim()
      : invoiceData.customer.company_name || 'Customer';
  }

  try {
    // Clean up old PDFs for this invoice
    invoicePdfService.cleanupOldPdfs(invoice.invoice_number);

    // Generate new PDF
    const { filePath, fileName, accessToken } = await invoicePdfService.generatePdf(
      invoiceData,
      companyProfile
    );

    // Store PDF info on invoice for later retrieval
    await invoice.update({
      pdf_access_token: accessToken,
      pdf_generated_at: new Date()
    });

    if (download === 'true') {
      // Direct download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      fs.createReadStream(filePath).pipe(res);
    } else {
      // Return PDF URL
      const pdfUrl = `/api/v1/invoices/${id}/pdf/download?token=${accessToken}`;

      res.json({
        success: true,
        data: {
          pdfUrl,
          fileName,
          accessToken,
          expiresIn: '7 days'
        }
      });
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'PDF_ERROR', message: 'Failed to generate PDF' }
    });
  }
});

/**
 * GET /api/v1/invoices/:id/pdf/download
 * Download generated PDF with access token
 * Token is valid for 7 days
 */
exports.downloadPdf = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: { code: 'TOKEN_REQUIRED', message: 'Access token is required' }
    });
  }

  const invoice = await Invoice.findByPk(id, {
    include: [
      { model: Customer, as: 'customer' },
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset' }]
      },
      {
        model: InvoicePayment,
        as: 'payments',
        include: [{ model: User, as: 'receivedBy', attributes: ['id', 'full_name'] }]
      }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Verify token matches
  if (invoice.pdf_access_token !== token) {
    return res.status(403).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired access token' }
    });
  }

  // Check if PDF was generated within 7 days
  const PDF_EXPIRY_DAYS = 7;
  let needsRegeneration = false;

  if (invoice.pdf_generated_at) {
    const generatedAt = new Date(invoice.pdf_generated_at);
    const daysSinceGenerated = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceGenerated > PDF_EXPIRY_DAYS) {
      needsRegeneration = true;
    }
  }

  // Find PDF file
  let pdfPath = invoicePdfService.getPdfPath(invoice.invoice_number, token);

  // If PDF not found or expired, regenerate it
  if (!pdfPath || !fs.existsSync(pdfPath) || needsRegeneration) {
    try {
      // Get company profile for regeneration
      const companyProfile = await CompanyProfile.findOne({ where: { is_active: true } });

      // Prepare invoice data
      const invoiceData = invoice.toJSON();
      if (invoiceData.customer) {
        invoiceData.customer.displayName = invoiceData.customer.first_name
          ? `${invoiceData.customer.first_name} ${invoiceData.customer.last_name || ''}`.trim()
          : invoiceData.customer.company_name || 'Customer';
      }

      // Regenerate PDF with same token
      invoicePdfService.cleanupOldPdfs(invoice.invoice_number);
      const result = await invoicePdfService.generatePdf(invoiceData, companyProfile, token);
      pdfPath = result.filePath;

      // Update generation time but keep same token
      await invoice.update({
        pdf_generated_at: new Date()
      });
    } catch (err) {
      console.error('PDF regeneration error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'PDF_ERROR', message: 'Failed to generate PDF. Please try again.' }
      });
    }
  }

  const fileName = `Invoice-${invoice.invoice_number}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  fs.createReadStream(pdfPath).pipe(res);
});

/**
 * GET /api/v1/invoices/:id/whatsapp-link
 * Generate WhatsApp share link for invoice
 */
exports.getWhatsAppLink = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { baseUrl } = req.query; // Frontend can pass the base URL

  const invoice = await Invoice.findByPk(id, {
    include: [
      { model: Customer, as: 'customer' }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Check if customer has WhatsApp
  if (!invoice.customer || !invoice.customer.whatsapp_e164) {
    return res.status(400).json({
      success: false,
      error: { code: 'NO_WHATSAPP', message: 'Customer does not have a WhatsApp number' }
    });
  }

  // Get company profile for company name
  const companyProfile = await CompanyProfile.findOne({
    where: { is_active: true }
  });

  const companyName = companyProfile?.company_name || 'Our Company';

  // Get or generate PDF URL
  let pdfUrl = '';
  if (invoice.pdf_access_token && invoice.pdf_generated_at) {
    const generatedAt = new Date(invoice.pdf_generated_at);
    const hoursSinceGenerated = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceGenerated < 24) {
      // Use existing PDF
      const appBaseUrl = baseUrl || process.env.APP_URL || 'http://localhost:3000';
      pdfUrl = `${appBaseUrl}/api/v1/invoices/${id}/pdf/download?token=${invoice.pdf_access_token}`;
    }
  }

  // If no valid PDF URL, need to generate new PDF
  if (!pdfUrl) {
    // Generate PDF first
    const invoiceData = invoice.toJSON();
    if (invoiceData.customer) {
      invoiceData.customer.displayName = invoiceData.customer.first_name
        ? `${invoiceData.customer.first_name} ${invoiceData.customer.last_name || ''}`.trim()
        : invoiceData.customer.company_name || 'Customer';
    }

    invoicePdfService.cleanupOldPdfs(invoice.invoice_number);
    const { accessToken } = await invoicePdfService.generatePdf(invoiceData, companyProfile);

    await invoice.update({
      pdf_access_token: accessToken,
      pdf_generated_at: new Date()
    });

    const appBaseUrl = baseUrl || process.env.APP_URL || 'http://localhost:3000';
    pdfUrl = `${appBaseUrl}/api/v1/invoices/${id}/pdf/download?token=${accessToken}`;
  }

  // Format customer name
  const customerName = invoice.customer.first_name
    ? `${invoice.customer.first_name}${invoice.customer.last_name ? ' ' + invoice.customer.last_name : ''}`
    : invoice.customer.company_name || 'Valued Customer';

  // Format amounts
  const formatCurrency = (amount, currency = 'GHS') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Compose WhatsApp message
  const message = [
    `Hello ${customerName},`,
    '',
    `This is a reminder for Invoice ${invoice.invoice_number} from ${companyName}.`,
    '',
    `Invoice Total: ${formatCurrency(invoice.total_amount, invoice.currency)}`,
    invoice.amount_paid > 0 ? `Amount Paid: ${formatCurrency(invoice.amount_paid, invoice.currency)}` : null,
    `Balance Due: ${formatCurrency(invoice.balance_due, invoice.currency)}`,
    '',
    `You can view and download your invoice here:`,
    pdfUrl,
    '',
    `Thank you for your business!`
  ].filter(Boolean).join('\n');

  // Clean WhatsApp number (remove + if present for wa.me)
  const whatsappNumber = invoice.customer.whatsapp_e164.replace(/^\+/, '');

  // Generate WhatsApp link
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  res.json({
    success: true,
    data: {
      whatsappLink,
      customerName,
      whatsappNumber: invoice.customer.whatsapp_e164,
      message,
      pdfUrl
    }
  });
});

module.exports = exports;
