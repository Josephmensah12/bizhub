const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// ─── Holt-Winters Additive Smoothing ────────────────────────
function holtWinters(data, season = 12, alpha = 0.3, beta = 0.05, gamma = 0.3) {
  const n = data.length;
  if (n < season * 2) return null;

  let level = data.slice(0, season).reduce((s, v) => s + v, 0) / season;
  let trend = 0;
  for (let i = 0; i < season; i++) trend += (data[season + i] - data[i]);
  trend /= (season * season);

  const seasonal = [];
  const avg = data.slice(0, season).reduce((s, v) => s + v, 0) / season;
  for (let i = 0; i < season; i++) seasonal[i] = data[i] - avg;

  const fitted = [];
  for (let t = 0; t < n; t++) {
    const sIdx = t % season;
    if (t >= season) {
      const prevLevel = level;
      level = alpha * (data[t] - seasonal[sIdx]) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      seasonal[sIdx] = gamma * (data[t] - level) + (1 - gamma) * seasonal[sIdx];
    }
    fitted.push(level + trend + seasonal[sIdx]);
  }

  const forecastIdx = n % season;
  const forecast = level + trend + seasonal[forecastIdx];
  const residuals = data.map((v, i) => v - fitted[i]);
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

  return { forecast, rmse, level, trend, seasonalFactors: [...seasonal], fitted };
}

// ─── Seasonal Decomposition + Linear Trend ──────────────────
function seasonalDecomposition(data, season = 12) {
  const n = data.length;
  const monthSums = new Array(season).fill(0);
  const monthCounts = new Array(season).fill(0);
  const overallMean = data.reduce((s, v) => s + v, 0) / n;

  for (let i = 0; i < n; i++) {
    monthSums[i % season] += data[i];
    monthCounts[i % season]++;
  }
  const seasonalIdx = monthSums.map((sum, i) => (sum / monthCounts[i]) / overallMean);

  const deseason = data.map((v, i) => v / seasonalIdx[i % season]);
  const xMean = (n - 1) / 2;
  const yMean = deseason.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (deseason[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = num / den;
  const intercept = yMean - slope * xMean;

  const forecastIdx = n;
  const monthPos = forecastIdx % season;
  const trendValue = intercept + slope * forecastIdx;
  const forecast = trendValue * seasonalIdx[monthPos];

  const fitted = data.map((_, i) => (intercept + slope * i) * seasonalIdx[i % season]);
  const residuals = data.map((v, i) => v - fitted[i]);
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);

  return { forecast, rmse, slope, intercept, seasonalIdx, fitted };
}

// ─── Moving Average Forecast ────────────────────────────────
function movingAverage(data, window = 3) {
  const recent = data.slice(-window);
  const forecast = recent.reduce((s, v) => s + v, 0) / window;
  return { forecast, window };
}

/**
 * GET /api/v1/reports/forecast
 */
exports.forecast = asyncHandler(async (req, res) => {
  // 1. Monthly revenue — use the mature period (last 27+ months)
  const monthlyRaw = await sequelize.query(`
    SELECT DATE_TRUNC('month', invoice_date)::date as month,
           COUNT(*) as invoices,
           COALESCE(SUM(total_amount), 0) as revenue,
           COALESCE(SUM(total_cost_amount), 0) as cogs,
           COALESCE(SUM(total_profit_amount), 0) as profit
    FROM invoices
    WHERE status IN ('PAID', 'PARTIALLY_PAID') AND is_deleted = false
      AND invoice_date >= '2024-01-01'
    GROUP BY DATE_TRUNC('month', invoice_date)
    ORDER BY month ASC
  `, { type: QueryTypes.SELECT });

  // Exclude current month if it has < 7 days of data
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = now.getDate();
  const monthly = dayOfMonth < 7
    ? monthlyRaw.filter(m => new Date(m.month) < currentMonthStart)
    : monthlyRaw;

  const revenues = monthly.map(m => parseFloat(m.revenue));
  const profits = monthly.map(m => parseFloat(m.profit));
  const months = monthly.map(m => m.month);

  // Next month to forecast
  const lastMonth = new Date(months[months.length - 1]);
  const forecastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1);
  const forecastLabel = forecastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // 2. Run models
  const hw = holtWinters(revenues, 12);
  const sd = seasonalDecomposition(revenues, 12);
  const ma = movingAverage(revenues, 3);

  // 3. Category sales (last 12 months)
  const categorySales = await sequelize.query(`
    SELECT COALESCE(a.asset_type, ii.asset_type, 'Other') as asset_type,
           DATE_TRUNC('month', i.invoice_date)::date as month,
           SUM(ii.quantity) as units,
           COALESCE(SUM(ii.line_total_amount), 0) as revenue,
           ROUND(AVG(ii.unit_price_amount)::numeric, 2) as avg_price
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN assets a ON ii.asset_id = a.id
    WHERE i.status IN ('PAID', 'PARTIALLY_PAID') AND i.is_deleted = false
      AND ii.voided_at IS NULL AND i.invoice_date >= (NOW() - INTERVAL '12 months')
      AND LOWER(COALESCE(ii.description, '')) != 'discount' AND COALESCE(ii.category, '') != '_discount'
    GROUP BY COALESCE(a.asset_type, ii.asset_type, 'Other'), DATE_TRUNC('month', i.invoice_date)
    ORDER BY asset_type, month
  `, { type: QueryTypes.SELECT });

  // Aggregate category stats
  const catMap = {};
  for (const row of categorySales) {
    const t = row.asset_type;
    if (!catMap[t]) catMap[t] = { units: [], revenues: [], avgPrices: [] };
    catMap[t].units.push(parseInt(row.units));
    catMap[t].revenues.push(parseFloat(row.revenue));
    catMap[t].avgPrices.push(parseFloat(row.avg_price));
  }

  // 4. Current inventory
  const inventoryRaw = await sequelize.query(`
    SELECT a.asset_type,
           COUNT(*) as products,
           SUM(a.quantity) as total_qty,
           SUM(CASE WHEN a.is_serialized THEN
             (SELECT COUNT(*) FROM asset_units au WHERE au.asset_id = a.id AND au.status = 'Available')
           ELSE a.quantity END) as available,
           ROUND(AVG(a.price_amount)::numeric, 2) as avg_price,
           SUM(a.quantity * a.price_amount) as retail_value
    FROM assets a
    GROUP BY a.asset_type
    ORDER BY available DESC
  `, { type: QueryTypes.SELECT });

  const inventory = {};
  let totalRetailValue = 0;
  for (const inv of inventoryRaw) {
    inventory[inv.asset_type] = {
      available: parseInt(inv.available) || 0,
      avgPrice: parseFloat(inv.avg_price) || 0,
      retailValue: parseFloat(inv.retail_value) || 0,
    };
    totalRetailValue += parseFloat(inv.retail_value) || 0;
  }

  // 5. Category-level forecast
  const categoryForecasts = [];
  let categoryTotal = 0;
  for (const [type, stats] of Object.entries(catMap)) {
    const avgUnits = stats.units.length > 0
      ? Math.round(stats.units.reduce((s, v) => s + v, 0) / stats.units.length)
      : 0;
    const avgRevenue = stats.revenues.length > 0
      ? Math.round(stats.revenues.reduce((s, v) => s + v, 0) / stats.revenues.length)
      : 0;
    const avgPrice = stats.avgPrices.length > 0
      ? Math.round(stats.avgPrices.reduce((s, v) => s + v, 0) / stats.avgPrices.length)
      : 0;

    const inv = inventory[type];
    const available = inv ? inv.available : 0;
    const constrainedUnits = available > 0 ? Math.min(avgUnits, available) : avgUnits;
    const forecastRevenue = available > 0 ? constrainedUnits * (inv.avgPrice || avgPrice) : avgRevenue;
    const stockConstraint = available > 0 && avgUnits > available;

    categoryForecasts.push({
      asset_type: type,
      avg_monthly_units: avgUnits,
      avg_monthly_revenue: avgRevenue,
      available_stock: available,
      forecast_units: constrainedUnits,
      forecast_revenue: Math.round(forecastRevenue),
      stock_constrained: stockConstraint,
      avg_price: inv ? inv.avgPrice : avgPrice,
      months_of_data: stats.units.length
    });
    categoryTotal += forecastRevenue;
  }
  categoryForecasts.sort((a, b) => b.forecast_revenue - a.forecast_revenue);

  // 6. Ensemble
  const weights = { hw: 0.35, sd: 0.35, cat: 0.30 };
  const ensemble = (hw ? hw.forecast * weights.hw : sd.forecast * 0.55)
    + sd.forecast * weights.sd
    + categoryTotal * weights.cat;
  const blendedRmse = hw
    ? Math.sqrt(weights.hw * hw.rmse ** 2 + weights.sd * sd.rmse ** 2)
    : sd.rmse;

  // 7. Seasonality insight
  const forecastMonthIdx = forecastMonth.getMonth(); // 0-indexed
  const seasonalIndex = sd.seasonalIdx[forecastMonthIdx];

  // 8. Historical same-month data
  const sameMonthHistory = await sequelize.query(`
    SELECT EXTRACT(YEAR FROM invoice_date)::int as year,
           COUNT(*) as invoices,
           COALESCE(SUM(total_amount), 0) as revenue,
           COALESCE(SUM(total_profit_amount), 0) as profit
    FROM invoices
    WHERE EXTRACT(MONTH FROM invoice_date) = :month
      AND status IN ('PAID', 'PARTIALLY_PAID') AND is_deleted = false
    GROUP BY EXTRACT(YEAR FROM invoice_date)
    ORDER BY year
  `, { replacements: { month: forecastMonth.getMonth() + 1 }, type: QueryTypes.SELECT });

  // 9. Monthly expenses (for net income forecast)
  const [expenseAvg] = await sequelize.query(`
    SELECT ROUND(AVG(monthly_total)::numeric, 2) as avg_monthly_expense
    FROM (
      SELECT DATE_TRUNC('month', expense_date) as month, SUM(amount_local) as monthly_total
      FROM expenses WHERE expense_date >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', expense_date)
    ) sub
  `, { type: QueryTypes.SELECT });
  const avgMonthlyExpense = parseFloat(expenseAvg?.avg_monthly_expense) || 0;

  // 10. Trend data for chart
  const trendData = monthly.map((m, i) => ({
    month: m.month,
    actual: parseFloat(m.revenue),
    hw_fitted: hw ? Math.round(hw.fitted[i]) : null,
    sd_fitted: Math.round(sd.fitted[i]),
  }));
  // Add forecast point
  trendData.push({
    month: forecastMonth.toISOString().slice(0, 10),
    actual: null,
    hw_fitted: hw ? Math.round(hw.forecast) : null,
    sd_fitted: Math.round(sd.forecast),
    ensemble: Math.round(ensemble),
    is_forecast: true,
  });

  // 11. Recommendations engine
  const recommendations = [];

  // Stock-out risk
  const outOfStock = categoryForecasts.filter(c => c.avg_monthly_units > 0 && c.available_stock === 0);
  if (outOfStock.length > 0) {
    const missed = outOfStock.reduce((s, c) => s + c.avg_monthly_revenue, 0);
    recommendations.push({
      type: 'restock',
      priority: 'high',
      title: `Restock ${outOfStock.map(c => c.asset_type).join(', ')}`,
      detail: `These categories averaged GHS ${Math.round(missed).toLocaleString()}/month but have zero inventory. Restocking could add GHS ${Math.round(missed * 0.7).toLocaleString()} – ${Math.round(missed).toLocaleString()} to next month's revenue.`,
      impact: missed,
    });
  }

  // Low stock warning
  const lowStock = categoryForecasts.filter(c => c.stock_constrained && c.available_stock > 0);
  for (const c of lowStock) {
    recommendations.push({
      type: 'restock',
      priority: 'medium',
      title: `${c.asset_type} stock running low`,
      detail: `${c.available_stock} units available but avg monthly demand is ${c.avg_monthly_units}. May sell out before month end.`,
      impact: (c.avg_monthly_units - c.available_stock) * c.avg_price,
    });
  }

  // Seasonal opportunity
  if (seasonalIndex > 1.1) {
    recommendations.push({
      type: 'seasonal',
      priority: 'medium',
      title: `${forecastLabel} is historically ${Math.round((seasonalIndex - 1) * 100)}% above average`,
      detail: `Seasonal demand is higher this month. Ensure adequate stock and staffing to capture the upside.`,
      impact: ensemble * (seasonalIndex - 1),
    });
  }

  // Margin improvement
  const avgMargin = profits.reduce((s, v) => s + v, 0) / revenues.reduce((s, v) => s + v, 0) * 100;
  if (avgMargin < 25) {
    recommendations.push({
      type: 'margin',
      priority: 'medium',
      title: `Average margin is ${avgMargin.toFixed(1)}% — room to improve`,
      detail: `Review pricing on high-volume categories. A 5% margin improvement on forecast revenue would add GHS ${Math.round(ensemble * 0.05).toLocaleString()} to profit.`,
      impact: ensemble * 0.05,
    });
  }

  // Declining trend
  if (sd.slope < 0) {
    recommendations.push({
      type: 'trend',
      priority: 'low',
      title: 'Revenue trend is declining',
      detail: `Monthly revenue is declining by approximately GHS ${Math.round(Math.abs(sd.slope)).toLocaleString()}/month. Consider new product lines, marketing, or expanding into new customer segments.`,
      impact: Math.abs(sd.slope) * 6,
    });
  }

  // Expense control
  const forecastProfit = ensemble - (ensemble * (1 - avgMargin / 100)) - avgMonthlyExpense;
  if (avgMonthlyExpense > ensemble * 0.15) {
    recommendations.push({
      type: 'expense',
      priority: 'medium',
      title: 'Operating expenses are high relative to revenue',
      detail: `Average monthly expenses of GHS ${Math.round(avgMonthlyExpense).toLocaleString()} represent ${(avgMonthlyExpense / ensemble * 100).toFixed(1)}% of forecast revenue. Review fixed costs for savings.`,
      impact: avgMonthlyExpense * 0.1,
    });
  }

  recommendations.sort((a, b) => b.impact - a.impact);

  res.json({
    success: true,
    data: {
      forecast_month: forecastLabel,
      models: {
        holt_winters: hw ? {
          forecast: Math.round(hw.forecast),
          rmse: Math.round(hw.rmse),
          ci_low: Math.round(hw.forecast - 1.96 * hw.rmse),
          ci_high: Math.round(hw.forecast + 1.96 * hw.rmse),
          trend_per_month: Math.round(hw.trend),
          seasonal_factor: Math.round(hw.seasonalFactors[forecastMonthIdx]),
        } : null,
        seasonal_decomposition: {
          forecast: Math.round(sd.forecast),
          rmse: Math.round(sd.rmse),
          ci_low: Math.round(sd.forecast - 1.96 * sd.rmse),
          ci_high: Math.round(sd.forecast + 1.96 * sd.rmse),
          trend_slope: Math.round(sd.slope),
          seasonal_index: parseFloat(seasonalIndex.toFixed(3)),
        },
        moving_average: {
          forecast: Math.round(ma.forecast),
          window: ma.window,
        },
        category_buildup: {
          forecast: Math.round(categoryTotal),
          categories: categoryForecasts,
        },
      },
      ensemble: {
        forecast: Math.round(ensemble),
        ci_low: Math.round(ensemble - 1.96 * blendedRmse),
        ci_high: Math.round(ensemble + 1.96 * blendedRmse),
        rmse: Math.round(blendedRmse),
        weights,
      },
      context: {
        seasonal_index: parseFloat(seasonalIndex.toFixed(3)),
        avg_monthly_expense: Math.round(avgMonthlyExpense),
        forecast_net_income: Math.round(ensemble * (avgMargin / 100) - avgMonthlyExpense),
        avg_margin_pct: parseFloat(avgMargin.toFixed(1)),
        total_retail_value: Math.round(totalRetailValue),
        inventory: inventoryRaw.map(i => ({
          asset_type: i.asset_type,
          available: parseInt(i.available) || 0,
          avg_price: parseFloat(i.avg_price) || 0,
          retail_value: parseFloat(i.retail_value) || 0,
        })),
      },
      same_month_history: sameMonthHistory.map(h => ({
        year: h.year,
        invoices: parseInt(h.invoices),
        revenue: parseFloat(h.revenue),
        profit: parseFloat(h.profit),
      })),
      trend_chart: trendData,
      recommendations,
    }
  });
});

/**
 * GET /api/v1/reports/forecast/history
 * Returns all forecast snapshots with accuracy data
 */
exports.snapshotHistory = asyncHandler(async (req, res) => {
  const snapshots = await sequelize.query(`
    SELECT id, forecast_month, generated_at,
           ensemble_forecast, ci_low, ci_high,
           hw_forecast, sd_forecast, ma_forecast, category_forecast,
           seasonal_index, actual_revenue, actual_profit, accuracy_pct,
           inventory_snapshot, category_detail, recommendations
    FROM forecast_snapshots
    ORDER BY generated_at DESC
    LIMIT 100
  `, { type: QueryTypes.SELECT });

  // Group by forecast_month, pick latest per month for accuracy chart
  const byMonth = {};
  for (const s of snapshots) {
    if (!byMonth[s.forecast_month]) byMonth[s.forecast_month] = s;
  }
  const accuracyChart = Object.values(byMonth)
    .filter(s => s.actual_revenue != null)
    .sort((a, b) => a.forecast_month.localeCompare(b.forecast_month))
    .map(s => ({
      month: s.forecast_month,
      forecast: parseFloat(s.ensemble_forecast),
      actual: parseFloat(s.actual_revenue),
      accuracy: parseFloat(s.accuracy_pct),
      hw: parseFloat(s.hw_forecast),
      sd: parseFloat(s.sd_forecast),
    }));

  res.json({
    success: true,
    data: {
      snapshots: snapshots.map(s => ({
        ...s,
        ensemble_forecast: parseFloat(s.ensemble_forecast),
        ci_low: parseFloat(s.ci_low),
        ci_high: parseFloat(s.ci_high),
        hw_forecast: s.hw_forecast ? parseFloat(s.hw_forecast) : null,
        sd_forecast: parseFloat(s.sd_forecast),
        ma_forecast: parseFloat(s.ma_forecast),
        category_forecast: parseFloat(s.category_forecast),
        actual_revenue: s.actual_revenue ? parseFloat(s.actual_revenue) : null,
        actual_profit: s.actual_profit ? parseFloat(s.actual_profit) : null,
        accuracy_pct: s.accuracy_pct ? parseFloat(s.accuracy_pct) : null,
      })),
      accuracy_chart: accuracyChart,
    }
  });
});

/**
 * POST /api/v1/reports/forecast/snapshot
 * Manually trigger a forecast snapshot
 */
exports.triggerSnapshot = asyncHandler(async (req, res) => {
  const { saveForecastSnapshot, backfillActuals } = require('../services/forecastScheduler');
  await saveForecastSnapshot();
  await backfillActuals();
  res.json({ success: true, message: 'Forecast snapshot generated and actuals backfilled' });
});
