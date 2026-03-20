/**
 * Financial Report Controller
 * Admin-only P&L, revenue vs expense, and profit reporting.
 */

const { Invoice, Expense, ExpenseCategory, sequelize } = require('../models');
const { Op, fn, col, literal, QueryTypes } = require('sequelize');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * Parse date range from query (reuse pattern from reportController)
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
      startDate = new Date(now); startDate.setDate(now.getDate() - 7);
      endDate = now;
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
      break;
    case 'quarter':
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), qStart, 1);
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
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
  }
  return { startDate, endDate };
}

function getGranularity(startDate, endDate) {
  const diffDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  return diffDays > 60 ? 'monthly' : 'daily';
}

/**
 * GET /api/v1/financial-reports/pnl
 * Profit & Loss statement — Admin only
 */
exports.profitAndLoss = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);

  // ─── Revenue (from non-cancelled invoices in period) ───
  const revenueResult = await sequelize.query(`
    SELECT
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(total_cost_amount), 0) as cost_of_goods_sold,
      COUNT(*) as invoice_count
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED'
      AND is_deleted = false
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // ─── Collected (actual payments received in period, by payment_date) ───
  const collectedResult = await sequelize.query(`
    SELECT
      COALESCE(SUM(CASE WHEN p.transaction_type = 'PAYMENT' THEN p.amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN p.transaction_type = 'REFUND' THEN p.amount ELSE 0 END), 0) as collected_revenue
    FROM invoice_payments p
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND p.voided_at IS NULL
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // ─── Expenses (all categories including sensitive — Admin only) ───
  const expenseResult = await sequelize.query(`
    SELECT
      COALESCE(SUM(e.amount_local), 0) as total_expenses,
      COUNT(e.id) as expense_count
    FROM expenses e
    WHERE e.expense_date BETWEEN :startDate AND :endDate
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // ─── Expense breakdown by category ───
  const expenseByCategory = await sequelize.query(`
    SELECT
      ec.name as category_name,
      ec.is_sensitive,
      COALESCE(SUM(e.amount_local), 0) as total_local,
      COUNT(e.id) as count
    FROM expenses e
    JOIN expense_categories ec ON e.category_id = ec.id
    WHERE e.expense_date BETWEEN :startDate AND :endDate
    GROUP BY ec.id, ec.name, ec.is_sensitive
    ORDER BY total_local DESC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // ─── Revenue by month ───
  const revenueByMonth = await sequelize.query(`
    SELECT
      DATE_TRUNC('month', invoice_date)::date as month,
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM(total_cost_amount), 0) as cogs
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED'
      AND is_deleted = false
    GROUP BY DATE_TRUNC('month', invoice_date)
    ORDER BY month ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // ─── Expenses by month ───
  const expenseByMonth = await sequelize.query(`
    SELECT
      e.recognition_period as month,
      COALESCE(SUM(e.amount_local), 0) as expenses
    FROM expenses e
    WHERE e.expense_date BETWEEN :startDate AND :endDate
    GROUP BY e.recognition_period
    ORDER BY e.recognition_period ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  const totalRevenue = parseFloat(revenueResult[0].total_revenue) || 0;
  const collectedRevenue = parseFloat(collectedResult[0].collected_revenue) || 0;
  const cogs = parseFloat(revenueResult[0].cost_of_goods_sold) || 0;
  const totalExpenses = parseFloat(expenseResult[0].total_expenses) || 0;
  const grossProfit = totalRevenue - cogs;
  const netProfit = grossProfit - totalExpenses;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0;

  // Merge revenue and expense monthly data
  const monthMap = {};
  for (const r of revenueByMonth) {
    const key = typeof r.month === 'string' ? r.month.substring(0, 7) : new Date(r.month).toISOString().substring(0, 7);
    monthMap[key] = {
      month: key,
      revenue: parseFloat(r.revenue) || 0,
      cogs: parseFloat(r.cogs) || 0,
      expenses: 0
    };
  }
  for (const e of expenseByMonth) {
    const key = e.month;
    if (!monthMap[key]) {
      monthMap[key] = { month: key, revenue: 0, cogs: 0, expenses: 0 };
    }
    monthMap[key].expenses = parseFloat(e.expenses) || 0;
  }
  const monthlyBreakdown = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      ...m,
      gross_profit: m.revenue - m.cogs,
      net_profit: (m.revenue - m.cogs) - m.expenses
    }));

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      summary: {
        total_revenue: totalRevenue,
        collected_revenue: collectedRevenue,
        cost_of_goods_sold: cogs,
        gross_profit: grossProfit,
        gross_margin: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        net_margin: Math.round(netMargin * 100) / 100,
        invoice_count: parseInt(revenueResult[0].invoice_count) || 0,
        expense_count: parseInt(expenseResult[0].expense_count) || 0
      },
      expense_breakdown: expenseByCategory.map(c => ({
        category: c.category_name,
        is_sensitive: c.is_sensitive,
        total: parseFloat(c.total_local),
        count: parseInt(c.count)
      })),
      monthly_breakdown: monthlyBreakdown
    }
  });
});

/**
 * GET /api/v1/financial-reports/revenue-vs-expense
 * Revenue vs Expense comparison chart — Admin only
 */
exports.revenueVsExpense = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);

  // Build month-by-month comparison
  const revenue = await sequelize.query(`
    SELECT
      DATE_TRUNC('month', invoice_date)::date as month,
      COALESCE(SUM(total_amount), 0) as amount
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED'
      AND is_deleted = false
    GROUP BY DATE_TRUNC('month', invoice_date)
    ORDER BY month ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  const expenses = await sequelize.query(`
    SELECT
      e.recognition_period as month,
      COALESCE(SUM(e.amount_usd), 0) as amount
    FROM expenses e
    WHERE e.expense_date BETWEEN :startDate AND :endDate
    GROUP BY e.recognition_period
    ORDER BY e.recognition_period ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Merge into comparison
  const monthMap = {};
  for (const r of revenue) {
    const key = typeof r.month === 'string' ? r.month.substring(0, 7) : new Date(r.month).toISOString().substring(0, 7);
    monthMap[key] = { month: key, revenue: parseFloat(r.amount) || 0, expenses: 0 };
  }
  for (const e of expenses) {
    if (!monthMap[e.month]) {
      monthMap[e.month] = { month: e.month, revenue: 0, expenses: 0 };
    }
    monthMap[e.month].expenses = parseFloat(e.amount) || 0;
  }
  const comparison = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({ ...m, profit: m.revenue - m.expenses }));

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      comparison
    }
  });
});

/**
 * GET /api/v1/financial-reports/summary
 * Quick financial summary cards — Admin only
 */
exports.summary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = parseDateRange(req.query);

  // Current period revenue
  const rev = await sequelize.query(`
    SELECT
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM(total_cost_amount), 0) as cogs
    FROM invoices
    WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED' AND is_deleted = false
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  // Current period collected (actual payments by payment_date)
  const col = await sequelize.query(`
    SELECT
      COALESCE(SUM(CASE WHEN p.transaction_type = 'PAYMENT' THEN p.amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN p.transaction_type = 'REFUND' THEN p.amount ELSE 0 END), 0) as collected
    FROM invoice_payments p
    WHERE p.payment_date BETWEEN :startDate AND :endDate
      AND p.voided_at IS NULL
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  // Current period expenses
  const exp = await sequelize.query(`
    SELECT COALESCE(SUM(amount_local), 0) as expenses
    FROM expenses WHERE expense_date BETWEEN :startDate AND :endDate
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  const revenue = parseFloat(rev[0].revenue) || 0;
  const cogs = parseFloat(rev[0].cogs) || 0;
  const collected = parseFloat(col[0].collected) || 0;
  const expenses = parseFloat(exp[0].expenses) || 0;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;

  // Previous period (same duration, shifted back)
  const durationMs = new Date(endDate) - new Date(startDate);
  const prevEnd = new Date(new Date(startDate) - 1);
  const prevStart = new Date(prevEnd - durationMs);

  const prevRev = await sequelize.query(`
    SELECT COALESCE(SUM(total_amount), 0) as revenue, COALESCE(SUM(total_cost_amount), 0) as cogs
    FROM invoices WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status != 'CANCELLED' AND is_deleted = false
  `, { replacements: { startDate: prevStart, endDate: prevEnd }, type: QueryTypes.SELECT });

  const prevExp = await sequelize.query(`
    SELECT COALESCE(SUM(amount_local), 0) as expenses
    FROM expenses WHERE expense_date BETWEEN :startDate AND :endDate
  `, { replacements: { startDate: prevStart, endDate: prevEnd }, type: QueryTypes.SELECT });

  const prevRevenue = parseFloat(prevRev[0].revenue) || 0;
  const prevCogs = parseFloat(prevRev[0].cogs) || 0;
  const prevExpenses = parseFloat(prevExp[0].expenses) || 0;
  const prevNetProfit = (prevRevenue - prevCogs) - prevExpenses;

  function pctChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
  }

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      cards: {
        revenue: { value: revenue, change: pctChange(revenue, prevRevenue) },
        expenses: { value: expenses, change: pctChange(expenses, prevExpenses) },
        gross_profit: { value: grossProfit, change: pctChange(grossProfit, prevRevenue - prevCogs) },
        net_profit: { value: netProfit, change: pctChange(netProfit, prevNetProfit) },
        collected: { value: collected },
        net_margin: { value: revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0 }
      }
    }
  });
});
