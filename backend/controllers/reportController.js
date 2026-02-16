/**
 * Report Controller
 * 
 * Business intelligence reports informed by real SalesBinder data patterns:
 * - Sales trends (daily/weekly/monthly)
 * - Margin analysis per item, category, overall
 * - Top sellers ranking with velocity
 * - Staff performance comparison
 * - Customer insights (top buyers, new vs returning)
 * - Inventory aging & turnover
 * - Revenue forecasting
 */

const { Invoice, InvoiceItem, InvoicePayment, Asset, Customer, User, sequelize } = require('../models');
const { Op, fn, col, literal, QueryTypes } = require('sequelize');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * Helper: Parse date range from query params
 */
function parseDateRange(query) {
  const now = new Date();
  let startDate, endDate;

  switch (query.period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      endDate = now;
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
      break;
    case 'quarter':
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterStart, 1);
      endDate = now;
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = now;
      break;
    case 'custom':
      startDate = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = query.endDate ? new Date(query.endDate) : now;
      break;
    default:
      // Default to current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
  }

  return { startDate, endDate };
}

/**
 * GET /api/v1/reports/sales
 * Sales summary with trends
 */
exports.salesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);

  // Overall sales summary
  const summary = await Invoice.findOne({
    attributes: [
      [fn('COUNT', col('id')), 'total_invoices'],
      [fn('SUM', col('total_amount')), 'total_revenue'],
      [fn('SUM', col('total_cost_amount')), 'total_cost'],
      [fn('SUM', col('total_profit_amount')), 'total_profit'],
      [fn('AVG', col('total_amount')), 'avg_invoice_value'],
      [fn('MAX', col('total_amount')), 'max_invoice_value'],
      [fn('MIN', col('total_amount')), 'min_invoice_value'],
    ],
    where: {
      invoice_date: { [Op.between]: [startDate, endDate] },
      status: { [Op.ne]: 'CANCELLED' },
      is_deleted: false
    },
    raw: true
  });

  // Status breakdown
  const statusBreakdown = await Invoice.findAll({
    attributes: [
      'status',
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('total_amount')), 'total']
    ],
    where: {
      invoice_date: { [Op.between]: [startDate, endDate] },
      is_deleted: false
    },
    group: ['status'],
    raw: true
  });

  // Daily sales trend
  const dailyTrend = await sequelize.query(`
    SELECT 
      DATE(invoice_date) as date,
      COUNT(*) as invoice_count,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM(total_cost_amount), 0) as cost,
      COALESCE(SUM(total_profit_amount), 0) as profit
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED'
      AND is_deleted = false
    GROUP BY DATE(invoice_date)
    ORDER BY date ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Calculate margin
  const totalRevenue = parseFloat(summary.total_revenue) || 0;
  const totalCost = parseFloat(summary.total_cost) || 0;
  const overallMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0;

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      summary: {
        total_invoices: parseInt(summary.total_invoices) || 0,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: parseFloat(summary.total_profit) || 0,
        overall_margin_percent: Math.round(overallMargin * 100) / 100,
        avg_invoice_value: parseFloat(summary.avg_invoice_value) || 0,
        max_invoice_value: parseFloat(summary.max_invoice_value) || 0,
        min_invoice_value: parseFloat(summary.min_invoice_value) || 0,
      },
      status_breakdown: statusBreakdown.map(s => ({
        status: s.status,
        count: parseInt(s.count),
        total: parseFloat(s.total) || 0
      })),
      daily_trend: dailyTrend.map(d => ({
        date: d.date,
        invoice_count: parseInt(d.invoice_count),
        revenue: parseFloat(d.revenue),
        cost: parseFloat(d.cost),
        profit: parseFloat(d.profit)
      }))
    }
  });
});

/**
 * GET /api/v1/reports/top-sellers
 * Top selling products by quantity and revenue
 */
exports.topSellers = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);
  const limit = parseInt(req.query.limit) || 20;

  const topByQuantity = await sequelize.query(`
    SELECT
      a.make,
      a.model,
      a.category,
      a.asset_type,
      SUM(ii.quantity) as total_sold,
      SUM(ii.line_total_amount) as total_revenue,
      SUM(ii.line_profit_amount) as total_profit,
      AVG(ii.unit_price_amount) as avg_price,
      CASE WHEN SUM(ii.line_total_amount) > 0
        THEN (SUM(ii.line_profit_amount) / SUM(ii.line_total_amount) * 100)
        ELSE 0 END as margin_percent
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    JOIN assets a ON ii.asset_id = a.id
    WHERE i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status IN ('PAID', 'PARTIALLY_PAID')
      AND i.is_deleted = false
      AND ii.voided_at IS NULL
    GROUP BY a.make, a.model, a.category, a.asset_type
    ORDER BY total_sold DESC
    LIMIT :limit
  `, {
    replacements: { startDate, endDate, limit },
    type: QueryTypes.SELECT
  });

  // Top by revenue
  const topByRevenue = await sequelize.query(`
    SELECT
      a.make,
      a.model,
      a.category,
      a.asset_type,
      SUM(ii.quantity) as total_sold,
      SUM(ii.line_total_amount) as total_revenue,
      SUM(ii.line_profit_amount) as total_profit,
      CASE WHEN SUM(ii.line_total_amount) > 0
        THEN (SUM(ii.line_profit_amount) / SUM(ii.line_total_amount) * 100)
        ELSE 0 END as margin_percent
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    JOIN assets a ON ii.asset_id = a.id
    WHERE i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status IN ('PAID', 'PARTIALLY_PAID')
      AND i.is_deleted = false
      AND ii.voided_at IS NULL
    GROUP BY a.make, a.model, a.category, a.asset_type
    ORDER BY total_revenue DESC
    LIMIT :limit
  `, {
    replacements: { startDate, endDate, limit },
    type: QueryTypes.SELECT
  });

  // Top by category
  const topCategories = await sequelize.query(`
    SELECT 
      a.category,
      a.asset_type,
      COUNT(DISTINCT i.id) as invoice_count,
      SUM(ii.quantity) as total_sold,
      SUM(ii.line_total_amount) as total_revenue,
      SUM(ii.line_profit_amount) as total_profit,
      CASE WHEN SUM(ii.line_total_amount) > 0 
        THEN (SUM(ii.line_profit_amount) / SUM(ii.line_total_amount) * 100) 
        ELSE 0 END as margin_percent
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    JOIN assets a ON ii.asset_id = a.id
    WHERE i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status IN ('PAID', 'PARTIALLY_PAID')
      AND i.is_deleted = false
      AND ii.voided_at IS NULL
    GROUP BY a.category, a.asset_type
    ORDER BY total_revenue DESC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      by_quantity: topByQuantity.map(r => ({
        ...r,
        total_sold: parseInt(r.total_sold),
        total_revenue: parseFloat(r.total_revenue),
        total_profit: parseFloat(r.total_profit),
        avg_price: parseFloat(r.avg_price),
        margin_percent: parseFloat(r.margin_percent)
      })),
      by_revenue: topByRevenue.map(r => ({
        ...r,
        total_sold: parseInt(r.total_sold),
        total_revenue: parseFloat(r.total_revenue),
        total_profit: parseFloat(r.total_profit),
        margin_percent: parseFloat(r.margin_percent)
      })),
      by_category: topCategories.map(r => ({
        ...r,
        invoice_count: parseInt(r.invoice_count),
        total_sold: parseInt(r.total_sold),
        total_revenue: parseFloat(r.total_revenue),
        total_profit: parseFloat(r.total_profit),
        margin_percent: parseFloat(r.margin_percent)
      }))
    }
  });
});

/**
 * GET /api/v1/reports/staff-performance
 * Sales metrics per staff member
 */
exports.staffPerformance = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);

  const staffStats = await sequelize.query(`
    SELECT 
      u.id as user_id,
      u.full_name,
      u.role,
      COUNT(i.id) as invoice_count,
      COALESCE(SUM(i.total_amount), 0) as total_revenue,
      COALESCE(SUM(i.total_profit_amount), 0) as total_profit,
      COALESCE(AVG(i.total_amount), 0) as avg_ticket,
      CASE WHEN SUM(i.total_amount) > 0 
        THEN (SUM(i.total_profit_amount) / SUM(i.total_amount) * 100) 
        ELSE 0 END as margin_percent,
      COUNT(CASE WHEN i.status = 'PAID' THEN 1 END) as paid_count,
      COUNT(CASE WHEN i.status = 'UNPAID' THEN 1 END) as unpaid_count
    FROM users u
    LEFT JOIN invoices i ON i.created_by = u.id
      AND i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status != 'CANCELLED'
      AND i.is_deleted = false
    GROUP BY u.id, u.full_name, u.role
    HAVING COUNT(i.id) > 0
    ORDER BY total_revenue DESC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      staff: staffStats.map(s => ({
        user_id: s.user_id,
        name: s.full_name,
        role: s.role,
        invoice_count: parseInt(s.invoice_count),
        total_revenue: parseFloat(s.total_revenue),
        total_profit: parseFloat(s.total_profit),
        avg_ticket: parseFloat(s.avg_ticket),
        margin_percent: parseFloat(s.margin_percent),
        paid_count: parseInt(s.paid_count),
        unpaid_count: parseInt(s.unpaid_count),
        collection_rate: parseInt(s.invoice_count) > 0
          ? Math.round(parseInt(s.paid_count) / parseInt(s.invoice_count) * 100)
          : 0
      }))
    }
  });
});

/**
 * GET /api/v1/reports/customer-insights
 * Top customers, new vs returning, lifetime value
 */
exports.customerInsights = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);
  const limit = parseInt(req.query.limit) || 20;

  // Top customers by revenue
  const topCustomers = await sequelize.query(`
    SELECT 
      c.id as customer_id,
      COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.company_name, 'Unknown') as name,
      c.phone_raw as phone,
      COUNT(i.id) as invoice_count,
      COALESCE(SUM(i.total_amount), 0) as total_spent,
      COALESCE(SUM(i.total_profit_amount), 0) as total_profit,
      COALESCE(AVG(i.total_amount), 0) as avg_order,
      MIN(i.invoice_date) as first_purchase,
      MAX(i.invoice_date) as last_purchase
    FROM customers c
    JOIN invoices i ON i.customer_id = c.id
      AND i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status != 'CANCELLED'
      AND i.is_deleted = false
    GROUP BY c.id, c.first_name, c.last_name, c.company_name, c.phone_raw
    ORDER BY total_spent DESC
    LIMIT :limit
  `, {
    replacements: { startDate, endDate, limit },
    type: QueryTypes.SELECT
  });

  // New vs returning customers in period
  const customerCounts = await sequelize.query(`
    WITH period_customers AS (
      SELECT DISTINCT customer_id
      FROM invoices
      WHERE invoice_date BETWEEN :startDate AND :endDate
        AND status != 'CANCELLED'
        AND is_deleted = false
        AND customer_id IS NOT NULL
    ),
    first_purchases AS (
      SELECT customer_id, MIN(invoice_date) as first_purchase
      FROM invoices
      WHERE status != 'CANCELLED' AND is_deleted = false AND customer_id IS NOT NULL
      GROUP BY customer_id
    )
    SELECT 
      COUNT(CASE WHEN fp.first_purchase BETWEEN :startDate AND :endDate THEN 1 END) as new_customers,
      COUNT(CASE WHEN fp.first_purchase < :startDate THEN 1 END) as returning_customers,
      COUNT(*) as total_unique_customers
    FROM period_customers pc
    JOIN first_purchases fp ON pc.customer_id = fp.customer_id
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Total customer count
  const totalCustomers = await Customer.count();

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      total_customers: totalCustomers,
      period_customers: {
        total_unique: parseInt(customerCounts[0]?.total_unique_customers) || 0,
        new_customers: parseInt(customerCounts[0]?.new_customers) || 0,
        returning_customers: parseInt(customerCounts[0]?.returning_customers) || 0,
      },
      top_customers: topCustomers.map(c => ({
        customer_id: c.customer_id,
        name: c.name,
        phone: c.phone,
        invoice_count: parseInt(c.invoice_count),
        total_spent: parseFloat(c.total_spent),
        total_profit: parseFloat(c.total_profit),
        avg_order: parseFloat(c.avg_order),
        first_purchase: c.first_purchase,
        last_purchase: c.last_purchase
      }))
    }
  });
});

/**
 * GET /api/v1/reports/inventory-aging
 * Inventory aging analysis
 */
exports.inventoryAgingReport = asyncHandler(async (req, res) => {
  const agingBuckets = await sequelize.query(`
    SELECT 
      CASE 
        WHEN created_at >= NOW() - INTERVAL '30 days' THEN '0-30 days'
        WHEN created_at >= NOW() - INTERVAL '60 days' THEN '31-60 days'
        WHEN created_at >= NOW() - INTERVAL '90 days' THEN '61-90 days'
        ELSE '90+ days'
      END as age_bucket,
      COUNT(*) as item_count,
      COALESCE(SUM(quantity), 0) as total_units,
      COALESCE(SUM(price_amount * quantity), 0) as total_retail_value,
      COALESCE(SUM(cost_amount * quantity), 0) as total_cost_value
    FROM assets
    WHERE status = 'In Stock'
      AND deleted_at IS NULL
    GROUP BY 1
    ORDER BY MIN(created_at) DESC
  `, { type: QueryTypes.SELECT });

  // Oldest unsold items
  const oldestItems = await sequelize.query(`
    SELECT 
      id, asset_tag, make, model, category, asset_type,
      serial_number, quantity, price_amount, cost_amount,
      created_at,
      EXTRACT(DAY FROM NOW() - created_at) as days_in_stock
    FROM assets
    WHERE status = 'In Stock'
      AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 20
  `, { type: QueryTypes.SELECT });

  // Category breakdown for in-stock
  const categoryBreakdown = await sequelize.query(`
    SELECT 
      category,
      asset_type,
      COUNT(*) as item_count,
      SUM(quantity) as total_units,
      COALESCE(SUM(price_amount * quantity), 0) as retail_value,
      COALESCE(SUM(cost_amount * quantity), 0) as cost_value,
      AVG(EXTRACT(DAY FROM NOW() - created_at)) as avg_days_in_stock
    FROM assets
    WHERE status = 'In Stock'
      AND deleted_at IS NULL
    GROUP BY category, asset_type
    ORDER BY retail_value DESC
  `, { type: QueryTypes.SELECT });

  res.json({
    success: true,
    data: {
      aging_buckets: agingBuckets.map(b => ({
        ...b,
        item_count: parseInt(b.item_count),
        total_units: parseInt(b.total_units),
        total_retail_value: parseFloat(b.total_retail_value),
        total_cost_value: parseFloat(b.total_cost_value)
      })),
      oldest_items: oldestItems.map(i => ({
        ...i,
        quantity: parseInt(i.quantity),
        price_amount: parseFloat(i.price_amount),
        cost_amount: parseFloat(i.cost_amount),
        days_in_stock: parseInt(i.days_in_stock)
      })),
      category_breakdown: categoryBreakdown.map(c => ({
        ...c,
        item_count: parseInt(c.item_count),
        total_units: parseInt(c.total_units),
        retail_value: parseFloat(c.retail_value),
        cost_value: parseFloat(c.cost_value),
        avg_days_in_stock: Math.round(parseFloat(c.avg_days_in_stock))
      }))
    }
  });
});

/**
 * GET /api/v1/reports/low-stock
 * Low stock alerts
 */
exports.lowStockReport = asyncHandler(async (req, res) => {
  const threshold = parseInt(req.query.threshold) || 3;

  const lowStockItems = await sequelize.query(`
    SELECT 
      a.id, a.asset_tag, a.make, a.model, a.category, a.asset_type,
      a.quantity, a.price_amount, a.cost_amount,
      a.serial_number,
      (SELECT COUNT(*) FROM invoice_items ii 
       JOIN invoices i ON ii.invoice_id = i.id 
       WHERE ii.asset_id = a.id 
       AND i.status IN ('PAID', 'PARTIALLY_PAID') 
       AND i.is_deleted = false
       AND ii.voided_at IS NULL
       AND i.invoice_date >= NOW() - INTERVAL '30 days') as sold_last_30_days
    FROM assets a
    WHERE a.status = 'In Stock'
      AND a.quantity <= :threshold
      AND a.quantity > 0
      AND a.deleted_at IS NULL
    ORDER BY a.quantity ASC, sold_last_30_days DESC
  `, {
    replacements: { threshold },
    type: QueryTypes.SELECT
  });

  // Out of stock items that were selling well
  const outOfStockFastMovers = await sequelize.query(`
    SELECT 
      a.id, a.make, a.model, a.category, a.asset_type,
      COUNT(ii.id) as times_sold,
      SUM(ii.quantity) as total_sold,
      MAX(i.invoice_date) as last_sold
    FROM assets a
    JOIN invoice_items ii ON ii.asset_id = a.id
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE a.quantity = 0
      AND a.status != 'Sold'
      AND a.deleted_at IS NULL
      AND i.status IN ('PAID', 'PARTIALLY_PAID')
      AND i.is_deleted = false
      AND ii.voided_at IS NULL
      AND i.invoice_date >= NOW() - INTERVAL '90 days'
    GROUP BY a.id, a.make, a.model, a.category, a.asset_type
    HAVING SUM(ii.quantity) >= 2
    ORDER BY total_sold DESC
    LIMIT 20
  `, { type: QueryTypes.SELECT });

  res.json({
    success: true,
    data: {
      threshold,
      low_stock_items: lowStockItems.map(i => ({
        ...i,
        quantity: parseInt(i.quantity),
        price_amount: parseFloat(i.price_amount),
        cost_amount: parseFloat(i.cost_amount),
        sold_last_30_days: parseInt(i.sold_last_30_days)
      })),
      restock_suggestions: outOfStockFastMovers.map(i => ({
        ...i,
        times_sold: parseInt(i.times_sold),
        total_sold: parseInt(i.total_sold)
      }))
    }
  });
});

/**
 * GET /api/v1/reports/margin-analysis
 * Detailed margin analysis
 */
exports.marginAnalysis = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);

  // Overall margin stats
  const overallMargin = await sequelize.query(`
    SELECT
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(total_cost_amount), 0) as total_cost,
      COALESCE(SUM(total_profit_amount), 0) as total_profit,
      CASE WHEN SUM(total_amount) > 0
        THEN (SUM(total_profit_amount) / SUM(total_amount) * 100)
        ELSE 0 END as avg_margin,
      MIN(CASE WHEN total_amount > 0 THEN (total_profit_amount / total_amount * 100) END) as min_margin,
      MAX(CASE WHEN total_amount > 0 THEN (total_profit_amount / total_amount * 100) END) as max_margin
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED'
      AND is_deleted = false
      AND total_amount > 0
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Margin by category
  const marginByCategory = await sequelize.query(`
    SELECT 
      a.category,
      a.asset_type,
      SUM(ii.line_total_amount) as revenue,
      SUM(ii.line_cost_amount) as cost,
      SUM(ii.line_profit_amount) as profit,
      CASE WHEN SUM(ii.line_total_amount) > 0 
        THEN (SUM(ii.line_profit_amount) / SUM(ii.line_total_amount) * 100) 
        ELSE 0 END as margin_percent,
      COUNT(DISTINCT i.id) as invoice_count
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    JOIN assets a ON ii.asset_id = a.id
    WHERE i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status != 'CANCELLED'
      AND i.is_deleted = false
      AND ii.voided_at IS NULL
    GROUP BY a.category, a.asset_type
    ORDER BY profit DESC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Negative margin invoices (selling at a loss)
  const lossMakers = await sequelize.query(`
    SELECT 
      i.id, i.invoice_number, i.invoice_date,
      i.total_amount, i.total_cost_amount, i.total_profit_amount, i.margin_percent,
      COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.company_name, 'Unknown') as customer_name
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status != 'CANCELLED'
      AND i.is_deleted = false
      AND i.total_profit_amount < 0
    ORDER BY i.total_profit_amount ASC
    LIMIT 20
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Margin trend over time
  const marginTrend = await sequelize.query(`
    SELECT
      DATE(invoice_date) as date,
      CASE WHEN SUM(total_amount) > 0
        THEN (SUM(total_profit_amount) / SUM(total_amount) * 100)
        ELSE 0 END as avg_margin,
      SUM(total_profit_amount) as total_profit,
      SUM(total_amount) as total_revenue
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED'
      AND is_deleted = false
      AND total_amount > 0
    GROUP BY DATE(invoice_date)
    ORDER BY date ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Margin by model
  const marginByModel = await sequelize.query(`
    SELECT
      a.make, a.model, a.category, a.asset_type,
      SUM(ii.quantity) as total_sold,
      SUM(ii.line_total_amount) as total_revenue,
      SUM(ii.line_cost_amount) as total_cost,
      SUM(ii.line_profit_amount) as total_profit,
      CASE WHEN SUM(ii.line_total_amount) > 0
        THEN (SUM(ii.line_profit_amount) / SUM(ii.line_total_amount) * 100)
        ELSE 0 END as margin_percent
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    JOIN assets a ON ii.asset_id = a.id
    WHERE i.invoice_date BETWEEN :startDate AND :endDate
      AND i.status IN ('PAID', 'PARTIALLY_PAID')
      AND i.is_deleted = false
      AND ii.voided_at IS NULL
    GROUP BY a.make, a.model, a.category, a.asset_type
    ORDER BY margin_percent DESC
    LIMIT 20
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  const stats = overallMargin[0];
  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      overall: {
        total_revenue: parseFloat(stats.total_revenue),
        total_cost: parseFloat(stats.total_cost),
        total_profit: parseFloat(stats.total_profit),
        avg_margin: parseFloat(stats.avg_margin),
        min_margin: parseFloat(stats.min_margin),
        max_margin: parseFloat(stats.max_margin)
      },
      by_category: marginByCategory.map(c => ({
        ...c,
        revenue: parseFloat(c.revenue),
        cost: parseFloat(c.cost),
        profit: parseFloat(c.profit),
        margin_percent: parseFloat(c.margin_percent),
        invoice_count: parseInt(c.invoice_count)
      })),
      by_model: marginByModel.map(m => ({
        ...m,
        total_sold: parseInt(m.total_sold),
        total_revenue: parseFloat(m.total_revenue),
        total_cost: parseFloat(m.total_cost),
        total_profit: parseFloat(m.total_profit),
        margin_percent: parseFloat(m.margin_percent)
      })),
      loss_makers: lossMakers.map(l => ({
        ...l,
        total_amount: parseFloat(l.total_amount),
        total_cost_amount: parseFloat(l.total_cost_amount),
        total_profit_amount: parseFloat(l.total_profit_amount),
        margin_percent: parseFloat(l.margin_percent)
      })),
      trend: marginTrend.map(t => ({
        date: t.date,
        avg_margin: parseFloat(t.avg_margin),
        total_profit: parseFloat(t.total_profit),
        total_revenue: parseFloat(t.total_revenue)
      }))
    }
  });
});

/**
 * GET /api/v1/reports/preorder-sla
 * Preorder SLA tracking (placeholder for future)
 */
exports.preorderSLAReport = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'Preorder SLA report - coming soon'
    }
  });
});

/**
 * GET /api/v1/reports/my-performance
 * Personal sales performance for the requesting user.
 * Available to ALL roles.
 */
exports.myPerformance = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { dateFrom, dateTo } = req.query;

  const now = new Date();
  const startDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Invoices created by this user in the date range
  const where = {
    created_by: userId,
    invoice_date: { [Op.between]: [startDate, endDate] },
    status: { [Op.ne]: 'CANCELLED' }
  };

  const metrics = await Invoice.findOne({
    where,
    attributes: [
      [fn('COUNT', col('id')), 'invoiceCount'],
      [fn('SUM', col('total_amount')), 'totalRevenue'],
      [fn('SUM', col('amount_paid')), 'totalCollected'],
      [fn('AVG', col('total_amount')), 'avgTicket']
    ],
    raw: true
  });

  const invoiceCount = parseInt(metrics.invoiceCount) || 0;
  const totalRevenue = parseFloat(metrics.totalRevenue) || 0;
  const totalCollected = parseFloat(metrics.totalCollected) || 0;
  const avgTicket = parseFloat(metrics.avgTicket) || 0;

  // Status breakdown
  const statusBreakdown = await Invoice.findAll({
    where: { created_by: userId, invoice_date: { [Op.between]: [startDate, endDate] } },
    attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('total_amount')), 'amount']],
    group: ['status'],
    raw: true
  });

  // Recent invoices (last 10)
  const recentInvoices = await Invoice.findAll({
    where: { created_by: userId },
    order: [['created_at', 'DESC']],
    limit: 10,
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'first_name', 'last_name', 'company_name'] }
    ],
    attributes: ['id', 'invoice_number', 'invoice_date', 'total_amount', 'status', 'amount_paid', 'balance_due', 'currency']
  });

  res.json({
    success: true,
    data: {
      period: { from: startDate.toISOString(), to: endDate.toISOString() },
      invoiceCount,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalCollected: parseFloat(totalCollected.toFixed(2)),
      avgTicket: parseFloat(avgTicket.toFixed(2)),
      statusBreakdown: statusBreakdown.map(s => ({
        status: s.status,
        count: parseInt(s.count),
        amount: parseFloat(s.amount) || 0
      })),
      recentInvoices: recentInvoices.map(inv => {
        const data = inv.toJSON();
        if (data.customer) {
          data.customer.displayName = data.customer.first_name
            ? `${data.customer.first_name} ${data.customer.last_name || ''}`.trim()
            : data.customer.company_name || 'Unknown';
        }
        return data;
      })
    }
  });
});

/**
 * GET /api/v1/reports/reconciliation
 * Payment reconciliation — all money received during a period, grouped by method
 */
exports.reconciliation = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);

  // 1. Summary: total invoiced in period
  const invoicedResult = await sequelize.query(`
    SELECT
      COALESCE(SUM(total_amount), 0) AS total_invoiced,
      COUNT(*) AS invoice_count
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED'
      AND is_deleted = false
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // 2. Summary: total collected in period (payments received)
  const collectedResult = await sequelize.query(`
    SELECT
      COALESCE(SUM(p.amount), 0) AS total_collected,
      COUNT(*) AS payment_count
    FROM invoice_payments p
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND p.voided_at IS NULL
      AND p.transaction_type = 'PAYMENT'
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // 3. Total outstanding (all unpaid/partial invoices as of now)
  const outstandingResult = await sequelize.query(`
    SELECT COALESCE(SUM(balance_due), 0) AS total_outstanding
    FROM invoices
    WHERE balance_due > 0
      AND status NOT IN ('CANCELLED')
      AND is_deleted = false
  `, { type: QueryTypes.SELECT });

  const totalInvoiced = parseFloat(invoicedResult[0].total_invoiced) || 0;
  const totalCollected = parseFloat(collectedResult[0].total_collected) || 0;
  const totalOutstanding = parseFloat(outstandingResult[0].total_outstanding) || 0;
  const paymentCount = parseInt(collectedResult[0].payment_count) || 0;
  const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

  // 4. By payment method
  const byMethod = await sequelize.query(`
    SELECT
      p.payment_method AS method,
      COALESCE(SUM(p.amount), 0) AS amount,
      COUNT(*) AS count
    FROM invoice_payments p
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND p.voided_at IS NULL
      AND p.transaction_type = 'PAYMENT'
    GROUP BY p.payment_method
    ORDER BY amount DESC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  const byMethodFormatted = byMethod.map(m => ({
    method: m.method,
    amount: parseFloat(m.amount) || 0,
    count: parseInt(m.count) || 0,
    percent_of_total: totalCollected > 0
      ? parseFloat(((parseFloat(m.amount) / totalCollected) * 100).toFixed(1))
      : 0
  }));

  // 5. Daily collections breakdown
  const dailyCollections = await sequelize.query(`
    SELECT
      DATE(p.payment_date) AS date,
      SUM(CASE WHEN p.payment_method = 'Cash' THEN p.amount ELSE 0 END) AS cash,
      SUM(CASE WHEN p.payment_method = 'MoMo' THEN p.amount ELSE 0 END) AS momo,
      SUM(CASE WHEN p.payment_method = 'Card' THEN p.amount ELSE 0 END) AS card,
      SUM(CASE WHEN p.payment_method = 'ACH' THEN p.amount ELSE 0 END) AS ach,
      SUM(CASE WHEN p.payment_method = 'Other' THEN p.amount ELSE 0 END) AS other,
      SUM(p.amount) AS total
    FROM invoice_payments p
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND p.voided_at IS NULL
      AND p.transaction_type = 'PAYMENT'
    GROUP BY DATE(p.payment_date)
    ORDER BY date ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  const dailyFormatted = dailyCollections.map(d => ({
    date: d.date,
    cash: parseFloat(d.cash) || 0,
    momo: parseFloat(d.momo) || 0,
    card: parseFloat(d.card) || 0,
    ach: parseFloat(d.ach) || 0,
    other: parseFloat(d.other) || 0,
    total: parseFloat(d.total) || 0
  }));

  // 6. Prior period collections (payments in this period for invoices created before this period)
  const priorPeriod = await sequelize.query(`
    SELECT
      i.invoice_number,
      i.invoice_date,
      COALESCE(c.first_name || ' ' || c.last_name, c.company_name, 'Walk-in') AS customer_name,
      p.amount AS payment_amount,
      p.payment_method,
      p.payment_date
    FROM invoice_payments p
    JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND i.invoice_date < :startDate
      AND p.voided_at IS NULL
      AND p.transaction_type = 'PAYMENT'
    ORDER BY p.payment_date DESC
    LIMIT 50
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  const priorPeriodTotals = await sequelize.query(`
    SELECT
      COALESCE(SUM(p.amount), 0) AS amount,
      COUNT(*) AS count
    FROM invoice_payments p
    JOIN invoices i ON p.invoice_id = i.id
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND i.invoice_date < :startDate
      AND p.voided_at IS NULL
      AND p.transaction_type = 'PAYMENT'
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // 7. Current period collections
  const currentPeriodTotals = await sequelize.query(`
    SELECT
      COALESCE(SUM(p.amount), 0) AS amount,
      COUNT(*) AS count
    FROM invoice_payments p
    JOIN invoices i ON p.invoice_id = i.id
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND i.invoice_date BETWEEN :startDate AND :endDate
      AND p.voided_at IS NULL
      AND p.transaction_type = 'PAYMENT'
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // 8. Outstanding invoices
  const outstandingInvoices = await sequelize.query(`
    SELECT
      i.id,
      i.invoice_number,
      i.invoice_date,
      COALESCE(c.first_name || ' ' || c.last_name, c.company_name, 'Walk-in') AS customer_name,
      i.total_amount,
      i.amount_paid,
      i.balance_due,
      EXTRACT(DAY FROM NOW() - i.invoice_date)::int AS days_outstanding,
      i.status
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.balance_due > 0
      AND i.status NOT IN ('CANCELLED')
      AND i.is_deleted = false
    ORDER BY i.invoice_date ASC
  `, { type: QueryTypes.SELECT });

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      summary: {
        total_invoiced: parseFloat(totalInvoiced.toFixed(2)),
        total_collected: parseFloat(totalCollected.toFixed(2)),
        total_outstanding: parseFloat(totalOutstanding.toFixed(2)),
        collection_rate: parseFloat(collectionRate.toFixed(1)),
        payment_count: paymentCount,
        invoice_count: parseInt(invoicedResult[0].invoice_count) || 0
      },
      by_method: byMethodFormatted,
      daily_collections: dailyFormatted,
      prior_period_collections: {
        amount: parseFloat(priorPeriodTotals[0].amount) || 0,
        count: parseInt(priorPeriodTotals[0].count) || 0,
        invoices: priorPeriod.map(p => ({
          invoice_number: p.invoice_number,
          invoice_date: p.invoice_date,
          customer_name: p.customer_name,
          payment_amount: parseFloat(p.payment_amount) || 0,
          payment_method: p.payment_method,
          payment_date: p.payment_date
        }))
      },
      current_period_collections: {
        amount: parseFloat(currentPeriodTotals[0].amount) || 0,
        count: parseInt(currentPeriodTotals[0].count) || 0
      },
      outstanding_invoices: outstandingInvoices.map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        customer_name: inv.customer_name,
        total_amount: parseFloat(inv.total_amount) || 0,
        amount_paid: parseFloat(inv.amount_paid) || 0,
        balance_due: parseFloat(inv.balance_due) || 0,
        days_outstanding: inv.days_outstanding || 0,
        status: inv.status
      }))
    }
  });
});

module.exports = exports;
