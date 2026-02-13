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
  Invoice.prototype.recalculateTotals = async function() {
    const InvoiceItem = sequelize.models.InvoiceItem;
    const items = await InvoiceItem.findAll({
      where: { invoice_id: this.id, voided_at: null }
    });

    let subtotal = 0;
    let totalCost = 0;

    items.forEach(item => {
      subtotal += parseFloat(item.line_total_amount) || 0;
      totalCost += parseFloat(item.line_cost_amount) || 0;
    });

    const totalProfit = subtotal - totalCost;
    const marginPercent = totalCost > 0 ? ((totalProfit / totalCost) * 100) : null;

    this.subtotal_amount = subtotal;
    this.total_amount = subtotal; // Can add tax/discounts later
    this.total_cost_amount = totalCost;
    this.total_profit_amount = totalProfit;
    this.margin_percent = marginPercent;

    // Update balance_due based on payments
    const amountPaid = parseFloat(this.amount_paid) || 0;
    this.balance_due = subtotal - amountPaid;

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
