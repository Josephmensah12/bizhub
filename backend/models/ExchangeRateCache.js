module.exports = (sequelize, DataTypes) => {
  const ExchangeRateCache = sequelize.define('ExchangeRateCache', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    base_currency: {
      type: DataTypes.STRING(3),
      allowNull: false
    },
    quote_currency: {
      type: DataTypes.STRING(3),
      allowNull: false
    },
    rate_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Date for which this rate is valid'
    },
    rate: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'FX provider name (e.g., exchangerate-api, manual)'
    },
    is_manual_override: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    fetched_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'exchange_rate_cache',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['base_currency', 'quote_currency', 'rate_date'],
        name: 'idx_fx_cache_unique'
      }
    ]
  });

  return ExchangeRateCache;
};
