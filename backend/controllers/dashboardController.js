const db = require('../models');
const { Asset, Invoice } = db;
const sequelize = db.sequelize;
const { Op } = require('sequelize');
const { canSeeCost } = require('../middleware/permissions');

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
    invoice_date: { [Op.gte]: todayStart }
  };
  // Sales users see only their own invoices
  if (role === 'Sales') {
    invoiceWhere.created_by = req.user.id;
  }

  const todayInvoices = await Invoice.findAll({
    where: invoiceWhere,
    attributes: ['total_amount', 'amount_paid'],
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
  // Add 1 day to make it inclusive of today / same day in prev month
  const mtdEnd = new Date(now.getFullYear(), now.getMonth(), dayOfMonth + 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth + 1);

  const mtdSalesWhere = {
    status: { [Op.ne]: 'CANCELLED' },
    invoice_date: { [Op.gte]: mtdStart, [Op.lt]: mtdEnd }
  };
  const prevMtdSalesWhere = {
    status: { [Op.ne]: 'CANCELLED' },
    invoice_date: { [Op.gte]: prevMonthStart, [Op.lt]: prevEnd }
  };
  if (role === 'Sales') {
    mtdSalesWhere.created_by = req.user.id;
    prevMtdSalesWhere.created_by = req.user.id;
  }

  const [mtdInvoices, prevMtdInvoices] = await Promise.all([
    Invoice.findAll({ where: mtdSalesWhere, attributes: ['total_amount'], raw: true }),
    Invoice.findAll({ where: prevMtdSalesWhere, attributes: ['total_amount'], raw: true })
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
    invoice_date: { [Op.gte]: yoyStart, [Op.lt]: yoyEnd }
  };
  if (role === 'Sales') {
    yoySalesWhere.created_by = req.user.id;
  }

  const yoyInvoices = await Invoice.findAll({ where: yoySalesWhere, attributes: ['total_amount'], raw: true });
  const yoyTotal = yoyInvoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
  const yoyPctChange = yoyTotal > 0
    ? ((mtdTotal - yoyTotal) / yoyTotal) * 100
    : (mtdTotal > 0 ? 100 : 0);

  // Recent invoices (today) for the dashboard table
  const recentInvoices = await sequelize.query(
    `SELECT i.id, i.invoice_number, i.total_amount, i.status, i.invoice_date,
            TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) as customer_name
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     WHERE i.status != 'CANCELLED'
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
    agingWhere = `AND COALESCE(purchase_date, created_at) >= NOW() - INTERVAL '1 year'`;
  } else if (agingFilter === '1_to_2y') {
    agingWhere = `AND COALESCE(purchase_date, created_at) >= NOW() - INTERVAL '2 years' AND COALESCE(purchase_date, created_at) < NOW() - INTERVAL '1 year'`;
  } else if (agingFilter === 'over_2y') {
    agingWhere = `AND COALESCE(purchase_date, created_at) < NOW() - INTERVAL '2 years'`;
  }
  const topByQuantity = await Asset.sequelize.query(
    `SELECT a.id, a.asset_tag, a.make, a.model, a.quantity,
            a.condition, cs.color as condition_color
     FROM assets a
     LEFT JOIN condition_statuses cs ON a.condition_status_id = cs.id
     WHERE a.deleted_at IS NULL AND a.status = 'In Stock' ${agingWhere}
     ORDER BY a.quantity DESC
     LIMIT 10`,
    { type: Asset.sequelize.QueryTypes.SELECT }
  );

  // Build response
  const data = {
    today_sales: {
      total_amount: parseFloat(todayTotalAmount.toFixed(2)),
      collected: parseFloat(todayCollected.toFixed(2)),
      transaction_count: todayInvoices.length
    },
    mtd_sales: {
      current: parseFloat(mtdTotal.toFixed(2)),
      previous: parseFloat(prevMtdTotal.toFixed(2)),
      percent_change: parseFloat(mtdPctChange.toFixed(1)),
      transaction_count: mtdInvoices.length
    },
    yoy_sales: {
      current: parseFloat(mtdTotal.toFixed(2)),
      previous: parseFloat(yoyTotal.toFixed(2)),
      percent_change: parseFloat(yoyPctChange.toFixed(1))
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

module.exports = exports;
