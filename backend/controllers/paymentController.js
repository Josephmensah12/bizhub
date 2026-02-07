/**
 * Payment Controller
 *
 * List and aggregate payment transactions across all invoices
 */

const { InvoicePayment, Invoice, Customer, User, sequelize } = require('../models');
const { Op } = require('sequelize');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/v1/payments
 * List all payment transactions with filters and aggregates
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    dateFrom,
    dateTo,
    transactionType,
    paymentMethod,
    search,
    page = 1,
    limit = 50,
    sortBy = 'payment_date',
    sortOrder = 'DESC',
    includeVoided = 'false'
  } = req.query;

  // Default to current month
  const now = new Date();
  const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const startDate = dateFrom ? new Date(dateFrom) : defaultDateFrom;
  const endDate = dateTo ? new Date(dateTo) : defaultDateTo;

  // Build where clause
  const where = {
    payment_date: {
      [Op.between]: [startDate, endDate]
    }
  };

  // Exclude voided by default
  if (includeVoided !== 'true') {
    where.voided_at = null;
  }

  // Filter by transaction type (comma-separated for multi-select)
  if (transactionType) {
    const types = transactionType.split(',').map(t => t.trim()).filter(Boolean);
    if (types.length === 1) {
      where.transaction_type = types[0];
    } else if (types.length > 1) {
      where.transaction_type = { [Op.in]: types };
    }
  }

  // Filter by payment method (comma-separated for multi-select)
  if (paymentMethod) {
    const methods = paymentMethod.split(',').map(m => m.trim()).filter(Boolean);
    if (methods.length === 1) {
      where.payment_method = methods[0];
    } else if (methods.length > 1) {
      where.payment_method = { [Op.in]: methods };
    }
  }

  // Build invoice/customer search conditions
  let invoiceWhere = {};
  let customerWhere = {};

  if (search) {
    // Search by invoice number or customer name
    invoiceWhere = {
      invoice_number: { [Op.iLike]: `%${search}%` }
    };
    customerWhere = {
      [Op.or]: [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { company_name: { [Op.iLike]: `%${search}%` } }
      ]
    };
  }

  const offset = (page - 1) * limit;

  // Fetch transactions with joins
  const { count, rows } = await InvoicePayment.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[sortBy, sortOrder]],
    include: [
      {
        model: Invoice,
        as: 'invoice',
        attributes: ['id', 'invoice_number', 'currency', 'status'],
        where: search ? invoiceWhere : undefined,
        required: search ? false : true,
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'first_name', 'last_name', 'company_name'],
            where: search ? customerWhere : undefined,
            required: false
          }
        ]
      },
      {
        model: User,
        as: 'receivedBy',
        attributes: ['id', 'full_name']
      },
      {
        model: User,
        as: 'voidedBy',
        attributes: ['id', 'full_name']
      }
    ]
  });

  // Calculate aggregates for the date range (excluding voided)
  const aggregateWhere = {
    payment_date: { [Op.between]: [startDate, endDate] },
    voided_at: null
  };

  // Apply same filters to aggregates
  if (transactionType) {
    const types = transactionType.split(',').map(t => t.trim()).filter(Boolean);
    if (types.length === 1) {
      aggregateWhere.transaction_type = types[0];
    } else if (types.length > 1) {
      aggregateWhere.transaction_type = { [Op.in]: types };
    }
  }
  if (paymentMethod) {
    const methods = paymentMethod.split(',').map(m => m.trim()).filter(Boolean);
    if (methods.length === 1) {
      aggregateWhere.payment_method = methods[0];
    } else if (methods.length > 1) {
      aggregateWhere.payment_method = { [Op.in]: methods };
    }
  }

  // Get totals by transaction type
  const totals = await InvoicePayment.findAll({
    where: aggregateWhere,
    attributes: [
      'transaction_type',
      [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['transaction_type'],
    raw: true
  });

  let totalPayments = 0;
  let totalRefunds = 0;
  let paymentCount = 0;
  let refundCount = 0;

  for (const t of totals) {
    const amount = parseFloat(t.total) || 0;
    const cnt = parseInt(t.count) || 0;
    if (t.transaction_type === 'PAYMENT') {
      totalPayments = amount;
      paymentCount = cnt;
    } else if (t.transaction_type === 'REFUND') {
      totalRefunds = amount;
      refundCount = cnt;
    }
  }

  const netCollected = totalPayments - totalRefunds;

  // Format transactions for response
  const transactions = rows.map(tx => {
    const data = tx.toJSON();

    // Add customer display name
    if (data.invoice?.customer) {
      const c = data.invoice.customer;
      data.customerName = c.company_name ||
        (c.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : 'Unknown');
      data.customerId = c.id;
    } else {
      data.customerName = 'No Customer';
      data.customerId = null;
    }

    // Add invoice number shortcut
    data.invoiceNumber = data.invoice?.invoice_number || null;
    data.invoiceId = data.invoice?.id || null;
    data.invoiceStatus = data.invoice?.status || null;

    // Format payment method display
    data.paymentMethodDisplay = data.payment_method === 'Other' && data.payment_method_other_text
      ? `Other – ${data.payment_method_other_text}`
      : data.payment_method;

    return data;
  });

  res.json({
    success: true,
    data: {
      transactions,
      aggregates: {
        totalPayments,
        totalRefunds,
        netCollected,
        paymentCount,
        refundCount,
        transactionCount: paymentCount + refundCount
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
 * GET /api/v1/payments/methods
 * Get available payment methods for filter dropdown
 */
exports.getPaymentMethods = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      methods: InvoicePayment.PAYMENT_METHODS,
      transactionTypes: InvoicePayment.TRANSACTION_TYPES
    }
  });
});

module.exports = exports;
