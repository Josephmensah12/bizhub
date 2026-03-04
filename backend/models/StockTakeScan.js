/**
 * StockTakeScan Model
 *
 * Records an individual serial number scan during a stock take session.
 * Links to StockTakeItem (the product-level row) and optionally to AssetUnit.
 */

module.exports = (sequelize, DataTypes) => {
  const StockTakeScan = sequelize.define('StockTakeScan', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    stock_take_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    stock_take_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    asset_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    asset_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    scanned_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    stock_take_batch_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    scanned_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'stock_take_scans',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['stock_take_id', 'serial_number'], name: 'stock_take_scans_session_serial_unique' },
      { fields: ['stock_take_id', 'stock_take_item_id'], name: 'stock_take_scans_session_item' },
      { fields: ['serial_number'], name: 'stock_take_scans_serial' }
    ]
  });

  StockTakeScan.associate = (models) => {
    StockTakeScan.belongsTo(models.StockTake, { as: 'stockTake', foreignKey: 'stock_take_id' });
    StockTakeScan.belongsTo(models.StockTakeItem, { as: 'stockTakeItem', foreignKey: 'stock_take_item_id' });
    StockTakeScan.belongsTo(models.Asset, { as: 'asset', foreignKey: 'asset_id' });
    StockTakeScan.belongsTo(models.AssetUnit, { as: 'unit', foreignKey: 'asset_unit_id' });
    StockTakeScan.belongsTo(models.User, { as: 'scanner', foreignKey: 'scanned_by' });
    StockTakeScan.belongsTo(models.StockTakeBatch, { as: 'batch', foreignKey: 'stock_take_batch_id' });
  };

  return StockTakeScan;
};
