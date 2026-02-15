/**
 * Storefront Controller
 *
 * Public-facing API for the Payless4Tech website.
 * Products, orders, Paystack payments, and customer lookup.
 */

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
const crypto = require('crypto');
const axios = require('axios');
const { Op, QueryTypes } = require('sequelize');
const { Invoice, InvoiceItem, InvoicePayment, Customer, Asset, ActivityLog, sequelize } = require('../models');
const { computeAvailability, computeBulkAvailability } = require('../services/inventoryAvailabilityService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a storefront-friendly specs object from Asset fields.
 */
function buildSpecs(asset) {
  const specs = {};
  if (asset.cpu) specs.cpu = asset.cpu;
  if (asset.ram_gb) specs.ram = `${asset.ram_gb}GB`;
  if (asset.storage_gb) {
    specs.storage = `${asset.storage_gb}GB${asset.storage_type ? ' ' + asset.storage_type : ''}`;
  }
  if (asset.screen_size_inches) specs.screen_size = `${asset.screen_size_inches}"`;
  if (asset.gpu) specs.gpu = asset.gpu;
  if (asset.resolution) specs.resolution = asset.resolution;
  if (asset.battery_health_percent != null) specs.battery_health = `${asset.battery_health_percent}%`;

  const chars = asset.major_characteristics || [];
  if (chars.length) {
    specs.touchscreen = chars.includes('Touchscreen');
    specs.features = chars;
  }

  return specs;
}

/**
 * Map an Asset row to the public product shape.
 * @param {Asset} asset
 * @param {number|null} availableQty - computed available quantity (if known)
 */
function formatProduct(asset, availableQty = null) {
  const qty = availableQty != null ? availableQty : (parseInt(asset.quantity) || 0);
  return {
    id: asset.id,
    name: `${asset.make} ${asset.model}`,
    make: asset.make,
    model: asset.model,
    category: asset.category,
    asset_type: asset.asset_type,
    condition: asset.condition,
    description: asset.specs || '',
    specs: buildSpecs(asset),
    price: parseFloat(asset.price_amount) || 0,
    currency: asset.price_currency || 'GHS',
    images: [],
    quantity: qty,
    in_stock: qty > 0,
    asset_tag: asset.asset_tag,
    featured: !!asset.featured,
    created_at: asset.created_at
  };
}

/**
 * Map Paystack channel to InvoicePayment payment_method.
 */
function paystackChannelToMethod(channel) {
  const map = { card: 'Card', bank: 'ACH', mobile_money: 'MoMo', ussd: 'Other', qr: 'Other' };
  return map[channel] || 'Other';
}

/**
 * Look up or create a Customer by phone/email.
 */
async function findOrCreateCustomer({ first_name, last_name, email, phone }, transaction = null) {
  const opts = transaction ? { transaction } : {};
  let customer = null;

  // Try phone first (normalised E.164)
  if (phone) {
    const { normalizePhone } = require('../utils/phoneNormalizer');
    const e164 = normalizePhone(phone);
    if (e164) {
      customer = await Customer.findOne({ where: { phone_e164: e164 }, ...opts });
    }
    if (!customer) {
      customer = await Customer.findOne({ where: { phone_raw: phone }, ...opts });
    }
  }

  // Then email
  if (!customer && email) {
    customer = await Customer.findOne({
      where: { email_lower: email.toLowerCase().trim() },
      ...opts
    });
  }

  // Create new
  if (!customer) {
    customer = await Customer.create({
      first_name: first_name || null,
      last_name: last_name || null,
      email: email || null,
      phone_raw: phone || null,
      heard_about_us: 'Other',
      heard_about_us_other_text: 'Website'
    }, opts);
  }

  return customer;
}

// ---------------------------------------------------------------------------
// Product endpoints
// ---------------------------------------------------------------------------

/**
 * GET /products
 * Paginated, filterable product listing.
 */
exports.getProducts = asyncHandler(async (req, res) => {
  let { page, limit, category, asset_type, condition, brand, minPrice, maxPrice, search, sort, inStock } = req.query;

  if (search && search.length > 100) search = search.substring(0, 100);

  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (page - 1) * limit;

  // Build WHERE clause
  const where = { deleted_at: null };

  // Default: only in-stock products
  if (inStock !== 'false') {
    where.quantity = { [Op.gt]: 0 };
  }

  // Must have a price
  where.price_amount = { [Op.gt]: 0 };

  if (category) where.category = category;
  if (asset_type) where.asset_type = asset_type;
  if (condition) where.condition = condition;
  if (brand) where.make = { [Op.iLike]: brand };

  if (minPrice || maxPrice) {
    where.price_amount = {
      ...(where.price_amount || {}),
      ...(minPrice ? { [Op.gte]: parseFloat(minPrice) } : {}),
      ...(maxPrice ? { [Op.lte]: parseFloat(maxPrice) } : {})
    };
  }

  if (search) {
    where[Op.or] = [
      { make: { [Op.iLike]: `%${search}%` } },
      { model: { [Op.iLike]: `%${search}%` } },
      { specs: { [Op.iLike]: `%${search}%` } },
      { asset_tag: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Sort
  let order;
  switch (sort) {
    case 'price_asc':  order = [['price_amount', 'ASC']]; break;
    case 'price_desc': order = [['price_amount', 'DESC']]; break;
    case 'name_asc':   order = [['make', 'ASC'], ['model', 'ASC']]; break;
    case 'newest':
    default:           order = [['created_at', 'DESC']]; break;
  }

  const { count, rows } = await Asset.findAndCountAll({
    where,
    order,
    limit,
    offset,
    attributes: { exclude: ['cost_amount', 'cost_currency', 'salesbinder_id', 'created_by', 'updated_by', 'deleted_by', 'import_batch_id'] }
  });

  // Compute real availability for the page of results
  const assetIds = rows.map(a => a.id);
  const availMap = assetIds.length ? await computeBulkAvailability(assetIds) : new Map();

  const products = rows.map(asset => {
    const avail = availMap.get(asset.id);
    return formatProduct(asset, avail ? avail.available : null);
  });

  res.json({
    success: true,
    data: {
      products,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    }
  });
});

/**
 * GET /products/featured
 * Featured products — flagged items, falling back to 8 most recent in-stock.
 */
exports.getFeaturedProducts = asyncHandler(async (req, res) => {
  const limitNum = Math.min(20, parseInt(req.query.limit) || 8);

  // Try featured first
  let products = await Asset.findAll({
    where: {
      featured: true,
      quantity: { [Op.gt]: 0 },
      price_amount: { [Op.gt]: 0 },
      deleted_at: null
    },
    order: [['created_at', 'DESC']],
    limit: limitNum,
    attributes: { exclude: ['cost_amount', 'cost_currency', 'salesbinder_id', 'created_by', 'updated_by', 'deleted_by', 'import_batch_id'] }
  });

  // Fallback: most recently added in-stock items
  if (products.length === 0) {
    products = await Asset.findAll({
      where: {
        quantity: { [Op.gt]: 0 },
        price_amount: { [Op.gt]: 0 },
        deleted_at: null
      },
      order: [['created_at', 'DESC']],
      limit: limitNum,
      attributes: { exclude: ['cost_amount', 'cost_currency', 'salesbinder_id', 'created_by', 'updated_by', 'deleted_by', 'import_batch_id'] }
    });
  }

  const assetIds = products.map(a => a.id);
  const availMap = assetIds.length ? await computeBulkAvailability(assetIds) : new Map();

  res.json({
    success: true,
    data: {
      products: products.map(a => {
        const avail = availMap.get(a.id);
        return formatProduct(a, avail ? avail.available : null);
      })
    }
  });
});

/**
 * GET /products/:id
 * Single product with full details.
 */
exports.getProductById = asyncHandler(async (req, res) => {
  const asset = await Asset.findOne({
    where: { id: req.params.id, deleted_at: null },
    attributes: { exclude: ['cost_amount', 'cost_currency', 'salesbinder_id', 'created_by', 'updated_by', 'deleted_by', 'import_batch_id'] }
  });

  if (!asset) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found' }
    });
  }

  const availMap = await computeBulkAvailability([asset.id]);
  const avail = availMap.get(asset.id);

  res.json({
    success: true,
    data: { product: formatProduct(asset, avail ? avail.available : null) }
  });
});

/**
 * GET /categories
 * Categories with in-stock product counts.
 */
exports.getCategories = asyncHandler(async (req, res) => {
  const rows = await sequelize.query(
    `SELECT category, asset_type, COUNT(*) AS count
     FROM assets
     WHERE deleted_at IS NULL
       AND quantity > 0
       AND price_amount > 0
     GROUP BY category, asset_type
     ORDER BY category, asset_type`,
    { type: QueryTypes.SELECT }
  );

  res.json({
    success: true,
    data: rows.map(r => ({
      category: r.category,
      asset_type: r.asset_type,
      count: parseInt(r.count),
      image: null
    }))
  });
});

// ---------------------------------------------------------------------------
// Order / Checkout endpoints
// ---------------------------------------------------------------------------

/**
 * POST /orders
 * Create a new order (Invoice) from website checkout.
 */
exports.createOrder = asyncHandler(async (req, res) => {
  let { customer: customerData, items, fulfillment, delivery_address, source, notes } = req.body;

  // Validate request
  if (!customerData || (!customerData.phone && !customerData.email)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_CUSTOMER', message: 'Customer phone or email is required' }
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ITEMS', message: 'At least one item is required' }
    });
  }

  if (items.length > 20) {
    return res.status(400).json({
      success: false,
      error: { code: 'TOO_MANY_ITEMS', message: 'Maximum 20 items per order' }
    });
  }

  // Input length limits — truncate silently
  if (notes && notes.length > 500) notes = notes.substring(0, 500);
  if (delivery_address && delivery_address.length > 500) delivery_address = delivery_address.substring(0, 500);

  // Customer field limits
  if (customerData.first_name && customerData.first_name.length > 100) customerData.first_name = customerData.first_name.substring(0, 100);
  if (customerData.last_name && customerData.last_name.length > 100) customerData.last_name = customerData.last_name.substring(0, 100);
  if (customerData.phone && customerData.phone.length > 20) customerData.phone = customerData.phone.substring(0, 20);
  if (customerData.email) {
    if (customerData.email.length > 254) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Email address is too long' }
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.email)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Invalid email format' }
      });
    }
  }

  const transaction = await sequelize.transaction();

  try {
    // 1. Find or create customer
    const customer = await findOrCreateCustomer(customerData, transaction);

    // 2. Generate invoice number and create invoice
    const invoiceNumber = await Invoice.generateInvoiceNumber();

    const invoice = await Invoice.create({
      invoice_number: invoiceNumber,
      customer_id: customer.id,
      invoice_date: new Date(),
      status: 'UNPAID',
      currency: 'GHS',
      subtotal_amount: 0,
      total_amount: 0,
      amount_paid: 0,
      balance_due: 0,
      total_cost_amount: 0,
      total_profit_amount: 0,
      source: source || 'website',
      notes: [
        fulfillment === 'delivery' ? `Delivery to: ${delivery_address || 'N/A'}` : 'Pickup',
        notes
      ].filter(Boolean).join(' | ')
    }, { transaction });

    // 3. Validate stock & create invoice items
    const createdItems = [];

    for (const orderItem of items) {
      const { product_id, quantity = 1 } = orderItem;

      if (!product_id || quantity < 1) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ITEM', message: `Invalid product_id or quantity for item` }
        });
      }

      // Check availability with row locking
      const { available, asset } = await computeAvailability(product_id, { transaction });

      if (!asset) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${product_id} not found` }
        });
      }

      if (quantity > available) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for ${asset.make} ${asset.model}: ${available} available, ${quantity} requested`
          }
        });
      }

      // Build description
      const serial = asset.serial_number ? ` S/N: ${asset.serial_number}` : '';
      const description = `${asset.make} ${asset.model}${serial} [${asset.asset_tag}]`;

      // Create invoice item — beforeSave hook calculates totals
      const item = await InvoiceItem.create({
        invoice_id: invoice.id,
        asset_id: asset.id,
        description,
        quantity,
        unit_price_amount: parseFloat(asset.price_amount) || 0,
        unit_cost_amount: parseFloat(asset.cost_amount) || 0,
        original_cost_currency: asset.cost_currency,
        original_cost_amount: parseFloat(asset.cost_amount) || 0,
        discount_type: 'none',
        discount_value: 0
      }, { transaction });

      // Update asset computed status
      await asset.updateComputedStatus(transaction);

      createdItems.push(item);
    }

    await transaction.commit();

    // Recalculate invoice totals (outside transaction, follows existing pattern)
    await invoice.recalculateTotals();

    // Reload invoice with items
    await invoice.reload({
      include: [
        { model: Customer, as: 'customer' },
        {
          model: InvoiceItem,
          as: 'items',
          include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'condition'] }]
        }
      ]
    });

    // Log activity
    await ActivityLog.log({
      actionType: 'INVOICE_CREATED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      summary: `Storefront order ${invoice.invoice_number} created`,
      metadata: { invoiceNumber: invoice.invoice_number, source: 'website', customerEmail: customerData.email }
    });

    res.status(201).json({
      success: true,
      data: {
        order_id: invoice.id,
        invoice_number: invoice.invoice_number,
        total: parseFloat(invoice.total_amount),
        currency: invoice.currency,
        status: invoice.status,
        payment_url: null,
        items: invoice.items.map(i => ({
          id: i.id,
          description: i.description,
          quantity: i.quantity,
          unit_price: parseFloat(i.unit_price_amount),
          line_total: parseFloat(i.line_total_amount)
        }))
      }
    });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
});

/**
 * GET /orders/:id
 * Get order status (customer-facing — no cost/profit data).
 */
exports.getOrder = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id, {
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'first_name', 'last_name', 'email', 'phone_raw'] },
      {
        model: InvoiceItem,
        as: 'items',
        where: { voided_at: null },
        required: false,
        include: [{ model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'make', 'model', 'condition'] }]
      },
      {
        model: InvoicePayment,
        as: 'payments',
        where: { voided_at: null },
        required: false,
        attributes: ['id', 'amount', 'currency', 'payment_method', 'payment_date', 'created_at']
      }
    ]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Order not found' }
    });
  }

  res.json({
    success: true,
    data: {
      order_id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      currency: invoice.currency,
      subtotal: parseFloat(invoice.subtotal_amount),
      total: parseFloat(invoice.total_amount),
      amount_paid: parseFloat(invoice.amount_paid),
      balance_due: parseFloat(invoice.balance_due),
      payment_method: invoice.payment_method,
      source: invoice.source,
      created_at: invoice.created_at,
      customer: invoice.customer ? {
        first_name: invoice.customer.first_name,
        last_name: invoice.customer.last_name,
        email: invoice.customer.email,
        phone: invoice.customer.phone_raw
      } : null,
      items: (invoice.items || []).map(i => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: parseFloat(i.unit_price_amount),
        line_total: parseFloat(i.line_total_amount),
        product: i.asset ? {
          id: i.asset.id,
          name: `${i.asset.make} ${i.asset.model}`,
          asset_tag: i.asset.asset_tag,
          condition: i.asset.condition
        } : null
      })),
      payments: (invoice.payments || []).map(p => ({
        id: p.id,
        amount: parseFloat(p.amount),
        currency: p.currency,
        method: p.payment_method,
        date: p.payment_date
      }))
    }
  });
});

// ---------------------------------------------------------------------------
// Payment endpoints
// ---------------------------------------------------------------------------

/**
 * POST /orders/:id/initiate-payment
 * Initialize a Paystack transaction for the order.
 */
exports.initiatePayment = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id, {
    include: [{ model: Customer, as: 'customer' }]
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Order not found' }
    });
  }

  if (invoice.status === 'PAID') {
    return res.status(400).json({
      success: false,
      error: { code: 'ALREADY_PAID', message: 'This order has already been paid' }
    });
  }

  if (invoice.status === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_CANCELLED', message: 'This order has been cancelled' }
    });
  }

  const email = invoice.customer?.email || req.body.email;
  if (!email) {
    return res.status(400).json({
      success: false,
      error: { code: 'EMAIL_REQUIRED', message: 'Customer email is required for payment' }
    });
  }

  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) {
    return res.status(500).json({
      success: false,
      error: { code: 'CONFIG_ERROR', message: 'Payment gateway not configured' }
    });
  }

  const balanceDue = parseFloat(invoice.balance_due) || parseFloat(invoice.total_amount);
  const amountInPesewas = Math.round(balanceDue * 100);
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || 'https://payless4tech.com/order-confirmation';

  try {
    const paystackRes = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: amountInPesewas,
        reference: invoice.invoice_number,
        callback_url: `${callbackUrl}?order_id=${invoice.id}`,
        currency: invoice.currency,
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_name: invoice.customer
            ? `${invoice.customer.first_name || ''} ${invoice.customer.last_name || ''}`.trim()
            : 'Unknown'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!paystackRes.data?.status) {
      return res.status(502).json({
        success: false,
        error: { code: 'PAYMENT_INIT_FAILED', message: 'Failed to initialize payment with Paystack' }
      });
    }

    // Store the reference on the invoice
    invoice.payment_reference = invoice.invoice_number;
    await invoice.save();

    res.json({
      success: true,
      data: {
        authorization_url: paystackRes.data.data.authorization_url,
        access_code: paystackRes.data.data.access_code,
        reference: paystackRes.data.data.reference
      }
    });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    return res.status(502).json({
      success: false,
      error: { code: 'PAYMENT_INIT_FAILED', message: `Paystack error: ${msg}` }
    });
  }
});

/**
 * POST /webhooks/paystack
 * Paystack webhook handler — verifies signature, records payment, marks invoice PAID.
 * This endpoint does NOT require the storefront API key.
 */
exports.handlePaystackWebhook = asyncHandler(async (req, res) => {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) {
    return res.status(500).send('Payment gateway not configured');
  }

  // Verify signature
  const signature = req.headers['x-paystack-signature'];
  const hash = crypto.createHmac('sha512', paystackSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== hash) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;

  // Only handle successful charges
  if (event.event !== 'charge.success') {
    return res.sendStatus(200);
  }

  const data = event.data;
  const reference = data.reference;
  const amountPaid = data.amount / 100; // pesewas → GHS
  const channel = data.channel; // card, bank, mobile_money, etc.

  // Find invoice by reference (invoice_number) or payment_reference
  const invoice = await Invoice.findOne({
    where: {
      [Op.or]: [
        { invoice_number: reference },
        { payment_reference: reference }
      ]
    },
    include: [
      {
        model: InvoiceItem,
        as: 'items',
        include: [{ model: Asset, as: 'asset' }]
      }
    ]
  });

  if (!invoice) {
    // Unknown reference — acknowledge to stop retries
    return res.sendStatus(200);
  }

  // Idempotency: if already paid, skip
  if (invoice.status === 'PAID') {
    return res.sendStatus(200);
  }

  const dbTransaction = await sequelize.transaction();

  try {
    const prevStatus = invoice.status;

    // Create payment record
    await InvoicePayment.create({
      invoice_id: invoice.id,
      transaction_type: 'PAYMENT',
      payment_date: new Date(data.paid_at || Date.now()),
      amount: amountPaid,
      currency: invoice.currency,
      payment_method: paystackChannelToMethod(channel),
      payment_method_other_text: channel === 'card' ? null : `Paystack ${channel}`,
      comment: `Paystack online payment — ref: ${reference}`,
      payment_reference: reference
    }, { transaction: dbTransaction });

    // Update invoice payment totals
    const currentPaid = parseFloat(invoice.amount_paid) || 0;
    const newPaid = currentPaid + amountPaid;
    const totalAmount = parseFloat(invoice.total_amount) || 0;

    invoice.amount_paid = newPaid;
    invoice.balance_due = Math.max(0, totalAmount - newPaid);
    invoice.payment_reference = reference;
    invoice.payment_method = 'paystack';

    if (newPaid >= totalAmount) {
      invoice.status = 'PAID';
    } else if (newPaid > 0) {
      invoice.status = 'PARTIALLY_PAID';
    }

    await invoice.save({ transaction: dbTransaction });

    // If invoice just became PAID, decrement on-hand quantity via shared method
    if (prevStatus !== 'PAID' && invoice.status === 'PAID') {
      await invoice.handlePaidTransition(dbTransaction);
    }

    await dbTransaction.commit();

    // Log activity
    await ActivityLog.log({
      actionType: 'PAYMENT_RECEIVED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      summary: `Paystack payment received for ${invoice.invoice_number}: ${invoice.currency} ${amountPaid.toFixed(2)}`,
      metadata: { reference, channel, amount: amountPaid, invoiceNumber: invoice.invoice_number }
    });
  } catch (err) {
    if (!dbTransaction.finished) await dbTransaction.rollback();
    console.error('Paystack webhook processing error:', err);
    return res.sendStatus(500);
  }

  res.sendStatus(200);
});

// ---------------------------------------------------------------------------
// Customer endpoint
// ---------------------------------------------------------------------------

/**
 * POST /customers
 * Create or find a customer.
 */
exports.createOrFindCustomer = asyncHandler(async (req, res) => {
  const { first_name, last_name, email, phone } = req.body;

  if (!phone && !email) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Phone or email is required' }
    });
  }

  const customer = await findOrCreateCustomer({ first_name, last_name, email, phone });

  res.json({
    success: true,
    data: {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone_raw,
      created_at: customer.created_at
    }
  });
});
