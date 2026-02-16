/**
 * StockTake Model
 *
 * A stock take session for physical inventory counting and reconciliation.
 */

const STATUSES = ['draft', 'in_progress', 'under_review', 'finalized', 'cancelled'];
const SCOPES = ['full', 'category', 'location'];

module.exports = (sequelize, DataTypes) => {
  const StockTake = sequelize.define('StockTake', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    reference: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(...STATUSES),
      allowNull: false,
      defaultValue: 'draft'
    },
    scope: {
      type: DataTypes.ENUM(...SCOPES),
      allowNull: false,
      defaultValue: 'full'
    },
    scope_filter: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    blind_count: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    finalized_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    finalized_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    summary: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'stock_takes',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['reference'] }
    ]
  });

  StockTake.associate = (models) => {
    StockTake.belongsTo(models.User, { as: 'creator', foreignKey: 'created_by' });
    StockTake.belongsTo(models.User, { as: 'finalizer', foreignKey: 'finalized_by' });
    StockTake.hasMany(models.StockTakeItem, { as: 'items', foreignKey: 'stock_take_id' });
  };

  StockTake.STATUSES = STATUSES;
  StockTake.SCOPES = SCOPES;

  /**
   * Generate the next stock take reference: ST-000001, ST-000002, ...
   */
  StockTake.generateReference = async function () {
    const latest = await StockTake.findOne({
      order: [['id', 'DESC']],
      attributes: ['reference']
    });
    let nextNum = 1;
    if (latest && latest.reference) {
      const parts = latest.reference.split('-');
      const num = parseInt(parts[parts.length - 1]);
      if (!isNaN(num)) nextNum = num + 1;
    }
    return `ST-${String(nextNum).padStart(6, '0')}`;
  };

  return StockTake;
};
