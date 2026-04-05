module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW view_sourcing_performance AS
      SELECT sb.id AS batch_id, sb.batch_reference, sb.supplier_name, sb.order_date,
        au.id AS unit_id, au.serial_number, a.make, a.model, au.storage,
        au.phone_color, au.supplier_grade, au.esim_only, au.battery_health_percent,
        au.cost_amount AS purchase_price_usd, au.landed_cost_ghs,
        au.projected_sell_price_ghs, au.projected_margin_percent,
        au.actual_sell_price_ghs, au.actual_margin_percent,
        au.margin_variance_percent, au.buy_decision, au.days_to_sell, au.status
      FROM asset_units au
      JOIN assets a ON au.asset_id = a.id
      LEFT JOIN sourcing_batches sb ON au.sourcing_batch_id = sb.id
      WHERE a.category = 'Smartphone'
      ORDER BY sb.order_date DESC, au.id
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW view_supplier_scorecard AS
      SELECT sb.supplier_name, COUNT(DISTINCT sb.id) AS total_batches,
        COUNT(au.id) AS total_units,
        COUNT(au.id) FILTER (WHERE au.status = 'Sold') AS units_sold,
        ROUND(AVG(au.projected_margin_percent), 1) AS avg_projected_margin,
        ROUND(AVG(au.actual_margin_percent) FILTER (WHERE au.actual_margin_percent IS NOT NULL), 1) AS avg_actual_margin,
        ROUND(AVG(au.margin_variance_percent) FILTER (WHERE au.margin_variance_percent IS NOT NULL), 1) AS avg_variance,
        ROUND(AVG(au.days_to_sell) FILTER (WHERE au.days_to_sell IS NOT NULL), 0) AS avg_days_to_sell,
        ROUND(AVG(au.battery_health_percent) FILTER (WHERE au.battery_health_percent IS NOT NULL), 0) AS avg_battery_health,
        COUNT(au.id) FILTER (WHERE au.battery_health_percent < 80) AS units_below_80_bh,
        SUM(au.actual_sell_price_ghs) FILTER (WHERE au.status = 'Sold') AS total_revenue_ghs,
        SUM(au.landed_cost_ghs) FILTER (WHERE au.status = 'Sold') AS total_cost_ghs,
        SUM(au.actual_sell_price_ghs - au.landed_cost_ghs) FILTER (WHERE au.status = 'Sold') AS total_profit_ghs
      FROM sourcing_batches sb
      JOIN asset_units au ON au.sourcing_batch_id = sb.id
      GROUP BY sb.supplier_name
      ORDER BY avg_actual_margin DESC NULLS LAST
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW view_model_profitability AS
      SELECT a.model, au.storage, COUNT(au.id) AS total_units,
        COUNT(au.id) FILTER (WHERE au.status = 'Sold') AS units_sold,
        ROUND(AVG(au.cost_amount), 2) AS avg_purchase_usd,
        ROUND(AVG(au.landed_cost_ghs), 0) AS avg_landed_ghs,
        ROUND(AVG(au.actual_sell_price_ghs) FILTER (WHERE au.status = 'Sold'), 0) AS avg_actual_sell_ghs,
        ROUND(AVG(au.actual_margin_percent) FILTER (WHERE au.status = 'Sold'), 1) AS avg_margin,
        ROUND(AVG(au.days_to_sell) FILTER (WHERE au.status = 'Sold'), 0) AS avg_days_to_sell,
        ROUND(AVG(au.battery_health_percent), 0) AS avg_bh
      FROM asset_units au JOIN assets a ON au.asset_id = a.id
      WHERE a.category = 'Smartphone'
      GROUP BY a.model, au.storage
      ORDER BY avg_margin DESC NULLS LAST
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW view_warranty_summary AS
      SELECT sb.supplier_name, COUNT(DISTINCT sb.id) AS total_batches,
        COUNT(DISTINCT wc.id) AS total_claims,
        COUNT(DISTINCT wc.id) FILTER (WHERE wc.status = 'refunded') AS claims_refunded,
        COUNT(DISTINCT wc.id) FILTER (WHERE wc.status = 'replaced') AS claims_replaced,
        COUNT(DISTINCT wc.id) FILTER (WHERE wc.status = 'denied') AS claims_denied,
        COUNT(DISTINCT wc.id) FILTER (WHERE wc.status IN ('open', 'submitted')) AS claims_pending,
        ROUND(SUM(wc.refund_amount_usd) FILTER (WHERE wc.status = 'refunded'), 2) AS total_refunds_usd,
        ROUND(SUM(wc.refund_amount_ghs) FILTER (WHERE wc.status = 'refunded'), 2) AS total_refunds_ghs,
        ROUND(COUNT(DISTINCT wc.id)::DECIMAL / NULLIF(COUNT(DISTINCT au.id), 0) * 100, 1) AS claim_rate_percent
      FROM sourcing_batches sb
      JOIN asset_units au ON au.sourcing_batch_id = sb.id
      LEFT JOIN warranty_claims wc ON wc.sourcing_batch_id = sb.id
      GROUP BY sb.supplier_name
      ORDER BY claim_rate_percent DESC NULLS LAST
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_warranty_summary');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_model_profitability');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_supplier_scorecard');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_sourcing_performance');
  }
};
