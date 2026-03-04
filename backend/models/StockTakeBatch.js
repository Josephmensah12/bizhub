/**
 * StockTakeBatch Model
 *
 * Groups serial number scans into batches of up to 20 within a stock take session.
 * Only one ACTIVE batch per session at a time; auto-closes at target_size.
 */

module.exports = (sequelize, DataTypes) => {
  const StockTakeBatch = sequelize.define('StockTakeBatch', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    stock_take_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    batch_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'closed'),
      allowNull: false,
      defaultValue: 'active'
    },
    target_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20
    },
    scanned_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'stock_take_batches',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  StockTakeBatch.associate = (models) => {
    StockTakeBatch.belongsTo(models.StockTake, { as: 'stockTake', foreignKey: 'stock_take_id' });
    StockTakeBatch.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    StockTakeBatch.hasMany(models.StockTakeScan, { as: 'scans', foreignKey: 'stock_take_batch_id' });
  };

  return StockTakeBatch;
};
