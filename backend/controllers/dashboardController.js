const db = require('../models');
const { Asset, Invoice } = db;
const sequelize = db.sequelize;
const { Op } = require('sequelize');
const { canSeeCost } = require('../middleware/permissions');
const { getHistoricalFxRate, getExchangeRate } = require('../services/exchangeRateService');

// Async handler wrapper
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/dashboard/metrics
 * Get dashboard metrics
 */
exports.getMetrics = asyncHandler(async (req, res) => {
  // Get inventory metrics
  const totalAssets = await Asset.count();
  const inStockAssets = await Asset.count({ where: { status: 'In Stock' } });
  const reservedAssets = await Asset.count({ where: { status: { [Op.in]: ['Processing', 'Reserved'] } } });
  const soldAssets = await Asset.count({ where: { status: 'Sold' } });
  const inRepairAssets = await Asset.count({ where: { status: 'In Repair' } });

  // Get asset type breakdown
  const assetsByType = await Asset.findAll({
    attributes: [
      'asset_type',
      [Asset.sequelize.fn('COUNT', Asset.sequelize.col('id')), 'count']
    ],
    group: ['asset_type'],
    raw: true
  });

  // Calculate total inventory value
  const inventoryValue = await Asset.sum('price_amount', {
    where: {
      status: { [Op.in]: ['In Stock', 'Processing', 'Reserved'] }
    }
  }) || 0;

  // Aging stock: <1 year, 1-2 years, >2 years (using purchase_date with created_at fallback)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const ageDateExpr = sequelize.literal("COALESCE(purchase_date, created_at)");

  const agingUnder1y = (await Asset.sum('quantity', {
    where: { status: 'In Stock', [Op.and]: sequelize.where(ageDateExpr, { [Op.gte]: oneYearAgo }) }
  })) || 0;
  const aging1to2y = (await Asset.sum('quantity', {
    where: {
      status: 'In Stock',
      [Op.and]: [
        sequelize.where(ageDateExpr, { [Op.gte]: twoYearsAgo }),
        sequelize.where(ageDateExpr, { [Op.lt]: oneYearAgo })
      ]
    }
  })) || 0;
  const agingOver2y = (await Asset.sum('quantity', {
    where: { status: 'In Stock', [Op.and]: sequelize.where(ageDateExpr, { [Op.lt]: twoYearsAgo }) }
  })) || 0;

  // --- Sales metrics (today) ---
  const role = req.user?.role;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const invoiceWhere = {
    status: { [Op.ne]: 'CANCELLED' },
    is_deleted: false,
    invoice_date: { [Op.gte]: todayStart }
  };
  if (role === 'Sales') {
    invoiceWhere.created_by = req.user.id;
  }

  const todayInvoices = await Invoice.findAll({
    where: invoiceWhere,
    attributes: ['total_amount', 'amount_paid', 'invoice_date'],
    raw: true
  });

  const todayTotalAmount = todayInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total_amount) || 0), 0);
  const todayCollected = todayInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount_paid) || 0), 0);

  // --- MTD sales ---
  const now = new Date();
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const dayOfMonth = now.getDate();
  const prevMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth);
  const mtdEnd = new Date(now.getFullYear(), now.getMonth(), dayOfMonth + 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth + 1);

  const mtdSalesWhere = {
    status: { [Op.ne]: 'CANCELLED' },
    is_deleted: false,
    invoice_date: { [Op.gte]: mtdStart, [Op.lt]: mtdEnd }
  };
  const prevMtdSalesWhere = {
    status: { [Op.ne]: 'CANCELLED' },
    is_deleted: false,
    invoice_date: { [Op.gte]: prevMonthStart, [Op.lt]: prevEnd }
  };
  if (role === 'Sales') {
    mtdSalesWhere.created_by = req.user.id;
    prevMtdSalesWhere.created_by = req.user.id;
  }

  const [mtdInvoices, prevMtdInvoices] = await Promise.all([
    Invoice.findAll({ where: mtdSalesWhere, attributes: ['total_amount', 'invoice_date'], raw: true }),
    Invoice.findAll({ where: prevMtdSalesWhere, attributes: ['total_amount', 'invoice_date'], raw: true })
  ]);

  const mtdTotal = mtdInvoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
  const prevMtdTotal = prevMtdInvoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
  const mtdPctChange = prevMtdTotal > 0
    ? ((mtdTotal - prevMtdTotal) / prevMtdTotal) * 100
    : (mtdTotal > 0 ? 100 : 0);

  // --- YoY (Year-over-Year) same period comparison ---
  const yoyStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const yoyEnd = new Date(now.getFullYear() - 1, now.getMonth(), dayOfMonth + 1);

  const yoySalesWhere = {
    status: { [Op.ne]: 'CANCELLED' },
    is_deleted: false,
    invoice_date: { [Op.gte]: yoyStart, [Op.lt]: yoyEnd }
  };
  if (role === 'Sales') {
    yoySalesWhere.created_by = req.user.id;
  }

  const yoyInvoices = await Invoice.findAll({ where: yoySalesWhere, attributes: ['total_amount', 'invoice_date'], raw: true });
  const yoyTotal = yoyInvoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
  const yoyPctChange = yoyTotal > 0
    ? ((mtdTotal - yoyTotal) / yoyTotal) * 100
    : (mtdTotal > 0 ? 100 : 0);

  // --- Compute USD totals using per-invoice historical FX rates ---
  async function sumInUsd(invoices) {
    let total = 0;
    for (const inv of invoices) {
      const amt = parseFloat(inv.total_amount) || 0;
      if (amt === 0) continue;
      const dateStr = inv.invoice_date ? new Date(inv.invoice_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const rate = await getHistoricalFxRate(dateStr, 'USD', 'GHS');
      total += rate ? amt / rate : 0;
    }
    return total;
  }

  const [todayUsd, todayCollectedUsd, mtdUsd, prevMtdUsd, yoyUsd] = await Promise.all([
    sumInUsd(todayInvoices),
    (async () => {
      let total = 0;
      for (const inv of todayInvoices) {
        const amt = parseFloat(inv.amount_paid) || 0;
        if (amt === 0) continue;
        const dateStr = inv.invoice_date ? new Date(inv.invoice_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const rate = await getHistoricalFxRate(dateStr, 'USD', 'GHS');
        total += rate ? amt / rate : 0;
      }
      return total;
    })(),
    sumInUsd(mtdInvoices),
    sumInUsd(prevMtdInvoices),
    sumInUsd(yoyInvoices)
  ]);

  const mtdPctChangeUsd = prevMtdUsd > 0
    ? ((mtdUsd - prevMtdUsd) / prevMtdUsd) * 100
    : (mtdUsd > 0 ? 100 : 0);
  const yoyPctChangeUsd = yoyUsd > 0
    ? ((mtdUsd - yoyUsd) / yoyUsd) * 100
    : (mtdUsd > 0 ? 100 : 0);

  // Recent invoices (today) for the dashboard table
  const recentInvoices = await sequelize.query(
    `SELECT i.id, i.invoice_number, i.total_amount, i.status, i.invoice_date,
            TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) as customer_name
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.status != 'CANCELLED'
       AND i.is_deleted = false
       AND i.invoice_date = CURRENT_DATE
       ${role === 'Sales' ? 'AND i.created_by = $1' : ''}
     ORDER BY i.created_at DESC
     LIMIT 10`,
    {
      bind: role === 'Sales' ? [req.user.id] : [],
      type: sequelize.QueryTypes.SELECT
    }
  );

  // Top 10 items by quantity — optionally filtered by aging bucket
  const agingFilter = req.query.aging; // 'under_1y', '1_to_2y', 'over_2y'
  let agingWhere = '';
  if (agingFilter === 'under_1y') {
    agingWhere = `AND COALESCE(a.purchase_date, a.created_at) >= NOW() - INTERVAL '1 year'`;
  } else if (agingFilter === '1_to_2y') {
    agingWhere = `AND COALESCE(a.purchase_date, a.created_at) >= NOW() - INTERVAL '2 years' AND COALESCE(a.purchase_date, a.created_at) < NOW() - INTERVAL '1 year'`;
  } else if (agingFilter === 'over_2y') {
    agingWhere = `AND COALESCE(a.purchase_date, a.created_at) < NOW() - INTERVAL '2 years'`;
  }
  const topByQuantity = await Asset.sequelize.query(
    `SELECT make, model,
            SUM(CASE WHEN is_serialized THEN
              (SELECT COUNT(*) FROM asset_units u WHERE u.asset_id = a.id AND u.status NOT IN ('Sold','Scrapped','Written Off'))
            ELSE a.quantity END) AS quantity
     FROM assets a
     WHERE a.deleted_at IS NULL AND a.status = 'In Stock' ${agingWhere}
     GROUP BY make, model
     ORDER BY quantity DESC
     LIMIT 10`,
    { type: Asset.sequelize.QueryTypes.SELECT }
  );

  // Build response
  const data = {
    today_sales: {
      total_amount: parseFloat(todayTotalAmount.toFixed(2)),
      total_amount_usd: parseFloat(todayUsd.toFixed(2)),
      collected: parseFloat(todayCollected.toFixed(2)),
      collected_usd: parseFloat(todayCollectedUsd.toFixed(2)),
      transaction_count: todayInvoices.length
    },
    mtd_sales: {
      current: parseFloat(mtdTotal.toFixed(2)),
      current_usd: parseFloat(mtdUsd.toFixed(2)),
      previous: parseFloat(prevMtdTotal.toFixed(2)),
      previous_usd: parseFloat(prevMtdUsd.toFixed(2)),
      percent_change: parseFloat(mtdPctChange.toFixed(1)),
      percent_change_usd: parseFloat(mtdPctChangeUsd.toFixed(1)),
      transaction_count: mtdInvoices.length
    },
    yoy_sales: {
      current: parseFloat(mtdTotal.toFixed(2)),
      current_usd: parseFloat(mtdUsd.toFixed(2)),
      previous: parseFloat(yoyTotal.toFixed(2)),
      previous_usd: parseFloat(yoyUsd.toFixed(2)),
      percent_change: parseFloat(yoyPctChange.toFixed(1)),
      percent_change_usd: parseFloat(yoyPctChangeUsd.toFixed(1))
    },
    recent_invoices: recentInvoices,
    inventory_on_hand: {
      total_units: totalAssets,
      ready_for_sale: inStockAssets,
      processing: reservedAssets,
      sold: soldAssets,
      in_repair: inRepairAssets
    },
    inventory_by_type: assetsByType,
    low_stock_alerts: {
      count: 0
    },
    preorders_summary: {
      total_active: 0,
      overdue: 0
    },
    needs_attention: {
      diagnostics_pending: 0,
      wipe_pending: 0,
      qc_pending: 0,
      preorders_sla_breach: 0,
      repairs_open: inRepairAssets
    },
    aging_stock: {
      under_1y: agingUnder1y,
      '1_to_2y': aging1to2y,
      over_2y: agingOver2y
    },
    top_by_quantity: topByQuantity
  };

  // Only include total_value for roles that can see cost
  if (canSeeCost(role)) {
    data.inventory_on_hand.total_value = parseFloat(inventoryValue).toFixed(2);
  }

  res.json({ success: true, data });
});

/**
 * GET /api/v1/dashboard/category-breakdown
 * Category → asset_type hierarchy with unit counts for treemap
 */
exports.getCategoryBreakdown = asyncHandler(async (req, res) => {
  // Optional aging filter
  const { aging } = req.query;
  let agingWhere = '';
  if (aging === 'under_1y') {
    agingWhere = `AND COALESCE(a.purchase_date, a.created_at) >= NOW() - INTERVAL '1 year'`;
  } else if (aging === '1_to_2y') {
    agingWhere = `AND COALESCE(a.purchase_date, a.created_at) >= NOW() - INTERVAL '2 years' AND COALESCE(a.purchase_date, a.created_at) < NOW() - INTERVAL '1 year'`;
  } else if (aging === 'over_2y') {
    agingWhere = `AND COALESCE(a.purchase_date, a.created_at) < NOW() - INTERVAL '2 years'`;
  }

  const rows = await sequelize.query(
    `SELECT a.category, a.asset_type,
            COUNT(*) AS product_count,
            COALESCE(SUM(
              CASE WHEN a.is_serialized THEN
                (SELECT COUNT(*) FROM asset_units u WHERE u.asset_id = a.id AND u.status NOT IN ('Sold','Scrapped','Written Off'))
              ELSE a.quantity END
            ), 0) AS unit_count
     FROM assets a
     WHERE a.deleted_at IS NULL AND a.status IN ('In Stock','Processing','Reserved')
     ${agingWhere}
     GROUP BY a.category, a.asset_type
     ORDER BY a.category, unit_count DESC`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const catMap = {};
  for (const r of rows) {
    const cat = r.category || 'Uncategorized';
    if (!catMap[cat]) catMap[cat] = { name: cat, children: [] };
    catMap[cat].children.push({
      name: r.asset_type || 'Other',
      size: parseInt(r.unit_count, 10)
    });
  }

  res.json({ success: true, data: Object.values(catMap) });
});

/**
 * GET /api/v1/dashboard/conversion-efficiency?months=24
 * Monthly Inventory Conversion Ratio = Revenue / Avg Inventory Value
 * Defaults to all available history. Use ?months=N to limit.
 */
exports.getConversionEfficiency = asyncHandler(async (req, res) => {
  const monthsBack = parseInt(req.query.months) || 0; // 0 = all history

  // 1. Monthly revenue
  const dateFilter = monthsBack > 0
    ? `AND invoice_date >= DATE_TRUNC('month', NOW()) - INTERVAL '${monthsBack - 1} months'`
    : '';
  const revenueRows = await sequelize.query(
    `SELECT
       TO_CHAR(invoice_date, 'YYYY-MM') AS month,
       SUM(total_amount::numeric) AS revenue,
       COUNT(*) AS invoice_count
     FROM invoices
     WHERE status != 'CANCELLED'
       AND is_deleted = false
       AND invoice_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
       ${dateFilter}
     GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
     ORDER BY month`,
    { type: sequelize.QueryTypes.SELECT }
  );

  // 2. Current inventory value — excludes Sold, Written Off, Scrapped, In Repair
  const [[valRow]] = await sequelize.query(
    `SELECT
       COALESCE(SUM(
         CASE WHEN a.is_serialized THEN
           (SELECT COALESCE(SUM(COALESCE(u.price_amount, a.price_amount)), 0)
            FROM asset_units u WHERE u.asset_id = a.id AND u.status NOT IN ('Sold','Scrapped','Written Off','In Repair'))
         ELSE
           a.quantity * COALESCE(a.price_amount, 0)
         END
       ), 0) AS inventory_value
     FROM assets a
     WHERE a.deleted_at IS NULL
       AND a.status IN ('In Stock','Processing','Reserved')
       AND (
         a.is_serialized = false AND a.quantity > 0
         OR a.is_serialized = true AND EXISTS (
           SELECT 1 FROM asset_units u WHERE u.asset_id = a.id AND u.status NOT IN ('Sold','Scrapped','Written Off')
         )
       )`
  );
  const currentInventoryValue = parseFloat(valRow.inventory_value) || 0;

  // 3. Cumulative sold value after each month-end (to reconstruct historical inventory)
  //    Inventory at month-end ≈ current inventory + total sold after + total written-off after
  const soldRows = await sequelize.query(
    `SELECT
       TO_CHAR(i.invoice_date, 'YYYY-MM') AS month,
       SUM(ii.quantity * COALESCE(ii.unit_price_amount::numeric, 0)) AS sold_value
     FROM invoice_items ii
     JOIN invoices i ON ii.invoice_id = i.id
     WHERE i.status = 'PAID'
       AND i.is_deleted = false
       AND ii.voided_at IS NULL
     GROUP BY TO_CHAR(i.invoice_date, 'YYYY-MM')
     ORDER BY month`,
    { type: sequelize.QueryTypes.SELECT }
  );

  // 3b. Write-off value by month (at retail/price for inventory reconstruction)
  const writeOffRows = await sequelize.query(
    `SELECT
       TO_CHAR(wo.approved_at, 'YYYY-MM') AS month,
       SUM(wo.quantity * COALESCE(
         CASE WHEN au.id IS NOT NULL THEN COALESCE(au.price_amount, a.price_amount)
         ELSE a.price_amount END, 0
       )) AS writeoff_value
     FROM inventory_write_offs wo
     JOIN assets a ON wo.asset_id = a.id
     LEFT JOIN asset_units au ON wo.asset_unit_id = au.id
     WHERE wo.status = 'APPROVED' AND wo.approved_at IS NOT NULL
     GROUP BY TO_CHAR(wo.approved_at, 'YYYY-MM')
     ORDER BY month`,
    { type: sequelize.QueryTypes.SELECT }
  );

  // Build cumulative sold-after-month lookup (reverse cumulative sum)
  // Include write-offs as inventory exits (like sales, they reduce inventory)
  const soldByMonth = new Map(soldRows.map(r => [r.month, parseFloat(r.sold_value) || 0]));
  const writeOffByMonth = new Map(writeOffRows.map(r => [r.month, parseFloat(r.writeoff_value) || 0]));
  const allMonths = [...new Set([
    ...revenueRows.map(r => r.month),
    ...soldRows.map(r => r.month),
    ...writeOffRows.map(r => r.month)
  ])].sort();
  const cumulativeExitAfter = new Map();
  let cumulative = 0;
  for (let i = allMonths.length - 1; i >= 0; i--) {
    const m = allMonths[i];
    cumulativeExitAfter.set(m, cumulative);
    cumulative += (soldByMonth.get(m) || 0) + (writeOffByMonth.get(m) || 0);
  }

  // 4. Build monthly data with reconstructed inventory
  const data = revenueRows.map(r => {
    const revenue = parseFloat(r.revenue) || 0;
    const exitAfter = cumulativeExitAfter.get(r.month) || 0;
    const closingInventory = currentInventoryValue + exitAfter;
    // Opening = closing + this month's exits (sold + written off)
    const monthExits = (soldByMonth.get(r.month) || 0) + (writeOffByMonth.get(r.month) || 0);
    const openingInventory = closingInventory + monthExits;
    const avgInventory = (openingInventory + closingInventory) / 2;
    const ratio = avgInventory > 0 ? revenue / avgInventory : 0;
    return {
      month: r.month,
      revenue: parseFloat(revenue.toFixed(2)),
      avg_inventory: parseFloat(avgInventory.toFixed(2)),
      ratio: parseFloat(ratio.toFixed(2)),
      invoice_count: parseInt(r.invoice_count)
    };
  });

  // Total write-off value for transparency
  let totalWriteOffValue = 0;
  for (const [, v] of writeOffByMonth) totalWriteOffValue += v;

  res.json({
    success: true,
    data: {
      months: data,
      current_inventory_value: parseFloat(currentInventoryValue.toFixed(2)),
      total_writeoff_value: parseFloat(totalWriteOffValue.toFixed(2))
    }
  });
});

module.exports = exports;
