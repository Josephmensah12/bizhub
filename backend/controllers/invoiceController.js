/**
 * Invoice Controller
 *
 * CRUD operations for invoices with payments and inventory locking
 */

const { Invoice, InvoiceItem, InvoicePayment, Customer, Asset, User, CompanyProfile, ActivityLog, InventoryItemEvent, sequelize } = require('../models');
const { Op } = require('sequelize');
const exchangeRateService = require('../services/exchangeRateService');
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

  // Calculate net paid: payments - refunds
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

  const netPaid = Math.max(0, paymentsSum - refundsSum);
  const totalAmount = parseFloat(invoice.total_amount) || 0;
  const balanceDue = totalAmount - netPaid;

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

  // Calculate aggregated metrics for the date range
  const metrics = await Invoice.findOne({
    where,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('total_amount')), 'totalRevenue'],
      [sequelize.fn('SUM', sequelize.col('total_cost_amount')), 'totalCost'],
      [sequelize.fn('SUM', sequelize.col('total_profit_amount')), 'totalProfit'],
      [sequelize.fn('SUM', sequelize.col('amount_paid')), 'totalCollected'],
      [sequelize.fn('SUM', sequelize.col('balance_due')), 'totalOutstanding'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount']
    ],
    raw: true
  });

  const totalRevenue = parseFloat(metrics.totalRevenue) || 0;
  const totalCost = parseFloat(metrics.totalCost) || 0;
  const totalProfit = parseFloat(metrics.totalProfit) || 0;
  const totalCollected = parseFloat(metrics.totalCollected) || 0;
  const totalOutstanding = parseFloat(metrics.totalOutstanding) || 0;
  const marginPercent = totalCost > 0 ? ((totalProfit / totalCost) * 100) : 0;

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

  res.json({
    success: true,
    data: {
      invoices,
      metrics: {
        totalRevenue,
        totalCost,
        totalProfit,
        totalCollected,
        totalOutstanding,
        marginPercent: parseFloat(marginPercent.toFixed(2)),
        invoiceCount: parseInt(metrics.invoiceCount) || 0
      },
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

  const data = invoice.toJSON();
  if (data.customer) {
    data.customer.displayName = data.customer.first_name
      ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
      : data.customer.company_name || 'Unknown';
  }

  res.json({
    success: true,
    data: { invoice: data }
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
    invoice.customer_id = _customerId;
  }

  if (_invoiceDate !== undefined) {
    invoice.invoice_date = _invoiceDate;
  }

  if (currency !== undefined) {
    invoice.currency = currency;
  }

  if (notes !== undefined) {
    invoice.notes = notes;
  }

  invoice.updated_by = req.user?.id;
  await invoice.save();

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

  // Can only add items to UNPAID invoices
  if (invoice.status !== 'UNPAID') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_LOCKED', message: 'Can only add items to unpaid invoices' }
    });
  }

  // Check if asset exists and is available
  const asset = await Asset.findByPk(_assetId);

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: { code: 'ASSET_NOT_FOUND', message: 'Inventory item not found' }
    });
  }

  if (!asset.canBeSold()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'ASSET_UNAVAILABLE',
        message: `Inventory item is not available (${asset.quantityRemaining} remaining of ${asset.quantity})`
      }
    });
  }

  // Check if asset is already on this invoice
  const existingItem = await InvoiceItem.findOne({
    where: { invoice_id: id, asset_id: _assetId }
  });

  const transaction = await sequelize.transaction();

  try {
    // If item already exists on invoice, increment its quantity
    if (existingItem) {
      // Reserve one more unit (will throw if insufficient)
      asset.reserve(quantity);
      await asset.save({ transaction });

      // Increment quantity on existing line item (beforeSave hook recalculates totals)
      existingItem.quantity += quantity;
      await existingItem.save({ transaction });

      // Log inventory event - added to invoice
      await InventoryItemEvent.logAddedToInvoice(asset, invoice, req.user?.id, transaction);

      await transaction.commit();

      // Recalculate invoice totals
      await invoice.recalculateTotals();

      // Reload item with asset
      await existingItem.reload({
        include: [{ model: Asset, as: 'asset' }]
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

    // Create invoice item
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

    // Reserve the asset (quantity-based)
    asset.reserve(quantity);
    await asset.save({ transaction });

    // Log inventory event - added to invoice
    await InventoryItemEvent.logAddedToInvoice(asset, invoice, req.user?.id, transaction);

    await transaction.commit();

    // Recalculate invoice totals
    await invoice.recalculateTotals();

    // Reload item with asset
    await item.reload({
      include: [{ model: Asset, as: 'asset' }]
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
 * DELETE /api/v1/invoices/:id/items/:itemId
 * Remove item from invoice
 */
exports.removeItem = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;

  const invoice = await Invoice.findByPk(id);

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Can only remove items from invoices that are not fully paid or cancelled
  if (['PAID', 'CANCELLED'].includes(invoice.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_LOCKED', message: 'Cannot remove items from paid or cancelled invoices' }
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
    // Restore reserved quantity to stock
    if (item.asset) {
      item.asset.restoreToStock(item.quantity);
      await item.asset.save({ transaction });
    }

    // Delete the item
    await item.destroy({ transaction });

    await transaction.commit();

    // Recalculate invoice totals
    await invoice.recalculateTotals();

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

    // If invoice just became PAID, mark assets as Sold (move reserved → sold)
    if (prevStatus !== 'PAID' && totals.status === 'PAID' && invoice.items) {
      for (const item of invoice.items) {
        if (item.asset && item.asset.quantity_reserved > 0) {
          item.asset.markAsSold(item.quantity);
          await item.asset.save({ transaction: dbTransaction });
          // Log inventory event - item sold
          await InventoryItemEvent.logSold(item.asset, invoice, req.user?.id, dbTransaction);
        }
      }
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

    // Reload invoice with all data
    await invoice.reload({
      include: [
        { model: Customer, as: 'customer' },
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

  const invoice = await Invoice.findByPk(id);

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
    // Void the transaction
    transaction.voided_at = new Date();
    transaction.voided_by_user_id = userId;
    transaction.void_reason = reason.trim();
    await transaction.save({ transaction: dbTransaction });

    // Recalculate invoice totals
    await recalculateInvoiceTotals(invoice, dbTransaction);

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
        { model: InvoiceItem, as: 'items', include: [{ model: Asset, as: 'asset' }] },
        { model: Customer, as: 'customer' }
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

  // Admin-only check
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only Admin users can cancel invoices'
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
    const releasedItems = [];

    // Restore all assets to stock and log events
    for (const item of invoice.items) {
      if (item.asset) {
        const previousStatus = item.asset.status;

        // Restore reserved quantity to stock
        item.asset.restoreToStock(item.quantity);
        await item.asset.save({ transaction: dbTransaction });

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

    // Update invoice status and cancellation fields
    invoice.status = 'CANCELLED';
    invoice.balance_due = 0;
    invoice.cancelled_at = new Date();
    invoice.cancelled_by_user_id = userId;
    invoice.cancellation_reason = reason || null;
    invoice.updated_by = userId;
    await invoice.save({ transaction: dbTransaction });

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
          include: [{ model: Asset, as: 'asset' }]
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
  const { search, category, limit = 20 } = req.query;

  // Show assets with remaining quantity > 0 (quantity-based availability)
  const where = {
    deleted_at: null,
    [Op.and]: [
      sequelize.literal(`("Asset"."quantity" - "Asset"."quantity_reserved" - "Asset"."quantity_sold" + "Asset"."quantity_returned") > 0`)
    ]
  };

  if (search) {
    where[Op.or] = [
      { asset_tag: { [Op.iLike]: `%${search}%` } },
      { serial_number: { [Op.iLike]: `%${search}%` } },
      { make: { [Op.iLike]: `%${search}%` } },
      { model: { [Op.iLike]: `%${search}%` } }
    ];
  }

  if (category) {
    where.category = category;
  }

  const assets = await Asset.findAll({
    where,
    limit: parseInt(limit),
    order: [['created_at', 'DESC']],
    attributes: [
      'id', 'asset_tag', 'make', 'model', 'serial_number',
      'condition', 'status', 'quantity',
      'quantity_reserved', 'quantity_sold', 'quantity_returned',
      'cost_amount', 'cost_currency',
      'price_amount', 'price_currency',
      'category', 'asset_type'
    ]
  });

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
