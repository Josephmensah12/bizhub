/**
 * Payment Controller
 *
 * List and aggregate payment transactions across all invoices
 */

const { InvoicePayment, Invoice, Customer, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');

// Async handler wrapper
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
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
    sortBy: rawSortBy = 'payment_date',
    sortOrder: rawSortOrder = 'DESC',
    includeVoided = 'false'
  } = req.query;

  const ALLOWED_SORT = ['payment_date', 'created_at', 'amount', 'payment_method', 'transaction_type'];
  const sortBy = ALLOWED_SORT.includes(rawSortBy) ? rawSortBy : 'payment_date';
  const sortOrder = rawSortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

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

/**
 * GET /api/v1/payments/export
 * Export filtered payments as .xlsx
 */
exports.exportToExcel = asyncHandler(async (req, res) => {
  const {
    dateFrom,
    dateTo,
    transactionType,
    paymentMethod,
    search,
    includeVoided = 'false'
  } = req.query;

  const now = new Date();
  const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const startDate = dateFrom ? new Date(dateFrom) : defaultDateFrom;
  const endDate = dateTo ? new Date(dateTo) : defaultDateTo;

  const where = {
    payment_date: { [Op.between]: [startDate, endDate] }
  };

  if (includeVoided !== 'true') {
    where.voided_at = null;
  }

  if (transactionType) {
    const types = transactionType.split(',').map(t => t.trim()).filter(Boolean);
    if (types.length) where.transaction_type = types.length === 1 ? types[0] : { [Op.in]: types };
  }

  if (paymentMethod) {
    const methods = paymentMethod.split(',').map(m => m.trim()).filter(Boolean);
    if (methods.length) where.payment_method = methods.length === 1 ? methods[0] : { [Op.in]: methods };
  }

  let invoiceWhere, customerWhere;
  if (search) {
    invoiceWhere = { invoice_number: { [Op.iLike]: `%${search}%` } };
    customerWhere = {
      [Op.or]: [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { company_name: { [Op.iLike]: `%${search}%` } }
      ]
    };
  }

  const rows = await InvoicePayment.findAll({
    where,
    order: [['payment_date', 'DESC']],
    include: [
      {
        model: Invoice, as: 'invoice',
        attributes: ['id', 'invoice_number', 'currency', 'status', 'total_amount'],
        where: search ? invoiceWhere : undefined,
        required: search ? false : true,
        include: [{
          model: Customer, as: 'customer',
          attributes: ['id', 'first_name', 'last_name', 'company_name'],
          where: search ? customerWhere : undefined,
          required: false
        }]
      },
      { model: User, as: 'receivedBy', attributes: ['id', 'full_name'] },
      { model: User, as: 'voidedBy', attributes: ['id', 'full_name'] }
    ]
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'BizHub';
  const ws = wb.addWorksheet('Payments', { properties: { defaultColWidth: 15 } });

  ws.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Invoice #', key: 'invoice', width: 18 },
    { header: 'Customer', key: 'customer', width: 28 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Method', key: 'method', width: 12 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Invoice Total', key: 'invoiceTotal', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Invoice Status', key: 'invoiceStatus', width: 14 },
    { header: 'Received By', key: 'receivedBy', width: 18 },
    { header: 'Comment', key: 'comment', width: 30 },
    { header: 'Voided', key: 'voided', width: 12 },
    { header: 'Void Reason', key: 'voidReason', width: 20 }
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  rows.forEach(tx => {
    const data = tx.toJSON();
    const cust = data.invoice?.customer;
    const customerName = cust
      ? (cust.company_name || [cust.first_name, cust.last_name].filter(Boolean).join(' ') || 'Unknown')
      : 'No Customer';

    ws.addRow({
      date: data.payment_date ? new Date(data.payment_date) : '',
      invoice: data.invoice?.invoice_number || '',
      customer: customerName,
      type: data.transaction_type,
      method: data.payment_method === 'Other' && data.payment_method_other_text
        ? `Other - ${data.payment_method_other_text}` : data.payment_method,
      amount: parseFloat(data.amount) || 0,
      currency: data.currency || 'GHS',
      invoiceTotal: parseFloat(data.invoice?.total_amount) || 0,
      invoiceStatus: data.invoice?.status || '',
      receivedBy: data.receivedBy?.full_name || '',
      comment: data.comment || '',
      voided: data.voided_at ? 'Yes' : '',
      voidReason: data.void_reason || ''
    });
  });

  // Format date column
  ws.getColumn('date').numFmt = 'DD-MMM-YYYY';

  // Add totals row
  const totalRow = ws.addRow({
    date: '',
    invoice: '',
    customer: '',
    type: '',
    method: 'TOTAL',
    amount: rows.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0),
    currency: '',
    invoiceTotal: '',
    invoiceStatus: '',
    receivedBy: '',
    comment: `${rows.length} transactions`,
    voided: '',
    voidReason: ''
  });
  totalRow.font = { bold: true, size: 11 };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  const fromStr = startDate.toISOString().slice(0, 10);
  const toStr = endDate.toISOString().slice(0, 10);
  const filename = `Payments_${fromStr}_to_${toStr}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = exports;
