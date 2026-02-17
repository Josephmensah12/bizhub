/**
 * ConditionStatus Model
 *
 * Configurable asset conditions with valuation rules.
 */

const VALUATION_RULES = ['selling_price', 'cost_price', 'percentage_of_cost', 'fixed_amount', 'zero'];

module.exports = (sequelize, DataTypes) => {
  const ConditionStatus = sequelize.define('ConditionStatus', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    valuation_rule: {
      type: DataTypes.ENUM(...VALUATION_RULES),
      allowNull: false,
      defaultValue: 'selling_price'
    },
    valuation_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('valuation_value');
        return val === null ? null : parseFloat(val);
      }
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: false,
      defaultValue: '#6b7280'
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'condition_statuses',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  ConditionStatus.associate = (models) => {
    ConditionStatus.hasMany(models.Asset, { foreignKey: 'condition_status_id', as: 'assets' });
  };

  ConditionStatus.VALUATION_RULES = VALUATION_RULES;

  return ConditionStatus;
};
