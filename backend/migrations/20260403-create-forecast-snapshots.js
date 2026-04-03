module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('forecast_snapshots', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      forecast_month: { type: Sequelize.STRING(7), allowNull: false, comment: 'YYYY-MM format' },
      generated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      ensemble_forecast: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      ci_low: { type: Sequelize.DECIMAL(14, 2) },
      ci_high: { type: Sequelize.DECIMAL(14, 2) },
      hw_forecast: { type: Sequelize.DECIMAL(14, 2) },
      sd_forecast: { type: Sequelize.DECIMAL(14, 2) },
      ma_forecast: { type: Sequelize.DECIMAL(14, 2) },
      category_forecast: { type: Sequelize.DECIMAL(14, 2) },
      seasonal_index: { type: Sequelize.DECIMAL(6, 3) },
      inventory_snapshot: { type: Sequelize.JSONB, comment: 'Available stock at time of forecast' },
      category_detail: { type: Sequelize.JSONB, comment: 'Per-category forecast breakdown' },
      recommendations: { type: Sequelize.JSONB },
      actual_revenue: { type: Sequelize.DECIMAL(14, 2), comment: 'Filled in after month ends' },
      actual_profit: { type: Sequelize.DECIMAL(14, 2), comment: 'Filled in after month ends' },
      accuracy_pct: { type: Sequelize.DECIMAL(6, 2), comment: '100 - abs(forecast-actual)/actual*100' },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
    });

    await queryInterface.addIndex('forecast_snapshots', ['forecast_month']);
    await queryInterface.addIndex('forecast_snapshots', ['generated_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('forecast_snapshots');
  }
};
