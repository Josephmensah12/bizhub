module.exports = (sequelize, DataTypes) => {
  const ForecastSnapshot = sequelize.define('ForecastSnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    forecast_month: { type: DataTypes.STRING(7), allowNull: false },
    generated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ensemble_forecast: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    ci_low: DataTypes.DECIMAL(14, 2),
    ci_high: DataTypes.DECIMAL(14, 2),
    hw_forecast: DataTypes.DECIMAL(14, 2),
    sd_forecast: DataTypes.DECIMAL(14, 2),
    ma_forecast: DataTypes.DECIMAL(14, 2),
    category_forecast: DataTypes.DECIMAL(14, 2),
    seasonal_index: DataTypes.DECIMAL(6, 3),
    inventory_snapshot: DataTypes.JSONB,
    category_detail: DataTypes.JSONB,
    recommendations: DataTypes.JSONB,
    actual_revenue: DataTypes.DECIMAL(14, 2),
    actual_profit: DataTypes.DECIMAL(14, 2),
    accuracy_pct: DataTypes.DECIMAL(6, 2),
  }, {
    tableName: 'forecast_snapshots',
    underscored: true,
  });

  return ForecastSnapshot;
};
