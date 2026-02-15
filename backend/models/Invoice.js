/**
 * Invoice Model
 *
 * Sales invoice with customer, items, payments, and financial tracking
 */

const INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
const INVOICE_CURRENCIES = ['USD', 'GHS', 'GBP'];

module.exports = (sequelize, DataTypes) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    invoice_number: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    invoice_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    status: {
      type: DataTypes.ENUM(...INVOICE_STATUSES),
      allowNull: false,
      defaultValue: 'UNPAID'
    },
    currency: {
      type: DataTypes.ENUM(...INVOICE_CURRENCIES),
      allowNull: false,
      defaultValue: 'GHS'
    },
    subtotal_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('subtotal_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    total_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('total_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    amount_paid: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('amount_paid');
        return val === null ? 0 : parseFloat(val);
      }
    },
    balance_due: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('balance_due');
        return val === null ? 0 : parseFloat(val);
      }
    },
    total_cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('total_cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    total_profit_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('total_profit_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    margin_percent: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      get() {
        const val = this.getDataValue('margin_percent');
        return val === null ? null : parseFloat(val);
      }
    },
    // FX snapshot
    fx_rate_source: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    fx_rate_fetched: {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true,
      get() {
        const val = this.getDataValue('fx_rate_fetched');
        return val === null ? null : parseFloat(val);
      }
    },
    fx_rate_markup: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      get() {
        const val = this.getDataValue('fx_rate_markup');
        return val === null ? null : parseFloat(val);
      }
    },
    fx_rate_used: {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true,
      get() {
        const val = this.getDataValue('fx_rate_used');
        return val === null ? null : parseFloat(val);
      }
    },
    fx_fetched_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Invoice-level discount
    discount_type: {
      type: DataTypes.ENUM('none', 'percentage', 'fixed'),
      allowNull: false,
      defaultValue: 'none'
    },
    discount_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('discount_value');
        return val === null ? 0 : parseFloat(val);
      }
    },
    discount_percent: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('discount_percent');
        return val === null ? 0 : parseFloat(val);
      }
    },
    discount_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('discount_amount');
        return val === null ? 0 : parseFloat(val);
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    pdf_access_token: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    pdf_generated_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    // Import tracking
    salesbinder_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Original SalesBinder invoice ID for tracking imports'
    },
    salesbinder_invoice_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Original SalesBinder invoice number for reference'
    },
    // Cancellation fields
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelled_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cancellation_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Storefront / payment gateway fields
    source: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'in_store',
      comment: 'Order source: in_store, website, jiji, instagram, whatsapp, phone, other'
    },
    payment_reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'External payment reference (e.g. Paystack reference)'
    },
    payment_method: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Invoice-level payment method: cash, momo, bank_transfer, paystack, card, other'
    },
    // Soft-delete fields
    is_deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deleted_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'invoices',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Invoice.associate = (models) => {
    Invoice.belongsTo(models.Customer, { as: 'customer', foreignKey: 'customer_id' });
    Invoice.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    Invoice.belongsTo(models.User, { as: 'updater', foreignKey: 'updated_by' });
    Invoice.belongsTo(models.User, { as: 'cancelledBy', foreignKey: 'cancelled_by_user_id' });
    Invoice.belongsTo(models.User, { as: 'deletedBy', foreignKey: 'deleted_by_user_id' });
    Invoice.hasMany(models.InvoiceItem, { as: 'items', foreignKey: 'invoice_id' });
    Invoice.hasMany(models.InvoicePayment, { as: 'payments', foreignKey: 'invoice_id' });
  };

  // Static: Get statuses
  Invoice.STATUSES = INVOICE_STATUSES;
  Invoice.CURRENCIES = INVOICE_CURRENCIES;

  // Generate invoice number
  Invoice.generateInvoiceNumber = async function() {
    const year = new Date().getFullYear();
    const [results] = await sequelize.query(
      "SELECT nextval('invoice_number_seq') as seq"
    );
    const seq = results[0].seq;
    return `INV-${year}-${String(seq).padStart(6, '0')}`;
  };

  // Recalculate totals (including balance_due), excluding voided items
  // Handles both line-item discounts (already in line_total_amount) and invoice-level discount
  Invoice.prototype.recalculateTotals = async function() {
    const round2 = n => Math.round(n * 100) / 100;
    const InvoiceItem = sequelize.models.InvoiceItem;
    const items = await InvoiceItem.findAll({
      where: { invoice_id: this.id, voided_at: null }
    });

    // subtotal = sum of line totals (already discounted per-item)
    let subtotal = 0;
    let totalCost = 0;
    let lineDiscountsTotal = 0;

    items.forEach(item => {
      subtotal += parseFloat(item.line_total_amount) || 0;
      totalCost += parseFloat(item.line_cost_amount) || 0;
      lineDiscountsTotal += parseFloat(item.discount_amount) || 0;
    });

    subtotal = round2(subtotal);
    totalCost = round2(totalCost);

    // Apply invoice-level discount on top of the (already line-discounted) subtotal
    const discountType = this.discount_type || 'none';
    const discountValue = parseFloat(this.discount_value) || 0;
    let invoiceDiscountAmt = 0;

    if (discountType === 'percentage' && discountValue > 0) {
      invoiceDiscountAmt = round2(subtotal * (discountValue / 100));
      this.discount_percent = discountValue;
    } else if (discountType === 'fixed' && discountValue > 0) {
      invoiceDiscountAmt = round2(Math.min(discountValue, subtotal));
      this.discount_percent = subtotal > 0 ? round2((invoiceDiscountAmt / subtotal) * 100) : 0;
    } else {
      this.discount_percent = 0;
    }

    this.discount_amount = round2(invoiceDiscountAmt);

    const totalAmount = round2(subtotal - invoiceDiscountAmt);
    const totalProfit = round2(totalAmount - totalCost);
    const marginPercent = totalAmount > 0 ? round2((totalProfit / totalAmount) * 100) : null;

    this.subtotal_amount = subtotal;
    this.total_amount = totalAmount;
    this.total_cost_amount = totalCost;
    this.total_profit_amount = totalProfit;
    this.margin_percent = marginPercent;

    // Update balance_due based on payments
    const amountPaid = parseFloat(this.amount_paid) || 0;
    this.balance_due = round2(totalAmount - amountPaid);

    await this.save();
    return this;
  };

  /**
   * Update payment status based on amount_paid vs total_amount
   * Call this after adding/removing payments
   */
  Invoice.prototype.updatePaymentStatus = async function(transaction = null) {
    const totalAmount = parseFloat(this.total_amount) || 0;
    const amountPaid = parseFloat(this.amount_paid) || 0;

    // Calculate balance
    this.balance_due = totalAmount - amountPaid;

    // Determine status based on payment
    if (this.status === 'CANCELLED') {
      // Don't change cancelled status
    } else if (amountPaid <= 0) {
      this.status = 'UNPAID';
    } else if (amountPaid >= totalAmount) {
      this.status = 'PAID';
    } else {
      this.status = 'PARTIALLY_PAID';
    }

    const saveOptions = transaction ? { transaction } : {};
    await this.save(saveOptions);
    return this;
  };

  /**
   * Add a payment to this invoice
   * @param {number} amount - Payment amount
   * @param {string} comment - Required payment comment
   * @param {number} userId - User receiving payment
   * @param {Date} paymentDate - Optional payment date
   * @param {Transaction} transaction - Optional sequelize transaction
   */
  Invoice.prototype.addPayment = async function(amount, comment, userId, paymentDate = null, transaction = null) {
    const InvoicePayment = sequelize.models.InvoicePayment;

    const paymentAmount = parseFloat(amount);
    const currentPaid = parseFloat(this.amount_paid) || 0;
    const totalAmount = parseFloat(this.total_amount) || 0;

    // Validate
    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    if (!comment || comment.trim() === '') {
      throw new Error('Payment comment is required');
    }

    if (currentPaid + paymentAmount > totalAmount) {
      throw new Error(`Payment would exceed invoice total. Maximum payment allowed: ${(totalAmount - currentPaid).toFixed(2)}`);
    }

    if (this.status === 'CANCELLED') {
      throw new Error('Cannot add payment to cancelled invoice');
    }

    // Create payment record
    const createOptions = transaction ? { transaction } : {};
    const payment = await InvoicePayment.create({
      invoice_id: this.id,
      payment_date: paymentDate || new Date(),
      amount: paymentAmount,
      currency: this.currency,
      comment: comment.trim(),
      received_by_user_id: userId
    }, createOptions);

    // Update invoice amount_paid
    this.amount_paid = currentPaid + paymentAmount;

    // Update status
    await this.updatePaymentStatus(transaction);

    return payment;
  };

  return Invoice;
};
