const { Asset } = require('../models');
const { Op } = require('sequelize');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
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

  res.json({
    success: true,
    data: {
      today_sales: {
        total_amount: 0,
        transaction_count: 0
      },
      inventory_on_hand: {
        total_units: totalAssets,
        ready_for_sale: inStockAssets,
        processing: reservedAssets,
        sold: soldAssets,
        in_repair: inRepairAssets,
        total_value: parseFloat(inventoryValue).toFixed(2)
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
      lead_source_breakdown: [
        { source: 'Instagram', count: 0, percentage: 0 },
        { source: 'Walk-in', count: 0, percentage: 0 },
        { source: 'Referral', count: 0, percentage: 0 }
      ],
      aging_stock: {
        '30_days': agingUnder30,
        '60_days': aging30to60,
        '90_days': aging60to90,
        '90_plus_days': aging90Plus
      }
    }
  });
});

module.exports = exports;
