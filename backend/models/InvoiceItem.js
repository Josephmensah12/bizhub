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
    asset_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'asset_units',
        key: 'id'
      },
      comment: 'For serialized products, references the specific unit being sold'
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
    // Discount fields
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
    discount_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('discount_amount');
        return val === null ? 0 : parseFloat(val);
      }
    },
    pre_discount_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('pre_discount_total');
        return val === null ? null : parseFloat(val);
      }
    },
    // Track returned quantities
    quantity_returned_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    // Void fields (soft-delete for paid invoice items)
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
    tableName: 'invoice_items',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  InvoiceItem.associate = (models) => {
    InvoiceItem.belongsTo(models.Invoice, { as: 'invoice', foreignKey: 'invoice_id' });
    InvoiceItem.belongsTo(models.Asset, { as: 'asset', foreignKey: 'asset_id' });
    InvoiceItem.belongsTo(models.AssetUnit, { as: 'assetUnit', foreignKey: 'asset_unit_id' });
    InvoiceItem.belongsTo(models.User, { as: 'voidedBy', foreignKey: 'voided_by_user_id' });
    InvoiceItem.hasMany(models.InvoiceReturnItem, { as: 'returnItems', foreignKey: 'invoice_item_id' });
  };

  // Check if item is voided
  InvoiceItem.prototype.isVoided = function() {
    return !!this.voided_at;
  };

  // Get returnable quantity (sold minus already returned)
  InvoiceItem.prototype.getReturnableQuantity = function() {
    return Math.max(0, this.quantity - (this.quantity_returned_total || 0));
  };

  // Check if item can be returned
  InvoiceItem.prototype.canReturn = function(quantityToReturn = 1) {
    return this.getReturnableQuantity() >= quantityToReturn;
  };

  // Calculate line totals with discount support
  InvoiceItem.prototype.calculateTotals = function() {
    const qty = this.quantity || 0;
    const unitPrice = parseFloat(this.unit_price_amount) || 0;
    const unitCost = parseFloat(this.unit_cost_amount) || 0;

    const rawTotal = Math.round(qty * unitPrice * 100) / 100;
    this.pre_discount_total = rawTotal;

    // Apply line-item discount
    const discountType = this.discount_type || 'none';
    const discountValue = parseFloat(this.discount_value) || 0;
    let discountAmt = 0;

    if (discountType === 'percentage' && discountValue > 0) {
      discountAmt = Math.round(rawTotal * (discountValue / 100) * 100) / 100;
    } else if (discountType === 'fixed' && discountValue > 0) {
      discountAmt = Math.min(discountValue, rawTotal);
    }

    this.discount_amount = Math.round(discountAmt * 100) / 100;
    this.line_total_amount = Math.round((rawTotal - this.discount_amount) * 100) / 100;
    this.line_cost_amount = Math.round(qty * unitCost * 100) / 100;
    this.line_profit_amount = Math.round((this.line_total_amount - this.line_cost_amount) * 100) / 100;
  };

  // Before save hook to calculate totals
  InvoiceItem.beforeSave((item, options) => {
    item.calculateTotals();
  });

  return InvoiceItem;
};
