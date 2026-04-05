/**
 * AssetUnit Model
 *
 * Individual serialized unit underneath a product (Asset).
 * Each unit has its own serial number, specs, condition, and optional price/cost overrides.
 */

module.exports = (sequelize, DataTypes) => {
  const AssetUnit = sequelize.define('AssetUnit', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    asset_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'assets',
        key: 'id'
      }
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    cpu: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    cpu_model: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    memory: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'RAM in MB (e.g. 16384 for 16GB)'
    },
    storage: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Storage in GB (e.g. 256)'
    },
    cost_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Unit-level cost override — falls back to product cost if null',
      get() {
        const val = this.getDataValue('cost_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    price_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Unit-level price override — falls back to product price if null',
      get() {
        const val = this.getDataValue('price_amount');
        return val === null ? null : parseFloat(val);
      }
    },
    cost_currency: {
      type: DataTypes.STRING(3),
      allowNull: true,
      defaultValue: null,
      comment: 'Unit-level cost currency override — falls back to product cost_currency if null'
    },
    price_currency: {
      type: DataTypes.STRING(3),
      allowNull: true,
      defaultValue: null,
      comment: 'Unit-level price currency override — falls back to product price_currency if null'
    },
    condition_status_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'condition_statuses',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('Available', 'Reserved', 'Sold', 'In Repair', 'Scrapped', 'Written Off', 'Returned to Supplier'),
      allowNull: false,
      defaultValue: 'Available'
    },
    purchase_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    purchase_exchange_rate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      comment: 'USD/GHS exchange rate at time of purchase',
      get() {
        const val = this.getDataValue('purchase_exchange_rate');
        return val === null ? null : parseFloat(val);
      }
    },
    sold_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    invoice_item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'invoice_items',
        key: 'id'
      },
      comment: 'Set when unit is sold via an invoice line item'
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'SalesBinder SKU/barcode — alternate lookup for stock take scanning'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Repair / Salvage workflow
    repair_state: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'regular',
      validate: {
        isIn: [['regular', 'under_repair', 'salvage_parts']]
      },
      comment: 'Operational repair state — does not block sales'
    },
    repair_notes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Array of { text, author, author_id, timestamp }'
    },
    repair_updated_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    repair_updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    },
    previous_condition_status_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'condition_statuses', key: 'id' },
      comment: 'Stored when entering repair/salvage so we can restore on return to regular'
    },
    // ── Phone Sourcing fields ──
    sourcing_batch_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'sourcing_batches', key: 'id' }
    },
    supplier_sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    supplier_grade: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    phone_color: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    color_tier: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    esim_only: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    battery_health_percent: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    imei: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    landed_cost_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('landed_cost_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    projected_sell_price_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('projected_sell_price_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    projected_margin_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('projected_margin_percent');
        return val === null ? null : parseFloat(val);
      }
    },
    actual_sell_price_ghs: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('actual_sell_price_ghs');
        return val === null ? null : parseFloat(val);
      }
    },
    actual_margin_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('actual_margin_percent');
        return val === null ? null : parseFloat(val);
      }
    },
    margin_variance_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('margin_variance_percent');
        return val === null ? null : parseFloat(val);
      }
    },
    buy_decision: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    days_to_sell: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    return_reason: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    times_returned: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    battery_flag: {
      type: DataTypes.STRING(30),
      allowNull: true
    }
  }, {
    tableName: 'asset_units',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['serial_number'],
        name: 'asset_units_serial_number_unique'
      },
      {
        fields: ['asset_id'],
        name: 'asset_units_asset_id'
      },
      {
        fields: ['status'],
        name: 'asset_units_status'
      },
      {
        fields: ['condition_status_id'],
        name: 'asset_units_condition_status_id'
      }
    ]
  });

  AssetUnit.associate = (models) => {
    AssetUnit.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'product' });
    AssetUnit.belongsTo(models.ConditionStatus, { foreignKey: 'condition_status_id', as: 'conditionStatus' });
    AssetUnit.belongsTo(models.InvoiceItem, { foreignKey: 'invoice_item_id', as: 'invoiceItem' });
    AssetUnit.belongsTo(models.User, { foreignKey: 'repair_updated_by', as: 'repairUpdater' });
    AssetUnit.belongsTo(models.SourcingBatch, { foreignKey: 'sourcing_batch_id', as: 'sourcingBatch' });
    AssetUnit.hasMany(models.WarrantyClaim, { foreignKey: 'asset_unit_id', as: 'warrantyClaims' });
  };

  // Auto-set battery_flag based on battery_health_percent
  AssetUnit.addHook('beforeSave', 'setBatteryFlag', (unit) => {
    const bh = unit.battery_health_percent;
    if (bh == null) {
      unit.battery_flag = null;
    } else if (bh >= 85) {
      unit.battery_flag = null;
    } else if (bh >= 80) {
      unit.battery_flag = 'LOW';
    } else {
      unit.battery_flag = 'SERVICE_WARNING';
    }
  });

  return AssetUnit;
};
