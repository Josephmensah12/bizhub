/**
 * Return Controller
 *
 * Handles invoice returns, refunds, and exchanges
 */

const {
  Invoice,
  InvoiceItem,
  InvoicePayment,
  InvoiceReturn,
  InvoiceReturnItem,
  Customer,
  CustomerCredit,
  CustomerCreditApplication,
  Asset,
  User,
  ActivityLog,
  InventoryItemEvent,
  sequelize
} = require('../models');
const { Op } = require('sequelize');

/**
 * Async handler wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Recalculate invoice totals based on active transactions
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

  // Get credit applications
  const creditApps = await CustomerCreditApplication.findAll({
    where: {
      invoice_id: invoice.id,
      voided_at: null
    },
    ...queryOptions
  });

  let creditsApplied = 0;
  for (const app of creditApps) {
    creditsApplied += parseFloat(app.amount_applied) || 0;
  }

  const totalAmount = parseFloat(invoice.total_amount) || 0;
  const netPaid = Math.max(0, paymentsSum - refundsSum + creditsApplied);
  const balanceDue = Math.max(0, totalAmount - netPaid);

  // Determine status
  let newStatus = invoice.status;
  if (invoice.status !== 'CANCELLED') {
    if (netPaid <= 0) {
      newStatus = 'UNPAID';
    } else if (netPaid >= totalAmount) {
      newStatus = 'PAID';
    } else {
      newStatus = 'PARTIALLY_PAID';
    }
  }

  // Update invoice
  invoice.amount_paid = netPaid;
  invoice.balance_due = invoice.status === 'CANCELLED' ? 0 : balanceDue;
  invoice.status = newStatus;

  await invoice.save(queryOptions);
}

/**
 * POST /api/v1/invoices/:invoiceId/returns
 * Create a return draft with selected items
 */
exports.createReturn = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const { returnType, items, reason, returnReasonCode, returnReasonDetails } = req.body;
  const userId = req.user?.id;

  // Validate return type
  if (!['RETURN_REFUND', 'EXCHANGE'].includes(returnType)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_RETURN_TYPE', message: 'Return type must be RETURN_REFUND or EXCHANGE' }
    });
  }

  // Validate return reason code
  const validReasonCodes = ['BUYER_REMORSE', 'DEFECT', 'EXCHANGE', 'OTHER'];
  if (!returnReasonCode || !validReasonCodes.includes(returnReasonCode)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REASON_CODE', message: `Return reason is required. Must be one of: ${validReasonCodes.join(', ')}` }
    });
  }

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ITEMS', message: 'At least one item must be selected for return' }
    });
  }

  // Load invoice with items
  const invoice = await Invoice.findByPk(invoiceId, {
    include: [
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset' }]
      },
      { model: Customer, as: 'customer' }
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
      error: { code: 'INVOICE_CANCELLED', message: 'Cannot create return for a cancelled invoice' }
    });
  }

  if (!invoice.customer_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'NO_CUSTOMER', message: 'Cannot create return for invoice without a customer' }
    });
  }

  // Validate each item
  const itemMap = new Map();
  for (const invItem of invoice.items) {
    itemMap.set(invItem.id, invItem);
  }

  let totalReturnAmount = 0;
  const returnItemsData = [];

  for (const item of items) {
    const { invoiceItemId, quantityReturned = 1, restockCondition = 'AS_IS' } = item;

    const invoiceItem = itemMap.get(invoiceItemId);
    if (!invoiceItem) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ITEM', message: `Invoice item ${invoiceItemId} not found on this invoice` }
      });
    }

    const returnableQty = invoiceItem.getReturnableQuantity();
    if (quantityReturned > returnableQty) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EXCEEDS_RETURNABLE',
          message: `Cannot return ${quantityReturned} of "${invoiceItem.description}". Maximum returnable: ${returnableQty}`
        }
      });
    }

    if (quantityReturned < 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUANTITY', message: 'Quantity must be at least 1' }
      });
    }

    const lineReturnAmount = parseFloat((invoiceItem.unit_price_amount * quantityReturned).toFixed(2));
    totalReturnAmount += lineReturnAmount;

    returnItemsData.push({
      invoiceItemId,
      invoiceItem,
      quantityReturned,
      unitPriceAtSale: invoiceItem.unit_price_amount,
      lineReturnAmount,
      restockCondition,
      assetId: invoiceItem.asset_id
    });
  }

  // For RETURN_REFUND, check if refund would exceed amount paid
  if (returnType === 'RETURN_REFUND') {
    const amountPaid = parseFloat(invoice.amount_paid) || 0;
    if (totalReturnAmount > amountPaid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EXCEEDS_PAID',
          message: `Return amount (${invoice.currency} ${totalReturnAmount}) exceeds amount paid (${invoice.currency} ${amountPaid})`
        }
      });
    }
  }

  const dbTransaction = await sequelize.transaction();

  try {
    // Create return header
    const invoiceReturn = await InvoiceReturn.create({
      invoice_id: invoiceId,
      customer_id: invoice.customer_id,
      return_type: returnType,
      status: 'DRAFT',
      currency: invoice.currency,
      total_return_amount: totalReturnAmount,
      reason: reason?.trim() || null,
      return_reason_code: returnReasonCode,
      return_reason_details: returnReasonDetails?.trim() || null,
      created_by_user_id: userId
    }, { transaction: dbTransaction });

    // Create return items
    for (const itemData of returnItemsData) {
      await InvoiceReturnItem.create({
        return_id: invoiceReturn.id,
        invoice_item_id: itemData.invoiceItemId,
        asset_id: itemData.assetId,
        quantity_returned: itemData.quantityReturned,
        unit_price_at_sale: itemData.unitPriceAtSale,
        line_return_amount: itemData.lineReturnAmount,
        restock_condition: itemData.restockCondition
      }, { transaction: dbTransaction });
    }

    // Log activity
    await ActivityLog.logReturnCreated(invoiceReturn, invoice, userId);

    // Log inventory events for each return item
    for (const itemData of returnItemsData) {
      if (itemData.assetId) {
        await InventoryItemEvent.logReturnInitiated(
          { id: itemData.assetId, asset_tag: itemData.invoiceItem.asset?.asset_tag },
          invoiceReturn,
          userId,
          dbTransaction
        );
      }
    }

    await dbTransaction.commit();

    // Reload with associations
    const fullReturn = await InvoiceReturn.findByPk(invoiceReturn.id, {
      include: [
        {
          model: InvoiceReturnItem,
          as: 'items',
          include: [
            { model: InvoiceItem, as: 'invoiceItem' },
            { model: Asset, as: 'asset' }
          ]
        },
        { model: User, as: 'createdBy', attributes: ['id', 'full_name'] }
      ]
    });

    res.status(201).json({
      success: true,
      data: {
        return: fullReturn,
        returnId: fullReturn.id,
        status: fullReturn.status
      },
      message: 'Return created successfully'
    });
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
});

/**
 * POST /api/v1/returns/:returnId/finalize
 * Finalize return: release inventory and create refund or credit
 */
exports.finalizeReturn = asyncHandler(async (req, res) => {
  const { returnId } = req.params;
  const { refund } = req.body;
  const userId = req.user?.id;

  // Load return with all associations
  const invoiceReturn = await InvoiceReturn.findByPk(returnId, {
    include: [
      {
        model: InvoiceReturnItem,
        as: 'items',
        include: [
          { model: InvoiceItem, as: 'invoiceItem' },
          { model: Asset, as: 'asset' }
        ]
      },
      { model: Invoice, as: 'invoice', include: [{ model: Customer, as: 'customer' }] },
      { model: Customer, as: 'customer' }
    ]
  });

  if (!invoiceReturn) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Return not found' }
    });
  }

  if (invoiceReturn.status !== 'DRAFT') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot finalize return with status ${invoiceReturn.status}` }
    });
  }

  // For RETURN_REFUND, validate refund details
  if (invoiceReturn.return_type === 'RETURN_REFUND') {
    if (!refund || !refund.paymentMethod || !refund.comment) {
      return res.status(400).json({
        success: false,
        error: { code: 'REFUND_REQUIRED', message: 'Payment method and comment are required for refund' }
      });
    }

    if (refund.paymentMethod === 'Other' && !refund.paymentMethodOtherText?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'OTHER_TEXT_REQUIRED', message: 'Please specify the payment method when selecting "Other"' }
      });
    }

    // Check if refund would exceed amount paid
    const invoice = invoiceReturn.invoice;
    const amountPaid = parseFloat(invoice.amount_paid) || 0;
    if (invoiceReturn.total_return_amount > amountPaid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EXCEEDS_PAID',
          message: `Return amount (${invoice.currency} ${invoiceReturn.total_return_amount}) exceeds amount paid (${invoice.currency} ${amountPaid})`
        }
      });
    }
  }

  const dbTransaction = await sequelize.transaction();

  try {
    const invoice = invoiceReturn.invoice;

    // 1. Update invoice items' quantity_returned_total
    for (const returnItem of invoiceReturn.items) {
      const invoiceItem = returnItem.invoiceItem;
      invoiceItem.quantity_returned_total = (invoiceItem.quantity_returned_total || 0) + returnItem.quantity_returned;
      await invoiceItem.save({ transaction: dbTransaction });
    }

    // 2. Release inventory — restore on_hand and update computed status
    for (const returnItem of invoiceReturn.items) {
      if (returnItem.asset) {
        const asset = returnItem.asset;

        // Restore on_hand: returned items become available again
        asset.quantity += returnItem.quantity_returned;
        await asset.save({ transaction: dbTransaction });

        // Update computed status
        await asset.updateComputedStatus(dbTransaction);

        const newStatus = asset.status;

        // Log inventory events
        await InventoryItemEvent.logReturnFinalized(asset, invoiceReturn, returnItem, userId, dbTransaction);
        await InventoryItemEvent.logInventoryReleased(asset, invoiceReturn, newStatus, userId, dbTransaction);
      }
    }

    // 3. Create refund transaction OR store credit
    if (invoiceReturn.return_type === 'RETURN_REFUND') {
      // Create REFUND transaction
      const refundTx = await InvoicePayment.create({
        invoice_id: invoice.id,
        transaction_type: 'REFUND',
        payment_date: refund.transactionDate || new Date(),
        amount: invoiceReturn.total_return_amount,
        currency: invoiceReturn.currency,
        payment_method: refund.paymentMethod,
        payment_method_other_text: refund.paymentMethod === 'Other' ? refund.paymentMethodOtherText.trim() : null,
        comment: refund.comment.trim(),
        received_by_user_id: userId,
        linked_return_id: invoiceReturn.id
      }, { transaction: dbTransaction });

      // Log refund
      await ActivityLog.logRefundRecorded(refundTx, invoice, userId);

      // Log inventory events for refund
      for (const returnItem of invoiceReturn.items) {
        if (returnItem.asset) {
          await InventoryItemEvent.logRefundIssued(returnItem.asset, refundTx, invoiceReturn, userId, dbTransaction);
        }
      }
    } else {
      // EXCHANGE: Create store credit
      const credit = await CustomerCredit.create({
        customer_id: invoiceReturn.customer_id,
        currency: invoiceReturn.currency,
        original_amount: invoiceReturn.total_return_amount,
        remaining_amount: invoiceReturn.total_return_amount,
        status: 'ACTIVE',
        source_return_id: invoiceReturn.id,
        created_by_user_id: userId
      }, { transaction: dbTransaction });

      // Log credit created
      await ActivityLog.logStoreCreditCreated(credit, invoiceReturn.customer, userId);

      // Log inventory events for exchange credit
      for (const returnItem of invoiceReturn.items) {
        if (returnItem.asset) {
          await InventoryItemEvent.logExchangeCreditCreated(returnItem.asset, credit, invoiceReturn, userId, dbTransaction);
        }
      }
    }

    // 4. Update return status
    invoiceReturn.status = 'FINALIZED';
    invoiceReturn.finalized_at = new Date();
    invoiceReturn.finalized_by_user_id = userId;
    await invoiceReturn.save({ transaction: dbTransaction });

    // 5. Check if all items are now fully returned
    const allItems = await InvoiceItem.findAll({
      where: { invoice_id: invoice.id },
      transaction: dbTransaction
    });
    const allFullyReturned = allItems.length > 0 && allItems.every(
      item => (item.quantity_returned_total || 0) >= item.quantity
    );

    // 5a. If all items returned, void any active credit applications and restore credit
    if (allFullyReturned) {
      const activeCreditApps = await CustomerCreditApplication.findAll({
        where: { invoice_id: invoice.id, voided_at: null },
        transaction: dbTransaction
      });

      for (const app of activeCreditApps) {
        app.voided_at = new Date();
        app.voided_by_user_id = userId;
        app.void_reason = 'All items returned — credit restored';
        await app.save({ transaction: dbTransaction });

        // Restore the credit balance
        const credit = await CustomerCredit.findByPk(app.credit_id, { transaction: dbTransaction });
        if (credit) {
          const restored = parseFloat(credit.remaining_amount) + parseFloat(app.amount_applied);
          credit.remaining_amount = restored;
          if (restored > 0 && credit.status === 'CONSUMED') {
            credit.status = 'ACTIVE';
          }
          await credit.save({ transaction: dbTransaction });
        }
      }
    }

    // 6. Recalculate invoice totals
    await recalculateInvoiceTotals(invoice, dbTransaction);

    // 7. Auto-cancel invoice if all items fully returned and net paid = 0
    const netPaid = parseFloat(invoice.amount_paid) || 0;

    if (allFullyReturned && netPaid <= 0 && invoice.status !== 'CANCELLED') {
      invoice.status = 'CANCELLED';
      invoice.balance_due = 0;
      invoice.cancelled_at = new Date();
      invoice.cancellation_reason = 'All items returned and fully refunded';
      await invoice.save({ transaction: dbTransaction });
    }

    // Log return finalized
    await ActivityLog.logReturnFinalized(invoiceReturn, invoice, userId);

    await dbTransaction.commit();

    // Reload return with all data
    const fullReturn = await InvoiceReturn.findByPk(returnId, {
      include: [
        {
          model: InvoiceReturnItem,
          as: 'items',
          include: [
            { model: InvoiceItem, as: 'invoiceItem' },
            { model: Asset, as: 'asset' }
          ]
        },
        { model: Invoice, as: 'invoice' },
        { model: CustomerCredit, as: 'credit' },
        { model: InvoicePayment, as: 'transactions' },
        { model: User, as: 'createdBy', attributes: ['id', 'full_name'] },
        { model: User, as: 'finalizedBy', attributes: ['id', 'full_name'] }
      ]
    });

    // Reload invoice
    const updatedInvoice = await Invoice.findByPk(invoice.id, {
      include: [
        { model: InvoiceItem, as: 'items', include: [{ model: Asset, as: 'asset' }] },
        { model: Customer, as: 'customer' }
      ]
    });

    res.json({
      success: true,
      data: {
        return: fullReturn,
        invoice: updatedInvoice,
        status: 'FINALIZED'
      },
      message: `Return finalized successfully. ${invoiceReturn.return_type === 'EXCHANGE' ? 'Store credit created.' : 'Refund recorded.'}`
    });
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
});

/**
 * GET /api/v1/invoices/:invoiceId/returns
 * List return events for an invoice
 */
exports.getInvoiceReturns = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  const returns = await InvoiceReturn.findAll({
    where: { invoice_id: invoiceId },
    include: [
      {
        model: InvoiceReturnItem,
        as: 'items',
        include: [
          { model: InvoiceItem, as: 'invoiceItem' },
          { model: Asset, as: 'asset' }
        ]
      },
      { model: CustomerCredit, as: 'credit' },
      { model: User, as: 'createdBy', attributes: ['id', 'full_name'] },
      { model: User, as: 'finalizedBy', attributes: ['id', 'full_name'] }
    ],
    order: [['created_at', 'DESC']]
  });

  res.json({
    success: true,
    data: { returns }
  });
});

/**
 * GET /api/v1/returns/:returnId
 * Get a single return by ID
 */
exports.getReturn = asyncHandler(async (req, res) => {
  const { returnId } = req.params;

  const invoiceReturn = await InvoiceReturn.findByPk(returnId, {
    include: [
      {
        model: InvoiceReturnItem,
        as: 'items',
        include: [
          { model: InvoiceItem, as: 'invoiceItem' },
          { model: Asset, as: 'asset' }
        ]
      },
      { model: Invoice, as: 'invoice', include: [{ model: Customer, as: 'customer' }] },
      { model: Customer, as: 'customer' },
      { model: CustomerCredit, as: 'credit' },
      { model: InvoicePayment, as: 'transactions' },
      { model: User, as: 'createdBy', attributes: ['id', 'full_name'] },
      { model: User, as: 'finalizedBy', attributes: ['id', 'full_name'] }
    ]
  });

  if (!invoiceReturn) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Return not found' }
    });
  }

  res.json({
    success: true,
    data: { return: invoiceReturn }
  });
});

/**
 * POST /api/v1/returns/:returnId/cancel
 * Cancel a draft return
 */
exports.cancelReturn = asyncHandler(async (req, res) => {
  const { returnId } = req.params;
  const userId = req.user?.id;

  const invoiceReturn = await InvoiceReturn.findByPk(returnId, {
    include: [{ model: Invoice, as: 'invoice' }]
  });

  if (!invoiceReturn) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Return not found' }
    });
  }

  if (invoiceReturn.status !== 'DRAFT') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Only draft returns can be cancelled' }
    });
  }

  invoiceReturn.status = 'CANCELLED';
  invoiceReturn.cancelled_at = new Date();
  invoiceReturn.cancelled_by_user_id = userId;
  await invoiceReturn.save();

  res.json({
    success: true,
    data: { return: invoiceReturn },
    message: 'Return cancelled successfully'
  });
});

/**
 * GET /api/v1/customers/:customerId/credits
 * Get available store credits for a customer
 */
exports.getCustomerCredits = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { currency, includeConsumed } = req.query;

  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Customer not found' }
    });
  }

  const where = { customer_id: customerId };

  if (currency) {
    where.currency = currency;
  }

  if (includeConsumed !== 'true') {
    where.status = 'ACTIVE';
    where.remaining_amount = { [Op.gt]: 0 };
  }

  const credits = await CustomerCredit.findAll({
    where,
    include: [
      { model: InvoiceReturn, as: 'sourceReturn', include: [{ model: Invoice, as: 'invoice' }] },
      { model: User, as: 'createdBy', attributes: ['id', 'full_name'] }
    ],
    order: [['created_at', 'DESC']]
  });

  // Calculate totals by currency
  const totalsByCurrency = {};
  for (const credit of credits) {
    if (credit.status === 'ACTIVE' && credit.remaining_amount > 0) {
      if (!totalsByCurrency[credit.currency]) {
        totalsByCurrency[credit.currency] = 0;
      }
      totalsByCurrency[credit.currency] += credit.remaining_amount;
    }
  }

  res.json({
    success: true,
    data: {
      credits,
      totalsByCurrency,
      customer: {
        id: customer.id,
        displayName: customer.displayName || customer.company_name || `${customer.first_name} ${customer.last_name}`
      }
    }
  });
});

/**
 * POST /api/v1/customers/:customerId/credits/apply
 * Apply store credit to an invoice
 */
exports.applyCredit = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { invoiceId, creditId, amountToApply } = req.body;
  const userId = req.user?.id;

  // Validate amount
  const amount = parseFloat(amountToApply);
  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_AMOUNT', message: 'Amount to apply must be greater than 0' }
    });
  }

  // Load credit
  const credit = await CustomerCredit.findOne({
    where: { id: creditId, customer_id: customerId }
  });

  if (!credit) {
    return res.status(404).json({
      success: false,
      error: { code: 'CREDIT_NOT_FOUND', message: 'Store credit not found' }
    });
  }

  if (!credit.isUsable()) {
    return res.status(400).json({
      success: false,
      error: { code: 'CREDIT_NOT_USABLE', message: 'This store credit is not available for use' }
    });
  }

  // Load invoice
  const invoice = await Invoice.findByPk(invoiceId, {
    include: [{ model: Customer, as: 'customer' }]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Validate invoice customer matches credit customer
  if (invoice.customer_id !== parseInt(customerId)) {
    return res.status(400).json({
      success: false,
      error: { code: 'CUSTOMER_MISMATCH', message: 'Store credit belongs to a different customer' }
    });
  }

  // Validate currency
  if (credit.currency !== invoice.currency) {
    return res.status(400).json({
      success: false,
      error: { code: 'CURRENCY_MISMATCH', message: `Credit currency (${credit.currency}) does not match invoice currency (${invoice.currency})` }
    });
  }

  // Validate invoice status
  if (!['UNPAID', 'PARTIALLY_PAID'].includes(invoice.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVOICE_STATUS', message: 'Can only apply credit to unpaid or partially paid invoices' }
    });
  }

  // Validate amount doesn't exceed balance due or available credit
  const maxApplicable = Math.min(credit.remaining_amount, invoice.balance_due);
  if (amount > maxApplicable) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'EXCEEDS_MAX',
        message: `Maximum applicable amount is ${invoice.currency} ${maxApplicable.toFixed(2)}`
      }
    });
  }

  const dbTransaction = await sequelize.transaction();

  try {
    // Apply credit
    const actualAmount = await credit.applyToInvoice(amount, invoiceId, userId, dbTransaction);

    // Create application record
    await CustomerCreditApplication.create({
      credit_id: credit.id,
      invoice_id: invoiceId,
      amount_applied: actualAmount,
      applied_by_user_id: userId
    }, { transaction: dbTransaction });

    // Recalculate invoice
    await recalculateInvoiceTotals(invoice, dbTransaction);

    // Log activity
    await ActivityLog.logStoreCreditApplied(credit, invoice, actualAmount, userId);

    await dbTransaction.commit();

    // Reload invoice
    const updatedInvoice = await Invoice.findByPk(invoiceId, {
      include: [
        { model: InvoiceItem, as: 'items', include: [{ model: Asset, as: 'asset' }] },
        { model: Customer, as: 'customer' }
      ]
    });

    // Reload credit
    const updatedCredit = await CustomerCredit.findByPk(creditId);

    res.json({
      success: true,
      data: {
        invoice: updatedInvoice,
        credit: updatedCredit,
        amountApplied: actualAmount,
        invoiceBalanceDue: updatedInvoice.balance_due,
        creditRemaining: updatedCredit.remaining_amount
      },
      message: `Store credit of ${invoice.currency} ${actualAmount.toFixed(2)} applied successfully`
    });
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
});

/**
 * GET /api/v1/invoices/:invoiceId/returnable-items
 * Get items that can still be returned from an invoice
 */
exports.getReturnableItems = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  const invoice = await Invoice.findByPk(invoiceId, {
    include: [
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset' }]
      },
      { model: Customer, as: 'customer' }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invoice not found' }
    });
  }

  // Build returnable items list
  const returnableItems = invoice.items
    .map(item => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      quantityReturnedTotal: item.quantity_returned_total || 0,
      returnableQuantity: item.getReturnableQuantity(),
      unitPrice: item.unit_price_amount,
      asset: item.asset ? {
        id: item.asset.id,
        assetTag: item.asset.asset_tag,
        serialNumber: item.asset.serial_number,
        status: item.asset.status
      } : null
    }))
    .filter(item => item.returnableQuantity > 0);

  res.json({
    success: true,
    data: {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        currency: invoice.currency,
        totalAmount: invoice.total_amount,
        amountPaid: invoice.amount_paid,
        status: invoice.status
      },
      customer: invoice.customer ? {
        id: invoice.customer.id,
        displayName: invoice.customer.displayName || invoice.customer.company_name
      } : null,
      returnableItems,
      hasReturnableItems: returnableItems.length > 0
    }
  });
});

module.exports = exports;
