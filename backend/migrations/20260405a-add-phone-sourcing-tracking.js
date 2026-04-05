module.exports = {
  async up(queryInterface, Sequelize) {
    // Add new enum value for asset_units status
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_asset_units_status" ADD VALUE IF NOT EXISTS 'Returned to Supplier'`
    );

    // Create sourcing_batches table
    await queryInterface.createTable('sourcing_batches', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      batch_reference: { type: Sequelize.STRING(100), allowNull: false },
      supplier_name: { type: Sequelize.STRING(100), allowNull: false },
      supplier_type: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'wholesale' },
      order_date: { type: Sequelize.DATEONLY, allowNull: false },
      arrival_date: { type: Sequelize.DATEONLY, allowNull: true },
      total_units: { type: Sequelize.INTEGER, allowNull: false },
      total_cost_usd: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      shipping_cost_per_unit_usd: { type: Sequelize.DECIMAL(8, 2), allowNull: true },
      shipping_route: { type: Sequelize.STRING(100), allowNull: true },
      import_duty_rate: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
      fx_rate_at_purchase: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
      handling_per_unit_ghs: { type: Sequelize.DECIMAL(8, 2), allowNull: true },
      total_revenue_ghs: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      total_landed_cost_ghs: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      total_profit_ghs: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      actual_margin_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      projected_margin_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      fx_rate_at_arrival: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
      fx_impact_ghs: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ordered' },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });

    // Indexes on sourcing_batches
    await queryInterface.addIndex('sourcing_batches', ['supplier_name'], { name: 'sourcing_batches_supplier_name' });
    await queryInterface.addIndex('sourcing_batches', ['status'], { name: 'sourcing_batches_status' });
    await queryInterface.addIndex('sourcing_batches', ['order_date'], { name: 'sourcing_batches_order_date' });

    // Add sourcing columns to asset_units
    await queryInterface.addColumn('asset_units', 'sourcing_batch_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'sourcing_batches', key: 'id' }
    });
    await queryInterface.addColumn('asset_units', 'supplier_sku', {
      type: Sequelize.STRING(100), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'supplier_grade', {
      type: Sequelize.STRING(20), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'phone_color', {
      type: Sequelize.STRING(50), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'color_tier', {
      type: Sequelize.INTEGER, allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'esim_only', {
      type: Sequelize.BOOLEAN, defaultValue: false
    });
    await queryInterface.addColumn('asset_units', 'battery_health_percent', {
      type: Sequelize.INTEGER, allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'imei', {
      type: Sequelize.STRING(20), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'landed_cost_ghs', {
      type: Sequelize.DECIMAL(12, 2), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'projected_sell_price_ghs', {
      type: Sequelize.DECIMAL(12, 2), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'projected_margin_percent', {
      type: Sequelize.DECIMAL(5, 2), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'actual_sell_price_ghs', {
      type: Sequelize.DECIMAL(12, 2), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'actual_margin_percent', {
      type: Sequelize.DECIMAL(5, 2), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'margin_variance_percent', {
      type: Sequelize.DECIMAL(5, 2), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'buy_decision', {
      type: Sequelize.STRING(20), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'days_to_sell', {
      type: Sequelize.INTEGER, allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'return_reason', {
      type: Sequelize.STRING(100), allowNull: true
    });
    await queryInterface.addColumn('asset_units', 'times_returned', {
      type: Sequelize.INTEGER, defaultValue: 0
    });
    await queryInterface.addColumn('asset_units', 'battery_flag', {
      type: Sequelize.STRING(30), allowNull: true
    });

    // Indexes on asset_units sourcing columns
    await queryInterface.addIndex('asset_units', ['sourcing_batch_id'], { name: 'asset_units_sourcing_batch_id' });
    await queryInterface.addIndex('asset_units', ['supplier_sku'], { name: 'asset_units_supplier_sku' });
    await queryInterface.addIndex('asset_units', ['esim_only'], { name: 'asset_units_esim_only' });
    await queryInterface.addIndex('asset_units', ['buy_decision'], { name: 'asset_units_buy_decision' });
  },

  async down(queryInterface) {
    // Remove indexes from asset_units
    await queryInterface.removeIndex('asset_units', 'asset_units_buy_decision');
    await queryInterface.removeIndex('asset_units', 'asset_units_esim_only');
    await queryInterface.removeIndex('asset_units', 'asset_units_supplier_sku');
    await queryInterface.removeIndex('asset_units', 'asset_units_sourcing_batch_id');

    // Remove sourcing columns from asset_units
    await queryInterface.removeColumn('asset_units', 'battery_flag');
    await queryInterface.removeColumn('asset_units', 'times_returned');
    await queryInterface.removeColumn('asset_units', 'return_reason');
    await queryInterface.removeColumn('asset_units', 'days_to_sell');
    await queryInterface.removeColumn('asset_units', 'buy_decision');
    await queryInterface.removeColumn('asset_units', 'margin_variance_percent');
    await queryInterface.removeColumn('asset_units', 'actual_margin_percent');
    await queryInterface.removeColumn('asset_units', 'actual_sell_price_ghs');
    await queryInterface.removeColumn('asset_units', 'projected_margin_percent');
    await queryInterface.removeColumn('asset_units', 'projected_sell_price_ghs');
    await queryInterface.removeColumn('asset_units', 'landed_cost_ghs');
    await queryInterface.removeColumn('asset_units', 'imei');
    await queryInterface.removeColumn('asset_units', 'battery_health_percent');
    await queryInterface.removeColumn('asset_units', 'esim_only');
    await queryInterface.removeColumn('asset_units', 'color_tier');
    await queryInterface.removeColumn('asset_units', 'phone_color');
    await queryInterface.removeColumn('asset_units', 'supplier_grade');
    await queryInterface.removeColumn('asset_units', 'supplier_sku');
    await queryInterface.removeColumn('asset_units', 'sourcing_batch_id');

    // Drop sourcing_batches table
    await queryInterface.dropTable('sourcing_batches');
  }
};
