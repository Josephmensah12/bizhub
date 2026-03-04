/**
 * StockTakeItem Model
 *
 * Individual item line within a stock take session.
 */

const ITEM_STATUSES = ['pending', 'counted', 'verified', 'adjusted'];
const RESOLUTIONS = ['match', 'sold_not_invoiced', 'damaged', 'lost_stolen', 'found_extra', 'miscount', 'other'];
const COUNT_METHODS = ['serial', 'quantity'];

module.exports = (sequelize, DataTypes) => {
  const StockTakeItem = sequelize.define('StockTakeItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    stock_take_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    asset_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    count_method: {
      type: DataTypes.ENUM(...COUNT_METHODS),
      allowNull: false,
      defaultValue: 'quantity'
    },
    expected_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    counted_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    variance: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(...ITEM_STATUSES),
      allowNull: false,
      defaultValue: 'pending'
    },
    resolution: {
      type: DataTypes.ENUM(...RESOLUTIONS),
      allowNull: true
    },
    resolution_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    counted_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    counted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    serial_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'stock_take_items',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  StockTakeItem.associate = (models) => {
    StockTakeItem.belongsTo(models.StockTake, { as: 'stockTake', foreignKey: 'stock_take_id' });
    StockTakeItem.belongsTo(models.Asset, { as: 'asset', foreignKey: 'asset_id' });
    StockTakeItem.belongsTo(models.User, { as: 'counter', foreignKey: 'counted_by' });
    StockTakeItem.hasMany(models.StockTakeScan, { as: 'scans', foreignKey: 'stock_take_item_id' });
  };

  StockTakeItem.STATUSES = ITEM_STATUSES;
  StockTakeItem.RESOLUTIONS = RESOLUTIONS;
  StockTakeItem.COUNT_METHODS = COUNT_METHODS;

  return StockTakeItem;
};
