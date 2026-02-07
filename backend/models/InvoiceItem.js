/**
 * InvoiceItem Model
 *
 * Line items for invoices, linked to inventory assets
 */

module.exports = (sequelize, DataTypes) => {
  const InvoiceItem = sequelize.define('InvoiceItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    invoice_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    asset_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    unit_price_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('unit_price_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    line_total_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('line_total_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    unit_cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('unit_cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    line_cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('line_cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    line_profit_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('line_profit_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    // Original cost before FX conversion
    original_cost_currency: {
      type: DataTypes.STRING(3),
      allowNull: true
    },
    original_cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('original_cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    // Track returned quantities
    quantity_returned_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    tableName: 'invoice_items',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  InvoiceItem.associate = (models) => {
    InvoiceItem.belongsTo(models.Invoice, { as: 'invoice', foreignKey: 'invoice_id' });
    InvoiceItem.belongsTo(models.Asset, { as: 'asset', foreignKey: 'asset_id' });
    InvoiceItem.hasMany(models.InvoiceReturnItem, { as: 'returnItems', foreignKey: 'invoice_item_id' });
  };

  // Get returnable quantity (sold minus already returned)
  InvoiceItem.prototype.getReturnableQuantity = function() {
    return Math.max(0, this.quantity - (this.quantity_returned_total || 0));
  };

  // Check if item can be returned
  InvoiceItem.prototype.canReturn = function(quantityToReturn = 1) {
    return this.getReturnableQuantity() >= quantityToReturn;
  };

  // Calculate line totals
  InvoiceItem.prototype.calculateTotals = function() {
    this.line_total_amount = this.quantity * this.unit_price_amount;
    this.line_cost_amount = this.quantity * this.unit_cost_amount;
    this.line_profit_amount = this.line_total_amount - this.line_cost_amount;
  };

  // Before save hook to calculate totals
  InvoiceItem.beforeSave((item, options) => {
    item.calculateTotals();
  });

  return InvoiceItem;
};
