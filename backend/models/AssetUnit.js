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
    condition_status_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'condition_statuses',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('Available', 'Reserved', 'Sold', 'In Repair', 'Scrapped'),
      allowNull: false,
      defaultValue: 'Available'
    },
    purchase_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
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
    notes: {
      type: DataTypes.TEXT,
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
  };

  return AssetUnit;
};
