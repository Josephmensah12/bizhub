const cron = require('node-cron');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// Re-use the forecast logic from the controller
const forecastController = require('../controllers/forecastController');

/**
 * Save a forecast snapshot to the database
 */
async function saveForecastSnapshot() {
  console.log('[ForecastScheduler] Generating weekly forecast snapshot...');

  try {
    // Call the forecast logic by simulating a request
    const result = await new Promise((resolve, reject) => {
      const fakeReq = { query: {} };
      const fakeRes = {
        json: (data) => resolve(data),
        status: () => fakeRes,
      };
      forecastController.forecast(fakeReq, fakeRes, (err) => reject(err));
    });

    if (!result?.success || !result?.data) {
      console.error('[ForecastScheduler] Forecast returned no data');
      return;
    }

    const d = result.data;
    const forecastMonth = d.forecast_month; // e.g. "April 2026"
    // Convert to YYYY-MM
    const parsed = new Date(Date.parse(forecastMonth + ' 1'));
    const monthKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;

    await sequelize.query(`
      INSERT INTO forecast_snapshots (
        forecast_month, generated_at, ensemble_forecast, ci_low, ci_high,
        hw_forecast, sd_forecast, ma_forecast, category_forecast,
        seasonal_index, inventory_snapshot, category_detail, recommendations,
        created_at, updated_at
      ) VALUES (
        :forecast_month, NOW(), :ensemble, :ci_low, :ci_high,
        :hw, :sd, :ma, :cat,
        :seasonal, :inventory, :category_detail, :recommendations,
        NOW(), NOW()
      )
    `, {
      replacements: {
        forecast_month: monthKey,
        ensemble: d.ensemble.forecast,
        ci_low: d.ensemble.ci_low,
        ci_high: d.ensemble.ci_high,
        hw: d.models.holt_winters?.forecast || null,
        sd: d.models.seasonal_decomposition.forecast,
        ma: d.models.moving_average.forecast,
        cat: d.models.category_buildup.forecast,
        seasonal: d.context.seasonal_index,
        inventory: JSON.stringify(d.context.inventory),
        category_detail: JSON.stringify(d.models.category_buildup.categories),
        recommendations: JSON.stringify(d.recommendations),
      },
      type: QueryTypes.INSERT,
    });

    console.log(`[ForecastScheduler] Snapshot saved for ${monthKey}: GHS ${d.ensemble.forecast.toLocaleString()}`);
  } catch (err) {
    console.error('[ForecastScheduler] Error:', err.message);
  }
}

/**
 * Backfill actual revenue for past forecast months
 */
async function backfillActuals() {
  console.log('[ForecastScheduler] Backfilling actuals for past forecasts...');

  try {
    // Find snapshots without actual_revenue where the month has ended
    const pending = await sequelize.query(`
      SELECT DISTINCT forecast_month FROM forecast_snapshots
      WHERE actual_revenue IS NULL
        AND forecast_month < TO_CHAR(NOW(), 'YYYY-MM')
    `, { type: QueryTypes.SELECT });

    for (const row of pending) {
      const [year, month] = row.forecast_month.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const [actual] = await sequelize.query(`
        SELECT COALESCE(SUM(total_amount), 0) as revenue,
               COALESCE(SUM(total_profit_amount), 0) as profit
        FROM invoices
        WHERE invoice_date BETWEEN :startDate AND :endDate
          AND status IN ('PAID', 'PARTIALLY_PAID') AND is_deleted = false
      `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

      const revenue = parseFloat(actual.revenue) || 0;
      const profit = parseFloat(actual.profit) || 0;

      // Update all snapshots for that month
      await sequelize.query(`
        UPDATE forecast_snapshots
        SET actual_revenue = :revenue,
            actual_profit = :profit,
            accuracy_pct = CASE WHEN :revenue > 0
              THEN ROUND((1 - ABS(ensemble_forecast - :revenue) / :revenue) * 100, 2)
              ELSE NULL END,
            updated_at = NOW()
        WHERE forecast_month = :month AND actual_revenue IS NULL
      `, { replacements: { revenue, profit, month: row.forecast_month }, type: QueryTypes.UPDATE });

      console.log(`[ForecastScheduler] Backfilled ${row.forecast_month}: actual GHS ${revenue.toLocaleString()}`);
    }
  } catch (err) {
    console.error('[ForecastScheduler] Backfill error:', err.message);
  }
}

/**
 * Start the weekly cron schedule
 * Runs every Monday at 6:00 AM UTC
 */
function startScheduler() {
  // Weekly forecast snapshot — Monday 6 AM
  cron.schedule('0 6 * * 1', async () => {
    await saveForecastSnapshot();
    await backfillActuals();
  });

  // Also backfill on the 2nd of each month (catch month-end actuals)
  cron.schedule('0 7 2 * *', async () => {
    await backfillActuals();
  });

  console.log('[ForecastScheduler] Scheduled: weekly snapshots (Mon 6AM), monthly backfill (2nd 7AM)');
}

module.exports = { startScheduler, saveForecastSnapshot, backfillActuals };
