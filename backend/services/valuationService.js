/**
 * Inventory Valuation Service
 *
 * Computes inventory totals for cost, selling value, profit, and markup
 * with cascading breakdown by Category and Asset Type
 */

const { Asset } = require('../models');
const { getExchangeRate } = require('./exchangeRateService');
const { Op, Sequelize } = require('sequelize');

// FX Markup applied to conversions
const FX_MARKUP = 0.5;

/**
 * Get exchange rate with markup for conversion to GHS
 * Markup is only applied when converting TO GHS
 */
async function getRateWithMarkup(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;

  const baseRate = await getExchangeRate(fromCurrency, toCurrency);

  // Apply markup only when converting TO GHS
  return toCurrency === 'GHS' ? baseRate + FX_MARKUP : baseRate;
}

/**
 * Convert amount to target currency with markup
 */
async function convertWithMarkup(amount, fromCurrency, toCurrency) {
  if (!amount || fromCurrency === toCurrency) return amount || 0;

  const rate = await getRateWithMarkup(fromCurrency, toCurrency);
  return amount * rate;
}

/**
 * Calculate valuation metrics for a set of assets
 * @param {Array} assets - Array of asset records
 * @param {Object} rates - Pre-fetched rates object { USD_GHS, GBP_GHS, GHS_USD, etc. }
 * @returns {Object} Valuation metrics
 */
function calculateMetrics(assets, rates) {
  let totalCostGHS = 0;
  let totalCostUSD = 0;
  let totalSellingGHS = 0;
  let totalSellingUSD = 0;
  let itemsWithCost = 0;
  let itemsWithPrice = 0;
  let itemsMissingCost = 0;
  let itemsMissingPrice = 0;
  let totalQuantity = 0;

  for (const asset of assets) {
    const qty = asset.quantity || 1;
    totalQuantity += qty;

    // Process cost
    if (asset.cost_amount && parseFloat(asset.cost_amount) > 0) {
      const costAmount = parseFloat(asset.cost_amount) * qty;
      const costCurrency = asset.cost_currency || 'USD';

      // Convert to GHS
      if (costCurrency === 'GHS') {
        totalCostGHS += costAmount;
        totalCostUSD += costAmount / rates.GHS_USD;
      } else if (costCurrency === 'USD') {
        totalCostGHS += costAmount * rates.USD_GHS;
        totalCostUSD += costAmount;
      } else if (costCurrency === 'GBP') {
        totalCostGHS += costAmount * rates.GBP_GHS;
        totalCostUSD += costAmount * rates.GBP_USD;
      }

      itemsWithCost++;
    } else {
      itemsMissingCost++;
    }

    // Process selling price
    if (asset.price_amount && parseFloat(asset.price_amount) > 0) {
      const priceAmount = parseFloat(asset.price_amount) * qty;
      const priceCurrency = asset.price_currency || 'GHS';

      // Convert to GHS
      if (priceCurrency === 'GHS') {
        totalSellingGHS += priceAmount;
        totalSellingUSD += priceAmount / rates.GHS_USD;
      } else if (priceCurrency === 'USD') {
        totalSellingGHS += priceAmount * rates.USD_GHS;
        totalSellingUSD += priceAmount;
      } else if (priceCurrency === 'GBP') {
        totalSellingGHS += priceAmount * rates.GBP_GHS;
        totalSellingUSD += priceAmount * rates.GBP_USD;
      }

      itemsWithPrice++;
    } else {
      itemsMissingPrice++;
    }
  }

  // Calculate profit
  const profitGHS = totalSellingGHS - totalCostGHS;
  const profitUSD = totalSellingUSD - totalCostUSD;

  // Calculate markup % (profit / cost)
  let markupPercent = null;
  if (totalCostGHS > 0) {
    markupPercent = (profitGHS / totalCostGHS) * 100;
  }

  return {
    totalCost: {
      ghs: totalCostGHS,
      usd: totalCostUSD
    },
    totalSelling: {
      ghs: totalSellingGHS,
      usd: totalSellingUSD
    },
    profit: {
      ghs: profitGHS,
      usd: profitUSD
    },
    markupPercent,
    itemCount: assets.length,
    totalQuantity,
    itemsWithCost,
    itemsWithPrice,
    itemsMissingCost,
    itemsMissingPrice
  };
}

/**
 * Get valuation summary with cascading breakdown
 * @param {Object} filters - Optional filters (category, assetType, status, etc.)
 * @returns {Promise<Object>} Valuation summary
 */
async function getValuationSummary(filters = {}) {
  // Build where clause from filters (handle comma-separated multi-select)
  const where = {};

  if (filters.category) {
    const categories = filters.category.split(',').map(c => c.trim()).filter(Boolean);
    where.category = categories.length === 1 ? categories[0] : { [Op.in]: categories };
  }
  if (filters.assetType) {
    const types = filters.assetType.split(',').map(t => t.trim()).filter(Boolean);
    where.asset_type = types.length === 1 ? types[0] : { [Op.in]: types };
  }
  if (filters.status) {
    const statuses = filters.status.split(',').map(s => s.trim()).filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { [Op.in]: statuses };
  }
  if (filters.condition) {
    const conditions = filters.condition.split(',').map(c => c.trim()).filter(Boolean);
    where.condition = conditions.length === 1 ? conditions[0] : { [Op.in]: conditions };
  }
  if (filters.make) {
    const makes = filters.make.split(',').map(m => m.trim()).filter(Boolean);
    if (makes.length === 1) {
      where.make = { [Op.iLike]: `%${makes[0]}%` };
    } else {
      where.make = { [Op.or]: makes.map(m => ({ [Op.iLike]: `%${m}%` })) };
    }
  }

  // Fetch all assets matching filters
  const assets = await Asset.findAll({
    where,
    attributes: [
      'id', 'category', 'asset_type', 'quantity',
      'cost_amount', 'cost_currency',
      'price_amount', 'price_currency'
    ],
    raw: true
  });

  // Pre-fetch exchange rates (with markup for GHS conversions)
  const rates = {
    USD_GHS: await getRateWithMarkup('USD', 'GHS'),
    GBP_GHS: await getRateWithMarkup('GBP', 'GHS'),
    GHS_USD: await getRateWithMarkup('GHS', 'USD'),
    GBP_USD: await getRateWithMarkup('GBP', 'USD')
  };

  // Calculate overall totals
  const overall = calculateMetrics(assets, rates);

  // Group assets by category
  const assetsByCategory = {};
  for (const asset of assets) {
    const category = asset.category || 'Uncategorized';
    if (!assetsByCategory[category]) {
      assetsByCategory[category] = [];
    }
    assetsByCategory[category].push(asset);
  }

  // Calculate category breakdowns
  const byCategory = {};
  for (const [category, categoryAssets] of Object.entries(assetsByCategory)) {
    const categoryMetrics = calculateMetrics(categoryAssets, rates);

    // Group by asset type within category
    const assetsByType = {};
    for (const asset of categoryAssets) {
      const assetType = asset.asset_type || 'Unknown';
      if (!assetsByType[assetType]) {
        assetsByType[assetType] = [];
      }
      assetsByType[assetType].push(asset);
    }

    // Calculate asset type breakdowns
    const byAssetType = {};
    for (const [assetType, typeAssets] of Object.entries(assetsByType)) {
      byAssetType[assetType] = calculateMetrics(typeAssets, rates);
    }

    byCategory[category] = {
      ...categoryMetrics,
      byAssetType
    };
  }

  // Get FX metadata
  const baseUsdGhs = await getExchangeRate('USD', 'GHS');
  const baseGbpGhs = await getExchangeRate('GBP', 'GHS');

  return {
    overall,
    byCategory,
    fx: {
      rates: {
        USD_GHS: rates.USD_GHS,
        GBP_GHS: rates.GBP_GHS,
        GHS_USD: rates.GHS_USD
      },
      baseRates: {
        USD_GHS: baseUsdGhs,
        GBP_GHS: baseGbpGhs
      },
      markup: FX_MARKUP,
      date: new Date().toISOString().split('T')[0],
      note: 'Rates include 0.5 markup for GHS conversions'
    }
  };
}

module.exports = {
  getValuationSummary,
  calculateMetrics,
  getRateWithMarkup,
  convertWithMarkup,
  FX_MARKUP
};
