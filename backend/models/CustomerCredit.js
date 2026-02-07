'use strict';

const { Model } = require('sequelize');

const CREDIT_STATUSES = ['ACTIVE', 'CONSUMED', 'VOIDED'];

module.exports = (sequelize, DataTypes) => {
  class CustomerCredit extends Model {
    static associate(models) {
      CustomerCredit.belongsTo(models.Customer, {
        foreignKey: 'customer_id',
        as: 'customer'
      });

      CustomerCredit.belongsTo(models.InvoiceReturn, {
        foreignKey: 'source_return_id',
        as: 'sourceReturn'
      });

      CustomerCredit.belongsTo(models.User, {
        foreignKey: 'created_by_user_id',
        as: 'createdBy'
      });

      CustomerCredit.belongsTo(models.User, {
        foreignKey: 'voided_by_user_id',
        as: 'voidedBy'
      });

      CustomerCredit.hasMany(models.CustomerCreditApplication, {
        foreignKey: 'credit_id',
        as: 'applications'
      });
    }

    /**
     * Check if credit is active and has remaining balance
     */
    isUsable() {
      return this.status === 'ACTIVE' && this.remaining_amount > 0;
    }

    /**
     * Check if credit is voided
     */
    isVoided() {
      return this.status === 'VOIDED';
    }

    /**
     * Check if credit is fully consumed
     */
    isConsumed() {
      return this.status === 'CONSUMED' || this.remaining_amount <= 0;
    }

    /**
     * Get display text for status
     */
    getStatusDisplay() {
      const labels = {
        'ACTIVE': 'Active',
        'CONSUMED': 'Fully Used',
        'VOIDED': 'Voided'
      };
      return labels[this.status] || this.status;
    }

    /**
     * Apply credit to an invoice
     * Returns the amount that was actually applied
     */
    async applyToInvoice(amountToApply, invoiceId, userId, dbTransaction = null) {
      const queryOptions = dbTransaction ? { transaction: dbTransaction } : {};

      if (!this.isUsable()) {
        throw new Error('This credit is not available for use');
      }

      // Can't apply more than remaining
      const actualAmount = Math.min(amountToApply, this.remaining_amount);

      if (actualAmount <= 0) {
        throw new Error('No credit available to apply');
      }

      // Update remaining amount
      this.remaining_amount = parseFloat((this.remaining_amount - actualAmount).toFixed(2));

      // Update status if fully consumed
      if (this.remaining_amount <= 0) {
        this.status = 'CONSUMED';
      }

      await this.save(queryOptions);

      return actualAmount;
    }
  }

  CustomerCredit.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'GHS'
    },
    original_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      get() {
        const value = this.getDataValue('original_amount');
        return value ? parseFloat(value) : 0;
      }
    },
    remaining_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      get() {
        const value = this.getDataValue('remaining_amount');
        return value ? parseFloat(value) : 0;
      }
    },
    status: {
      type: DataTypes.ENUM(...CREDIT_STATUSES),
      allowNull: false,
      defaultValue: 'ACTIVE'
    },
    source_return_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoice_returns',
        key: 'id'
      }
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
    voided_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    voided_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'CustomerCredit',
    tableName: 'customer_credits',
    underscored: true,
    timestamps: false,
    scopes: {
      active: {
        where: { status: 'ACTIVE' }
      },
      usable: {
        where: {
          status: 'ACTIVE',
          remaining_amount: { [sequelize.Sequelize.Op.gt]: 0 }
        }
      }
    }
  });

  // Static constants
  CustomerCredit.CREDIT_STATUSES = CREDIT_STATUSES;

  return CustomerCredit;
};
