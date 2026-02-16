const { Asset, Invoice } = require('../models');
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

  // Get aging stock (assets created more than 30/60/90 days ago)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const agingUnder30 = await Asset.count({
    where: {
      status: 'In Stock',
      created_at: { [Op.gte]: thirtyDaysAgo }
    }
  });

  const aging30to60 = await Asset.count({
    where: {
      status: 'In Stock',
      created_at: {
        [Op.gte]: sixtyDaysAgo,
        [Op.lt]: thirtyDaysAgo
      }
    }
  });

  const aging60to90 = await Asset.count({
    where: {
      status: 'In Stock',
      created_at: {
        [Op.gte]: ninetyDaysAgo,
        [Op.lt]: sixtyDaysAgo
      }
    }
  });

  const aging90Plus = await Asset.count({
    where: {
      status: 'In Stock',
      created_at: { [Op.lt]: ninetyDaysAgo }
    }
  });

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

  // Build response
  const data = {
    today_sales: {
      total_amount: parseFloat(todayTotalAmount.toFixed(2)),
      collected: parseFloat(todayCollected.toFixed(2)),
      transaction_count: todayInvoices.length
    },
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
      '30_days': agingUnder30,
      '60_days': aging30to60,
      '90_days': aging60to90,
      '90_plus_days': aging90Plus
    }
  };

  // Only include total_value for roles that can see cost
  if (canSeeCost(role)) {
    data.inventory_on_hand.total_value = parseFloat(inventoryValue).toFixed(2);
  }

  res.json({ success: true, data });
});

module.exports = exports;
