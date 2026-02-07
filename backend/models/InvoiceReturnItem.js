'use strict';

const { Model } = require('sequelize');

const RESTOCK_CONDITIONS = ['AS_IS', 'NEEDS_TESTING', 'NEEDS_REPAIR'];

module.exports = (sequelize, DataTypes) => {
  class InvoiceReturnItem extends Model {
    static associate(models) {
      InvoiceReturnItem.belongsTo(models.InvoiceReturn, {
        foreignKey: 'return_id',
        as: 'return'
      });

      InvoiceReturnItem.belongsTo(models.InvoiceItem, {
        foreignKey: 'invoice_item_id',
        as: 'invoiceItem'
      });

      InvoiceReturnItem.belongsTo(models.Asset, {
        foreignKey: 'asset_id',
        as: 'asset'
      });
    }

    /**
     * Get display text for restock condition
     */
    getRestockConditionDisplay() {
      const labels = {
        'AS_IS': 'Ready for Sale',
        'NEEDS_TESTING': 'Needs Testing',
        'NEEDS_REPAIR': 'Needs Repair'
      };
      return labels[this.restock_condition] || this.restock_condition;
    }
  }

  InvoiceReturnItem.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    return_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoice_returns',
        key: 'id'
      }
    },
    invoice_item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'invoice_items',
        key: 'id'
      }
    },
    asset_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'assets',
        key: 'id'
      }
    },
    quantity_returned: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    unit_price_at_sale: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      get() {
        const value = this.getDataValue('unit_price_at_sale');
        return value ? parseFloat(value) : 0;
      }
    },
    line_return_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      get() {
        const value = this.getDataValue('line_return_amount');
        return value ? parseFloat(value) : 0;
      }
    },
    restock_condition: {
      type: DataTypes.ENUM(...RESTOCK_CONDITIONS),
      allowNull: true,
      defaultValue: 'AS_IS'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'InvoiceReturnItem',
    tableName: 'invoice_return_items',
    underscored: true,
    timestamps: false
  });

  // Static constants
  InvoiceReturnItem.RESTOCK_CONDITIONS = RESTOCK_CONDITIONS;

  return InvoiceReturnItem;
};
