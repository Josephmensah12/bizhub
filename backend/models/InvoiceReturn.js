'use strict';

const { Model } = require('sequelize');

const RETURN_TYPES = ['RETURN_REFUND', 'EXCHANGE'];
const RETURN_STATUSES = ['DRAFT', 'FINALIZED', 'CANCELLED'];
const RETURN_REASON_CODES = ['BUYER_REMORSE', 'DEFECT', 'EXCHANGE', 'OTHER'];

const RETURN_REASON_LABELS = {
  'BUYER_REMORSE': 'Buyer Remorse',
  'DEFECT': 'Defect',
  'EXCHANGE': 'Exchange',
  'OTHER': 'Other'
};

module.exports = (sequelize, DataTypes) => {
  class InvoiceReturn extends Model {
    static associate(models) {
      InvoiceReturn.belongsTo(models.Invoice, {
        foreignKey: 'invoice_id',
        as: 'invoice'
      });

      InvoiceReturn.belongsTo(models.Customer, {
        foreignKey: 'customer_id',
        as: 'customer'
      });

      InvoiceReturn.belongsTo(models.User, {
        foreignKey: 'created_by_user_id',
        as: 'createdBy'
      });

      InvoiceReturn.belongsTo(models.User, {
        foreignKey: 'finalized_by_user_id',
        as: 'finalizedBy'
      });

      InvoiceReturn.belongsTo(models.User, {
        foreignKey: 'cancelled_by_user_id',
        as: 'cancelledBy'
      });

      InvoiceReturn.hasMany(models.InvoiceReturnItem, {
        foreignKey: 'return_id',
        as: 'items'
      });

      InvoiceReturn.hasOne(models.CustomerCredit, {
        foreignKey: 'source_return_id',
        as: 'credit'
      });

      InvoiceReturn.hasMany(models.InvoicePayment, {
        foreignKey: 'linked_return_id',
        as: 'transactions'
      });
    }

    /**
     * Check if return is in draft status
     */
    isDraft() {
      return this.status === 'DRAFT';
    }

    /**
     * Check if return is finalized
     */
    isFinalized() {
      return this.status === 'FINALIZED';
    }

    /**
     * Check if return is cancelled
     */
    isCancelled() {
      return this.status === 'CANCELLED';
    }

    /**
     * Get display text for return type
     */
    getTypeDisplay() {
      return this.return_type === 'RETURN_REFUND' ? 'Return & Refund' : 'Exchange (Store Credit)';
    }

    /**
     * Get display text for status
     */
    getStatusDisplay() {
      const labels = {
        'DRAFT': 'Draft',
        'FINALIZED': 'Finalized',
        'CANCELLED': 'Cancelled'
      };
      return labels[this.status] || this.status;
    }

    /**
     * Get display text for return reason code
     */
    getReasonDisplay() {
      return RETURN_REASON_LABELS[this.return_reason_code] || this.return_reason_code;
    }
  }

  InvoiceReturn.init({
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
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    return_type: {
      type: DataTypes.ENUM(...RETURN_TYPES),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM(...RETURN_STATUSES),
      allowNull: false,
      defaultValue: 'DRAFT'
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'GHS'
    },
    total_return_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('total_return_amount');
        return value ? parseFloat(value) : 0;
      }
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    return_reason_code: {
      type: DataTypes.ENUM(...RETURN_REASON_CODES),
      allowNull: true
    },
    return_reason_details: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    finalized_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    finalized_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelled_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'InvoiceReturn',
    tableName: 'invoice_returns',
    underscored: true,
    timestamps: false,
    scopes: {
      draft: {
        where: { status: 'DRAFT' }
      },
      finalized: {
        where: { status: 'FINALIZED' }
      },
      active: {
        where: {
          status: { [sequelize.Sequelize.Op.ne]: 'CANCELLED' }
        }
      }
    }
  });

  // Static constants
  InvoiceReturn.RETURN_TYPES = RETURN_TYPES;
  InvoiceReturn.RETURN_STATUSES = RETURN_STATUSES;
  InvoiceReturn.RETURN_REASON_CODES = RETURN_REASON_CODES;
  InvoiceReturn.RETURN_REASON_LABELS = RETURN_REASON_LABELS;

  return InvoiceReturn;
};
