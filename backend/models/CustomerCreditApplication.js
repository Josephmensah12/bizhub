'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerCreditApplication extends Model {
    static associate(models) {
      CustomerCreditApplication.belongsTo(models.CustomerCredit, {
        foreignKey: 'credit_id',
        as: 'credit'
      });

      CustomerCreditApplication.belongsTo(models.Invoice, {
        foreignKey: 'invoice_id',
        as: 'invoice'
      });

      CustomerCreditApplication.belongsTo(models.User, {
        foreignKey: 'applied_by_user_id',
        as: 'appliedBy'
      });

      CustomerCreditApplication.belongsTo(models.User, {
        foreignKey: 'voided_by_user_id',
        as: 'voidedBy'
      });
    }

    /**
     * Check if application is voided
     */
    isVoided() {
      return this.voided_at !== null;
    }
  }

  CustomerCreditApplication.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    credit_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'customer_credits',
        key: 'id'
      }
    },
    invoice_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoices',
        key: 'id'
      }
    },
    amount_applied: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      get() {
        const value = this.getDataValue('amount_applied');
        return value ? parseFloat(value) : 0;
      }
    },
    applied_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    applied_by_user_id: {
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
    }
  }, {
    sequelize,
    modelName: 'CustomerCreditApplication',
    tableName: 'customer_credit_applications',
    underscored: true,
    timestamps: false,
    scopes: {
      active: {
        where: {
          voided_at: null
        }
      }
    }
  });

  return CustomerCreditApplication;
};
