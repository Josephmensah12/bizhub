/**
 * Preorder Controller
 *
 * CRUD, status updates, convert-to-invoice, and summary.
 */

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const { Op } = require('sequelize');
const { Preorder, Customer, Invoice, InvoiceItem, InvoicePayment, User, sequelize } = require('../models');

// ─── List ────────────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const {
    status, search, page = 1, limit = 50, sortBy = 'created_at', sortOrder = 'DESC'
  } = req.query;

  const where = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where[Op.or] = [
      { tracking_code: { [Op.iLike]: `%${search}%` } },
      { customer_name: { [Op.iLike]: `%${search}%` } },
      { item_description: { [Op.iLike]: `%${search}%` } },
      { customer_phone: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { rows, count } = await Preorder.findAndCountAll({
    where,
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'first_name', 'last_name', 'phone_raw', 'email'] },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ],
    order: [[sortBy, sortOrder.toUpperCase()]],
    limit: parseInt(limit),
    offset
  });

  res.json({
    success: true,
    data: {
      preorders: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    }
  });
});

// ─── Get by ID ───────────────────────────────────────────────
exports.getById = asyncHandler(async (req, res) => {
  const preorder = await Preorder.findByPk(req.params.id, {
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'first_name', 'last_name', 'phone_raw', 'email', 'company_name'] },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      { model: User, as: 'updater', attributes: ['id', 'full_name'] },
      { model: Invoice, as: 'invoice', attributes: ['id', 'invoice_number', 'status', 'total_amount'] }
    ]
  });

  if (!preorder) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Preorder not found' }
    });
  }

  res.json({ success: true, data: preorder });
});

// ─── Create ──────────────────────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const {
    customer_id, customer_name, customer_phone, customer_email,
    item_description, quantity,
    source_url, source_notes, purchase_cost_amount, purchase_cost_currency,
    supplier_order_number,
    shipping_method, estimated_arrival_date,
    selling_price, deposit_amount, deposit_payment_method,
    notes
  } = req.body;

  // Validate required fields
  const errors = [];
  if (!item_description) errors.push('item_description is required');
  if (!selling_price) errors.push('selling_price is required');
  if (deposit_amount == null) errors.push('deposit_amount is required');

  // Auto-fill from customer if customer_id provided
  let finalName = customer_name;
  let finalPhone = customer_phone;
  let finalEmail = customer_email;

  if (customer_id) {
    const cust = await Customer.findByPk(customer_id);
    if (cust) {
      finalName = finalName || `${cust.first_name || ''} ${cust.last_name || ''}`.trim() || 'Customer';
      finalPhone = finalPhone || cust.phone_raw;
      finalEmail = finalEmail || cust.email;
    }
  }

  if (!finalName) errors.push('customer_name is required');
  if (!finalPhone) errors.push('customer_phone is required');

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: errors.join(', ') }
    });
  }

  const tracking_code = await Preorder.generateTrackingCode();

  const preorder = await Preorder.create({
    tracking_code,
    customer_id: customer_id || null,
    customer_name: finalName,
    customer_phone: finalPhone,
    customer_email: finalEmail || null,
    item_description,
    quantity: quantity || 1,
    source_url: source_url || null,
    source_notes: source_notes || null,
    purchase_cost_amount: purchase_cost_amount || null,
    purchase_cost_currency: purchase_cost_currency || 'USD',
    supplier_order_number: supplier_order_number || null,
    shipping_method: shipping_method || null,
    estimated_arrival_date: estimated_arrival_date || null,
    selling_price,
    deposit_amount,
    deposit_payment_method: deposit_payment_method || null,
    notes: notes || null,
    created_by: req.user?.id,
    updated_by: req.user?.id
  });

  const full = await Preorder.findByPk(preorder.id, {
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'first_name', 'last_name', 'phone_raw', 'email'] },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  res.status(201).json({ success: true, data: full });
});

// ─── Update ──────────────────────────────────────────────────
exports.update = asyncHandler(async (req, res) => {
  const preorder = await Preorder.findByPk(req.params.id);

  if (!preorder) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Preorder not found' }
    });
  }

  const allowedFields = [
    'customer_id', 'customer_name', 'customer_phone', 'customer_email',
    'item_description', 'quantity',
    'source_url', 'source_notes', 'purchase_cost_amount', 'purchase_cost_currency',
    'purchase_date', 'supplier_order_number',
    'shipping_method', 'tracking_number', 'shipped_date',
    'estimated_arrival_date', 'actual_arrival_date',
    'selling_price', 'deposit_amount', 'deposit_payment_method',
    'status', 'status_message',
    'notes'
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      preorder[field] = req.body[field];
    }
  }

  // Auto-set dates on status change
  if (req.body.status) {
    applyStatusDates(preorder, req.body.status);
  }

  preorder.updated_by = req.user?.id;
  await preorder.save();

  const full = await Preorder.findByPk(preorder.id, {
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'first_name', 'last_name', 'phone_raw', 'email'] },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      { model: User, as: 'updater', attributes: ['id', 'full_name'] },
      { model: Invoice, as: 'invoice', attributes: ['id', 'invoice_number', 'status', 'total_amount'] }
    ]
  });

  res.json({ success: true, data: full });
});

// ─── Update Status ───────────────────────────────────────────
exports.updateStatus = asyncHandler(async (req, res) => {
  const preorder = await Preorder.findByPk(req.params.id);

  if (!preorder) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Preorder not found' }
    });
  }

  const { status, status_message } = req.body;

  if (!status || !Preorder.STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Status must be one of: ${Preorder.STATUSES.join(', ')}` }
    });
  }

  preorder.status = status;
  if (status_message !== undefined) {
    preorder.status_message = status_message || null;
  }

  applyStatusDates(preorder, status);

  preorder.updated_by = req.user?.id;
  await preorder.save();

  res.json({ success: true, data: preorder });
});

// ─── Delete ──────────────────────────────────────────────────
exports.remove = asyncHandler(async (req, res) => {
  const preorder = await Preorder.findByPk(req.params.id);

  if (!preorder) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Preorder not found' }
    });
  }

  if (!['Deposit Paid', 'Cancelled'].includes(preorder.status)) {
    return res.status(400).json({
      success: false,
      error: { code: 'CANNOT_DELETE', message: 'Only preorders with status "Deposit Paid" or "Cancelled" can be deleted' }
    });
  }

  await preorder.destroy();

  res.json({ success: true, message: 'Preorder deleted' });
});

// ─── Convert to Invoice ─────────────────────────────────────
exports.convertToInvoice = asyncHandler(async (req, res) => {
  const preorder = await Preorder.findByPk(req.params.id);

  if (!preorder) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Preorder not found' }
    });
  }

  if (preorder.invoice_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_CONVERTED', message: 'This preorder has already been converted to an invoice' }
    });
  }

  const dbTransaction = await sequelize.transaction();

  try {
    // Find or create customer
    let customerId = preorder.customer_id;
    if (!customerId) {
      const nameParts = (preorder.customer_name || '').trim().split(' ');
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Try to find existing customer by phone
      let customer = null;
      if (preorder.customer_phone) {
        customer = await Customer.findOne({
          where: { phone_raw: preorder.customer_phone },
          transaction: dbTransaction
        });
      }

      if (!customer) {
        customer = await Customer.create({
          first_name: firstName,
          last_name: lastName,
          phone_raw: preorder.customer_phone,
          email: preorder.customer_email || null
        }, { transaction: dbTransaction });
      }
      customerId = customer.id;
    }

    // Create invoice
    const invoiceNumber = await Invoice.generateInvoiceNumber();
    const invoice = await Invoice.create({
      invoice_number: invoiceNumber,
      customer_id: customerId,
      invoice_date: new Date(),
      status: 'UNPAID',
      currency: 'GHS',
      subtotal_amount: preorder.selling_price * preorder.quantity,
      total_amount: preorder.selling_price * preorder.quantity,
      total_cost_amount: 0,
      total_profit_amount: preorder.selling_price * preorder.quantity,
      amount_paid: 0,
      balance_due: preorder.selling_price * preorder.quantity,
      notes: `Converted from preorder ${preorder.tracking_code}`,
      created_by: req.user?.id,
      updated_by: req.user?.id
    }, { transaction: dbTransaction });

    // Create invoice item
    await InvoiceItem.create({
      invoice_id: invoice.id,
      description: preorder.item_description,
      quantity: preorder.quantity,
      unit_price_amount: preorder.selling_price,
      unit_cost_amount: 0,
      line_total_amount: preorder.selling_price * preorder.quantity,
      line_cost_amount: 0,
      line_profit_amount: preorder.selling_price * preorder.quantity
    }, { transaction: dbTransaction });

    // Add deposit as payment
    if (preorder.deposit_amount > 0) {
      await InvoicePayment.create({
        invoice_id: invoice.id,
        payment_date: preorder.created_at,
        amount: preorder.deposit_amount,
        currency: 'GHS',
        comment: `Preorder deposit (${preorder.tracking_code})`,
        payment_method: preorder.deposit_payment_method || null,
        received_by_user_id: req.user?.id
      }, { transaction: dbTransaction });

      // Update invoice payment totals
      invoice.amount_paid = preorder.deposit_amount;
      invoice.balance_due = (preorder.selling_price * preorder.quantity) - preorder.deposit_amount;

      if (invoice.balance_due <= 0) {
        invoice.status = 'PAID';
      } else {
        invoice.status = 'PARTIALLY_PAID';
      }
      await invoice.save({ transaction: dbTransaction });
    }

    // Update preorder
    preorder.invoice_id = invoice.id;
    preorder.status = 'Completed';
    preorder.updated_by = req.user?.id;
    await preorder.save({ transaction: dbTransaction });

    await dbTransaction.commit();

    res.json({
      success: true,
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        preorder_status: 'Completed'
      }
    });
  } catch (err) {
    await dbTransaction.rollback();
    throw err;
  }
});

// ─── Summary ─────────────────────────────────────────────────
exports.summary = asyncHandler(async (req, res) => {
  const activeStatuses = ['Deposit Paid', 'Purchased', 'Shipped', 'Arrived'];

  const all = await Preorder.findAll({
    where: { status: { [Op.in]: activeStatuses } },
    attributes: ['status', 'selling_price', 'deposit_amount', 'estimated_arrival_date'],
    raw: true
  });

  const byStatus = {};
  let totalDeposits = 0;
  let totalBalance = 0;
  let arrivingThisWeek = 0;

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  for (const row of all) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    totalDeposits += parseFloat(row.deposit_amount) || 0;
    totalBalance += (parseFloat(row.selling_price) || 0) - (parseFloat(row.deposit_amount) || 0);

    if (row.estimated_arrival_date) {
      const arrival = new Date(row.estimated_arrival_date);
      if (arrival >= now && arrival <= weekEnd) {
        arrivingThisWeek++;
      }
    }
  }

  res.json({
    success: true,
    data: {
      total_active: all.length,
      by_status: byStatus,
      total_deposits_collected: Math.round(totalDeposits * 100) / 100,
      total_balance_outstanding: Math.round(totalBalance * 100) / 100,
      arriving_this_week: arrivingThisWeek
    }
  });
});

// ─── Helpers ─────────────────────────────────────────────────
function applyStatusDates(preorder, status) {
  const today = new Date().toISOString().split('T')[0];

  switch (status) {
    case 'Purchased':
      if (!preorder.purchase_date) preorder.purchase_date = today;
      break;
    case 'Shipped':
      if (!preorder.shipped_date) preorder.shipped_date = today;
      break;
    case 'Arrived':
      if (!preorder.actual_arrival_date) preorder.actual_arrival_date = today;
      break;
  }
}
