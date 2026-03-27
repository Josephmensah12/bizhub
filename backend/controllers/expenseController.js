/**
 * Expense Controller
 * CRUD for expenses with role-based sensitive data filtering.
 * Includes recurring expense management and analytics.
 */

const { Expense, ExpenseCategory, RecurringExpense, User, sequelize } = require('../models');
const { Op, fn, col, literal, QueryTypes } = require('sequelize');
const { generateRecurringExpenses } = require('../services/recurringExpenseService');
const { getExchangeRate } = require('../services/exchangeRateService');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * Build WHERE clause that filters out sensitive categories for non-admin users.
 */
function buildSensitiveFilter(role) {
  if (role === 'Admin') return {};
  // Subquery: exclude expenses in sensitive categories
  return {
    category_id: {
      [Op.notIn]: literal(
        `(SELECT id FROM expense_categories WHERE is_sensitive = true)`
      )
    }
  };
}

// ─── EXPENSES CRUD ───────────────────────────────────────────

/**
 * GET /api/v1/expenses
 * List expenses with pagination, filters, and role-based filtering.
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 50,
    dateFrom, dateTo, category_id, search, expense_type,
    sortBy = 'expense_date', sortOrder = 'DESC'
  } = req.query;
  const role = req.user.role;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Base filters
  const where = { ...buildSensitiveFilter(role) };

  // Staff can only see their own expenses
  if (role === 'Staff') {
    where.created_by = req.user.id;
  }

  if (dateFrom || dateTo) {
    where.expense_date = {};
    if (dateFrom) where.expense_date[Op.gte] = dateFrom;
    if (dateTo) where.expense_date[Op.lte] = dateTo;
  }
  if (category_id) where.category_id = parseInt(category_id);
  if (expense_type) where.expense_type = expense_type;
  if (search) {
    where[Op.or] = [
      { description: { [Op.iLike]: `%${search}%` } },
      { vendor_or_payee: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Validate sort column
  const allowedSorts = ['expense_date', 'amount_local', 'amount_usd', 'created_at', 'description'];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'expense_date';
  const safeOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { rows: expenses, count: total } = await Expense.findAndCountAll({
    where,
    include: [
      { model: ExpenseCategory, as: 'category', attributes: ['id', 'name', 'is_sensitive'] },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ],
    order: [[safeSort, safeOrder]],
    limit: parseInt(limit),
    offset
  });

  // Compute totals (only for allowed data)
  const totalsResult = await Expense.findOne({
    where,
    attributes: [
      [fn('COALESCE', fn('SUM', col('amount_usd')), 0), 'total_usd'],
      [fn('COALESCE', fn('SUM', col('amount_local')), 0), 'total_local'],
      [fn('COUNT', col('id')), 'count']
    ],
    raw: true
  });

  res.json({
    success: true,
    data: {
      expenses,
      totals: {
        total_usd: parseFloat(totalsResult.total_usd) || 0,
        total_local: parseFloat(totalsResult.total_local) || 0,
        count: parseInt(totalsResult.count) || 0
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * GET /api/v1/expenses/:id
 */
exports.detail = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const expense = await Expense.findByPk(req.params.id, {
    include: [
      { model: ExpenseCategory, as: 'category' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Expense not found' }
    });
  }

  // Non-admin cannot see sensitive category expenses
  if (role !== 'Admin' && expense.category && expense.category.is_sensitive) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' }
    });
  }

  // Staff can only see own expenses
  if (role === 'Staff' && expense.created_by !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' }
    });
  }

  res.json({ success: true, data: { expense } });
});

/**
 * POST /api/v1/expenses
 */
exports.create = asyncHandler(async (req, res) => {
  const {
    expense_date, category_id, description, vendor_or_payee,
    amount_local, currency_code = 'GHS', exchange_rate_used,
    expense_type = 'one_time', notes
  } = req.body;

  // Validation
  if (!expense_date || !category_id || !description || !amount_local) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'expense_date, category_id, description, and amount_local are required' }
    });
  }

  // Non-admin cannot create expenses in sensitive categories
  if (req.user.role !== 'Admin') {
    const cat = await ExpenseCategory.findByPk(category_id);
    if (cat && cat.is_sensitive) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot create expenses in sensitive categories' }
      });
    }
  }

  // Get or use provided exchange rate
  let fxRate = exchange_rate_used;
  if (!fxRate && currency_code !== 'USD') {
    fxRate = await getExchangeRate(currency_code, 'USD', expense_date);
  }
  fxRate = fxRate || 1;

  // Compute USD amount
  const amountUsd = currency_code === 'USD'
    ? parseFloat(amount_local)
    : parseFloat(amount_local) * parseFloat(fxRate);

  // Derive recognition_period from expense_date
  const dateObj = new Date(expense_date);
  const recognition_period = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

  const expense = await Expense.create({
    expense_date,
    recognition_period,
    category_id,
    description: description.trim(),
    vendor_or_payee: vendor_or_payee?.trim() || null,
    amount_local: parseFloat(amount_local),
    currency_code,
    exchange_rate_used: fxRate,
    amount_usd: Math.round(amountUsd * 100) / 100,
    expense_type,
    source_type: 'manual',
    notes: notes || null,
    created_by: req.user.id
  });

  const full = await Expense.findByPk(expense.id, {
    include: [
      { model: ExpenseCategory, as: 'category' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  res.status(201).json({ success: true, data: { expense: full } });
});

/**
 * PATCH /api/v1/expenses/:id
 */
exports.update = asyncHandler(async (req, res) => {
  const expense = await Expense.findByPk(req.params.id, {
    include: [{ model: ExpenseCategory, as: 'category' }]
  });

  if (!expense) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Expense not found' }
    });
  }

  // Non-admin: block sensitive
  if (req.user.role !== 'Admin' && expense.category && expense.category.is_sensitive) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' }
    });
  }

  const {
    expense_date, category_id, description, vendor_or_payee,
    amount_local, currency_code, exchange_rate_used, expense_type, notes
  } = req.body;

  const updates = {};
  if (expense_date !== undefined) {
    updates.expense_date = expense_date;
    const d = new Date(expense_date);
    updates.recognition_period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (category_id !== undefined) {
    // Non-admin cannot switch to sensitive category
    if (req.user.role !== 'Admin') {
      const cat = await ExpenseCategory.findByPk(category_id);
      if (cat && cat.is_sensitive) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Cannot assign sensitive category' }
        });
      }
    }
    updates.category_id = category_id;
  }
  if (description !== undefined) updates.description = description.trim();
  if (vendor_or_payee !== undefined) updates.vendor_or_payee = vendor_or_payee?.trim() || null;
  if (expense_type !== undefined) updates.expense_type = expense_type;
  if (notes !== undefined) updates.notes = notes;

  // Recalculate USD if amount/currency/rate changed
  if (amount_local !== undefined || currency_code !== undefined || exchange_rate_used !== undefined) {
    const newAmount = amount_local !== undefined ? parseFloat(amount_local) : expense.amount_local;
    const newCurrency = currency_code || expense.currency_code;
    let newRate = exchange_rate_used || expense.exchange_rate_used;

    if (amount_local !== undefined) updates.amount_local = newAmount;
    if (currency_code !== undefined) updates.currency_code = newCurrency;
    if (exchange_rate_used !== undefined) updates.exchange_rate_used = newRate;

    const amountUsd = newCurrency === 'USD' ? newAmount : newAmount * parseFloat(newRate);
    updates.amount_usd = Math.round(amountUsd * 100) / 100;
  }

  await expense.update(updates);

  const full = await Expense.findByPk(expense.id, {
    include: [
      { model: ExpenseCategory, as: 'category' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  res.json({ success: true, data: { expense: full } });
});

/**
 * DELETE /api/v1/expenses/:id (Admin only)
 */
exports.remove = asyncHandler(async (req, res) => {
  const expense = await Expense.findByPk(req.params.id);
  if (!expense) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Expense not found' }
    });
  }

  await expense.destroy();
  res.json({ success: true, message: 'Expense deleted' });
});

// ─── RECURRING EXPENSES ──────────────────────────────────────

/**
 * GET /api/v1/expenses/recurring
 */
exports.listRecurring = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'Admin';
  const where = {};

  if (!isAdmin) {
    where.category_id = {
      [Op.notIn]: literal(`(SELECT id FROM expense_categories WHERE is_sensitive = true)`)
    };
  }

  const recurring = await RecurringExpense.findAll({
    where,
    include: [
      { model: ExpenseCategory, as: 'category', attributes: ['id', 'name', 'is_sensitive'] },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ],
    order: [['created_at', 'DESC']]
  });

  res.json({ success: true, data: { recurring } });
});

/**
 * POST /api/v1/expenses/recurring
 */
exports.createRecurring = asyncHandler(async (req, res) => {
  const {
    category_id, description, vendor_or_payee,
    amount_local, currency_code = 'GHS', exchange_rate_used,
    start_date, end_date, auto_post_enabled = true
  } = req.body;

  if (!category_id || !description || !amount_local || !start_date) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'category_id, description, amount_local, and start_date are required' }
    });
  }

  // Non-admin cannot use sensitive categories
  if (req.user.role !== 'Admin') {
    const cat = await ExpenseCategory.findByPk(category_id);
    if (cat && cat.is_sensitive) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot create recurring expense with sensitive category' }
      });
    }
  }

  // Get or use provided exchange rate (historical FX basis)
  let fxRate = exchange_rate_used;
  if (!fxRate && currency_code !== 'USD') {
    fxRate = await getExchangeRate(currency_code, 'USD', start_date);
  }
  fxRate = fxRate || 1;

  const amountUsd = currency_code === 'USD'
    ? parseFloat(amount_local)
    : parseFloat(amount_local) * parseFloat(fxRate);

  const recurring = await RecurringExpense.create({
    category_id,
    description: description.trim(),
    vendor_or_payee: vendor_or_payee?.trim() || null,
    amount_local: parseFloat(amount_local),
    currency_code,
    exchange_rate_used: fxRate,
    amount_usd: Math.round(amountUsd * 100) / 100,
    start_date,
    end_date: end_date || null,
    auto_post_enabled,
    is_active: true,
    created_by: req.user.id
  });

  const full = await RecurringExpense.findByPk(recurring.id, {
    include: [
      { model: ExpenseCategory, as: 'category' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  res.status(201).json({ success: true, data: { recurring: full } });
});

/**
 * PATCH /api/v1/expenses/recurring/:id
 */
exports.updateRecurring = asyncHandler(async (req, res) => {
  const recurring = await RecurringExpense.findByPk(req.params.id);
  if (!recurring) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Recurring expense not found' }
    });
  }

  const {
    category_id, description, vendor_or_payee,
    amount_local, currency_code, exchange_rate_used,
    end_date, auto_post_enabled, is_active
  } = req.body;

  const updates = {};
  if (category_id !== undefined) updates.category_id = category_id;
  if (description !== undefined) updates.description = description.trim();
  if (vendor_or_payee !== undefined) updates.vendor_or_payee = vendor_or_payee?.trim() || null;
  if (end_date !== undefined) updates.end_date = end_date;
  if (auto_post_enabled !== undefined) updates.auto_post_enabled = auto_post_enabled;
  if (is_active !== undefined) updates.is_active = is_active;

  if (amount_local !== undefined || currency_code !== undefined || exchange_rate_used !== undefined) {
    const newAmount = amount_local !== undefined ? parseFloat(amount_local) : recurring.amount_local;
    const newCurrency = currency_code || recurring.currency_code;
    const newRate = exchange_rate_used || recurring.exchange_rate_used;

    if (amount_local !== undefined) updates.amount_local = newAmount;
    if (currency_code !== undefined) updates.currency_code = newCurrency;
    if (exchange_rate_used !== undefined) updates.exchange_rate_used = newRate;

    const amountUsd = newCurrency === 'USD' ? newAmount : newAmount * parseFloat(newRate);
    updates.amount_usd = Math.round(amountUsd * 100) / 100;
  }

  await recurring.update(updates);

  const full = await RecurringExpense.findByPk(recurring.id, {
    include: [
      { model: ExpenseCategory, as: 'category' },
      { model: User, as: 'creator', attributes: ['id', 'full_name'] }
    ]
  });

  res.json({ success: true, data: { recurring: full } });
});

/**
 * DELETE /api/v1/expenses/recurring/:id (Admin only)
 */
exports.removeRecurring = asyncHandler(async (req, res) => {
  const recurring = await RecurringExpense.findByPk(req.params.id);
  if (!recurring) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Recurring expense not found' }
    });
  }

  // Deactivate rather than delete to preserve history
  await recurring.update({ is_active: false });
  res.json({ success: true, message: 'Recurring expense deactivated' });
});

/**
 * POST /api/v1/expenses/recurring/generate
 * Trigger generation of recurring expenses up to specified period.
 */
exports.generateRecurring = asyncHandler(async (req, res) => {
  const { target_period } = req.body;
  const result = await generateRecurringExpenses(target_period);
  res.json({ success: true, data: result });
});

// ─── ANALYTICS ───────────────────────────────────────────────

/**
 * GET /api/v1/expenses/analytics
 * Expense charts and summaries with role-based filtering.
 */
exports.analytics = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, period } = req.query;
  const role = req.user.role;
  const isAdmin = role === 'Admin';

  // Parse date range
  const now = new Date();
  let startDate, endDate;
  switch (period) {
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
      startDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = dateTo ? new Date(dateTo) : now;
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
  }

  const sensitiveFilter = isAdmin
    ? ''
    : 'AND e.category_id NOT IN (SELECT id FROM expense_categories WHERE is_sensitive = true)';

  // Total by category
  const byCategory = await sequelize.query(`
    SELECT
      ec.id as category_id,
      ec.name as category_name,
      COALESCE(SUM(e.amount_usd), 0) as total_usd,
      COALESCE(SUM(e.amount_local), 0) as total_local,
      COUNT(e.id) as expense_count
    FROM expense_categories ec
    LEFT JOIN expenses e ON e.category_id = ec.id
      AND e.expense_date BETWEEN :startDate AND :endDate
    WHERE ec.is_active = true
      ${isAdmin ? '' : 'AND ec.is_sensitive = false'}
    GROUP BY ec.id, ec.name
    HAVING COUNT(e.id) > 0
    ORDER BY total_usd DESC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Monthly trend
  const monthlyTrend = await sequelize.query(`
    SELECT
      e.recognition_period,
      COALESCE(SUM(e.amount_usd), 0) as total_usd,
      COUNT(e.id) as expense_count
    FROM expenses e
    WHERE e.expense_date BETWEEN :startDate AND :endDate
      ${sensitiveFilter}
    GROUP BY e.recognition_period
    ORDER BY e.recognition_period ASC
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Summary totals
  const summary = await sequelize.query(`
    SELECT
      COALESCE(SUM(e.amount_usd), 0) as total_usd,
      COALESCE(SUM(e.amount_local), 0) as total_local,
      COUNT(e.id) as count,
      COALESCE(AVG(e.amount_usd), 0) as avg_usd
    FROM expenses e
    WHERE e.expense_date BETWEEN :startDate AND :endDate
      ${sensitiveFilter}
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  // Top vendors
  const topVendors = await sequelize.query(`
    SELECT
      COALESCE(e.vendor_or_payee, 'Unspecified') as vendor,
      COALESCE(SUM(e.amount_usd), 0) as total_usd,
      COUNT(e.id) as expense_count
    FROM expenses e
    WHERE e.expense_date BETWEEN :startDate AND :endDate
      ${sensitiveFilter}
    GROUP BY COALESCE(e.vendor_or_payee, 'Unspecified')
    ORDER BY total_usd DESC
    LIMIT 10
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT
  });

  const stats = summary[0];
  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      summary: {
        total_usd: parseFloat(stats.total_usd) || 0,
        total_local: parseFloat(stats.total_local) || 0,
        count: parseInt(stats.count) || 0,
        avg_usd: parseFloat(stats.avg_usd) || 0
      },
      by_category: byCategory.map(c => ({
        ...c,
        total_usd: parseFloat(c.total_usd),
        total_local: parseFloat(c.total_local),
        expense_count: parseInt(c.expense_count)
      })),
      monthly_trend: monthlyTrend.map(m => ({
        period: m.recognition_period,
        total_usd: parseFloat(m.total_usd),
        expense_count: parseInt(m.expense_count)
      })),
      top_vendors: topVendors.map(v => ({
        vendor: v.vendor,
        total_usd: parseFloat(v.total_usd),
        expense_count: parseInt(v.expense_count)
      }))
    }
  });
});

/**
 * GET /api/v1/expenses/reports
 * Comprehensive expense reports with 8 sections
 */
exports.reports = asyncHandler(async (req, res) => {
  const { period, dateFrom, dateTo } = req.query;
  const role = req.user.role;
  const isAdmin = role === 'Admin';

  const now = new Date();
  let startDate, endDate;
  switch (period) {
    case 'week':
      startDate = new Date(now); startDate.setDate(now.getDate() - 7); endDate = now; break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); endDate = now; break;
    case 'quarter':
      startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); endDate = now; break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1); endDate = now; break;
    case 'custom':
      startDate = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = dateTo ? new Date(dateTo) : now; break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); endDate = now;
  }

  const sensFilter = isAdmin ? '' : 'AND e.category_id NOT IN (SELECT id FROM expense_categories WHERE is_sensitive = true)';

  // Previous period for comparison
  const periodMs = endDate - startDate;
  const prevEnd = new Date(startDate.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - periodMs);

  // Summary
  const [currentSummary] = await sequelize.query(`
    SELECT COALESCE(SUM(amount_usd), 0) as total_usd, COALESCE(SUM(amount_local), 0) as total_local,
           COUNT(*) as count, COALESCE(AVG(amount_usd), 0) as avg_usd, MAX(amount_usd) as max_usd
    FROM expenses e WHERE expense_date BETWEEN :startDate AND :endDate ${sensFilter}
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  const [prevSummary] = await sequelize.query(`
    SELECT COALESCE(SUM(amount_usd), 0) as total_usd
    FROM expenses e WHERE expense_date BETWEEN :prevStart AND :prevEnd ${sensFilter}
  `, { replacements: { prevStart, prevEnd }, type: QueryTypes.SELECT });

  const [revData] = await sequelize.query(`
    SELECT COALESCE(SUM(total_amount), 0) as revenue
    FROM invoices WHERE invoice_date BETWEEN :startDate AND :endDate
      AND status IN ('PAID', 'PARTIALLY_PAID') AND is_deleted = false
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  const days = Math.max(Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)), 1);
  const totalUsd = parseFloat(currentSummary.total_usd) || 0;
  const prevTotalUsd = parseFloat(prevSummary.total_usd) || 0;
  const pctChange = prevTotalUsd > 0 ? ((totalUsd - prevTotalUsd) / prevTotalUsd * 100) : 0;
  const revenue = parseFloat(revData.revenue) || 0;

  // Monthly trend (13 months) with revenue
  const trendStart = new Date(); trendStart.setMonth(trendStart.getMonth() - 12); trendStart.setDate(1);
  const monthlyTrend = await sequelize.query(`
    SELECT DATE_TRUNC('month', expense_date)::date as month,
           COALESCE(SUM(amount_usd), 0) as expenses_usd, COALESCE(SUM(amount_local), 0) as expenses_local, COUNT(*) as count
    FROM expenses e WHERE expense_date >= :trendStart ${sensFilter}
    GROUP BY DATE_TRUNC('month', expense_date) ORDER BY month ASC
  `, { replacements: { trendStart }, type: QueryTypes.SELECT });

  const monthlyRevenue = await sequelize.query(`
    SELECT DATE_TRUNC('month', invoice_date)::date as month, COALESCE(SUM(total_amount), 0) as revenue
    FROM invoices WHERE invoice_date >= :trendStart AND status IN ('PAID', 'PARTIALLY_PAID') AND is_deleted = false
    GROUP BY DATE_TRUNC('month', invoice_date) ORDER BY month ASC
  `, { replacements: { trendStart }, type: QueryTypes.SELECT });
  const revenueByMonth = {};
  monthlyRevenue.forEach(r => { revenueByMonth[r.month] = parseFloat(r.revenue); });

  // By category
  const byCategory = await sequelize.query(`
    SELECT ec.id as category_id, ec.name as category_name,
           COALESCE(SUM(e.amount_usd), 0) as total_usd, COALESCE(SUM(e.amount_local), 0) as total_local, COUNT(e.id) as count
    FROM expense_categories ec
    LEFT JOIN expenses e ON e.category_id = ec.id AND e.expense_date BETWEEN :startDate AND :endDate
    WHERE ec.is_active = true ${isAdmin ? '' : 'AND ec.is_sensitive = false'}
    GROUP BY ec.id, ec.name HAVING COUNT(e.id) > 0 ORDER BY total_usd DESC
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  // Top vendors
  const topVendors = await sequelize.query(`
    SELECT COALESCE(vendor_or_payee, 'Unspecified') as vendor,
           COALESCE(SUM(amount_usd), 0) as total_usd, COALESCE(SUM(amount_local), 0) as total_local, COUNT(*) as count
    FROM expenses e WHERE expense_date BETWEEN :startDate AND :endDate ${sensFilter}
    GROUP BY COALESCE(vendor_or_payee, 'Unspecified') ORDER BY total_usd DESC LIMIT 15
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  // Recurring vs one-time
  const typeSplit = await sequelize.query(`
    SELECT expense_type, COALESCE(SUM(amount_usd), 0) as total_usd,
           COALESCE(SUM(amount_local), 0) as total_local, COUNT(*) as count
    FROM expenses e WHERE expense_date BETWEEN :startDate AND :endDate ${sensFilter}
    GROUP BY expense_type
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  // Expense-to-revenue ratio trend
  const ratioTrend = monthlyTrend.map(m => {
    const rev = revenueByMonth[m.month] || 0;
    const exp = parseFloat(m.expenses_local);
    return { month: m.month, expenses: exp, revenue: rev, ratio: rev > 0 ? (exp / rev * 100) : 0 };
  });

  const catTotal = byCategory.reduce((s, c) => s + parseFloat(c.total_usd), 0);

  // Largest expenses
  const largestExpenses = await sequelize.query(`
    SELECT e.id, e.expense_date, e.description, e.vendor_or_payee, e.amount_usd, e.amount_local,
           e.currency_code, e.expense_type, ec.name as category_name
    FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.expense_date BETWEEN :startDate AND :endDate ${sensFilter}
    ORDER BY e.amount_usd DESC LIMIT 20
  `, { replacements: { startDate, endDate }, type: QueryTypes.SELECT });

  // Month-over-month comparison
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const momComparison = await sequelize.query(`
    SELECT ec.name as category,
           COALESCE(SUM(CASE WHEN e.expense_date >= :currentMonth THEN e.amount_local ELSE 0 END), 0) as current_month,
           COALESCE(SUM(CASE WHEN e.expense_date >= :prevMonth AND e.expense_date <= :prevMonthEnd THEN e.amount_local ELSE 0 END), 0) as previous_month
    FROM expense_categories ec
    LEFT JOIN expenses e ON e.category_id = ec.id AND e.expense_date >= :prevMonth
    WHERE ec.is_active = true ${isAdmin ? '' : 'AND ec.is_sensitive = false'}
    GROUP BY ec.name
    HAVING COALESCE(SUM(CASE WHEN e.expense_date >= :currentMonth THEN e.amount_local ELSE 0 END), 0) > 0
        OR COALESCE(SUM(CASE WHEN e.expense_date >= :prevMonth AND e.expense_date <= :prevMonthEnd THEN e.amount_local ELSE 0 END), 0) > 0
    ORDER BY current_month DESC
  `, { replacements: { currentMonth, prevMonth, prevMonthEnd }, type: QueryTypes.SELECT });

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      summary: {
        total_usd: totalUsd, total_local: parseFloat(currentSummary.total_local) || 0,
        count: parseInt(currentSummary.count) || 0, avg_usd: parseFloat(currentSummary.avg_usd) || 0,
        max_usd: parseFloat(currentSummary.max_usd) || 0, daily_burn: totalUsd / days,
        expense_to_revenue: revenue > 0 ? (totalUsd / revenue * 100) : 0,
        pct_change: Math.round(pctChange * 10) / 10
      },
      monthly_trend: monthlyTrend.map(m => ({
        month: m.month, expenses_usd: parseFloat(m.expenses_usd), expenses_local: parseFloat(m.expenses_local),
        revenue: revenueByMonth[m.month] || 0, count: parseInt(m.count)
      })),
      by_category: byCategory.map(c => ({
        category_id: c.category_id, category_name: c.category_name,
        total_usd: parseFloat(c.total_usd), total_local: parseFloat(c.total_local),
        count: parseInt(c.count), pct_of_total: catTotal > 0 ? (parseFloat(c.total_usd) / catTotal * 100) : 0
      })),
      top_vendors: topVendors.map(v => ({
        vendor: v.vendor, total_usd: parseFloat(v.total_usd), total_local: parseFloat(v.total_local), count: parseInt(v.count)
      })),
      type_split: typeSplit.map(t => ({
        type: t.expense_type, total_usd: parseFloat(t.total_usd), total_local: parseFloat(t.total_local), count: parseInt(t.count)
      })),
      ratio_trend: ratioTrend,
      largest_expenses: largestExpenses.map(e => ({
        ...e, amount_usd: parseFloat(e.amount_usd), amount_local: parseFloat(e.amount_local)
      })),
      mom_comparison: momComparison.map(m => ({
        category: m.category, current_month: parseFloat(m.current_month), previous_month: parseFloat(m.previous_month),
        change: parseFloat(m.current_month) - parseFloat(m.previous_month),
        pct_change: parseFloat(m.previous_month) > 0
          ? ((parseFloat(m.current_month) - parseFloat(m.previous_month)) / parseFloat(m.previous_month) * 100)
          : (parseFloat(m.current_month) > 0 ? 100 : 0)
      }))
    }
  });
});
