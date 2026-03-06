/**
 * StockTakeUnitNote Model
 *
 * Stores per-serial-number notes during stock take review.
 * Works for both scanned and unscanned units.
 */

module.exports = (sequelize, DataTypes) => {
  const StockTakeUnitNote = sequelize.define('StockTakeUnitNote', {
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
    asset_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'stock_take_unit_notes',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['stock_take_id', 'asset_unit_id'], name: 'stock_take_unit_notes_st_unit_unique' },
      { fields: ['stock_take_item_id'], name: 'stock_take_unit_notes_item' }
    ]
  });

  StockTakeUnitNote.associate = (models) => {
    StockTakeUnitNote.belongsTo(models.StockTake, { as: 'stockTake', foreignKey: 'stock_take_id' });
    StockTakeUnitNote.belongsTo(models.StockTakeItem, { as: 'stockTakeItem', foreignKey: 'stock_take_item_id' });
    StockTakeUnitNote.belongsTo(models.AssetUnit, { as: 'unit', foreignKey: 'asset_unit_id' });
    StockTakeUnitNote.belongsTo(models.User, { as: 'author', foreignKey: 'created_by' });
  };

  return StockTakeUnitNote;
};
