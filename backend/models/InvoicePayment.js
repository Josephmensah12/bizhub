'use strict';

const { Model } = require('sequelize');

const PAYMENT_METHODS = ['Cash', 'MoMo', 'Card', 'ACH', 'Other'];
const TRANSACTION_TYPES = ['PAYMENT', 'REFUND'];

module.exports = (sequelize, DataTypes) => {
  class InvoicePayment extends Model {
    static associate(models) {
      InvoicePayment.belongsTo(models.Invoice, {
        foreignKey: 'invoice_id',
        as: 'invoice'
      });

      InvoicePayment.belongsTo(models.User, {
        foreignKey: 'received_by_user_id',
        as: 'receivedBy'
      });

      InvoicePayment.belongsTo(models.User, {
        foreignKey: 'voided_by_user_id',
        as: 'voidedBy'
      });

      InvoicePayment.belongsTo(models.InvoiceReturn, {
        foreignKey: 'linked_return_id',
        as: 'linkedReturn'
      });
    }

    /**
     * Get display text for payment method
     * Returns "Other - {text}" if method is Other with specified text
     */
    getMethodDisplay() {
      if (this.payment_method === 'Other' && this.payment_method_other_text) {
        return `Other – ${this.payment_method_other_text}`;
      }
      return this.payment_method;
    }

    /**
     * Check if transaction is voided
     */
    isVoided() {
      return this.voided_at !== null;
    }

    /**
     * Get display text for transaction type
     */
    getTypeDisplay() {
      return this.transaction_type === 'PAYMENT' ? 'Payment' : 'Refund';
    }

    /**
     * Get signed amount (positive for payment, negative for refund)
     */
    getSignedAmount() {
      if (this.isVoided()) return 0;
      const amount = parseFloat(this.amount) || 0;
      return this.transaction_type === 'REFUND' ? -amount : amount;
    }
  }

  InvoicePayment.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    invoice_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoices',
        key: 'id'
      }
    },
    transaction_type: {
      type: DataTypes.ENUM(...TRANSACTION_TYPES),
      allowNull: false,
      defaultValue: 'PAYMENT'
    },
    payment_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0.01
      },
      get() {
        const value = this.getDataValue('amount');
        return value ? parseFloat(value) : 0;
      }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'GHS'
    },
    payment_method: {
      type: DataTypes.ENUM(...PAYMENT_METHODS),
      allowNull: false,
      validate: {
        isIn: {
          args: [PAYMENT_METHODS],
          msg: 'Invalid payment method'
        }
      }
    },
    payment_method_other_text: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Comment is required'
        }
      }
    },
    received_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    voided_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    voided_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    void_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    linked_return_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'invoice_returns',
        key: 'id'
      }
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'InvoicePayment',
    tableName: 'invoice_payments',
    underscored: true,
    timestamps: false,
    hooks: {
      beforeValidate: (payment) => {
        // If method is "Other", require payment_method_other_text
        if (payment.payment_method === 'Other') {
          if (!payment.payment_method_other_text || payment.payment_method_other_text.trim() === '') {
            throw new Error('Please specify the payment method when selecting "Other"');
          }
        } else {
          // Clear other text if method is not "Other"
          payment.payment_method_other_text = null;
        }
      }
    },
    scopes: {
      active: {
        where: {
          voided_at: null
        }
      }
    }
  });

  // Static constants
  InvoicePayment.PAYMENT_METHODS = PAYMENT_METHODS;
  InvoicePayment.TRANSACTION_TYPES = TRANSACTION_TYPES;

  return InvoicePayment;
};
