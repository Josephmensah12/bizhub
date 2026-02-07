import axios from 'axios';

/**
 * Currency Conversion Service
 *
 * Fetches exchange rates and performs conversions with markup
 */

const FX_MARKUP = 0.5;

// Cache for exchange rates (simple in-memory cache)
const rateCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Get exchange rate from cache or API
 * Markup is only applied when converting TO GHS (buy direction)
 */
async function getExchangeRate(baseCurrency, quoteCurrency) {
  // Same currency = rate of 1
  if (baseCurrency === quoteCurrency) {
    return 1;
  }

  const cacheKey = `${baseCurrency}_${quoteCurrency}`;
  const cached = rateCache.get(cacheKey);

  // Check cache
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.rate;
  }

  try {
    // Try to fetch from backend
    const response = await axios.get('/api/v1/exchange-rates/latest', {
      params: {
        base: baseCurrency,
        quote: quoteCurrency
      }
    });

    const fetchedRate = parseFloat(response.data.data.rate);

    // Only apply markup when converting TO GHS (buy direction)
    // This represents the cost of buying foreign currency
    const finalRate = quoteCurrency === 'GHS'
      ? fetchedRate + FX_MARKUP
      : fetchedRate;

    // Cache the result
    rateCache.set(cacheKey, {
      rate: finalRate,
      timestamp: Date.now()
    });

    return finalRate;
  } catch (error) {
    console.error('Failed to fetch exchange rate:', error);

    // Fallback rates - markup only applied to GHS conversions
    const baseRates = {
      'USD_GHS': 12.5,
      'GBP_GHS': 16.0,
      'USD_GBP': 0.79,
      'GBP_USD': 1.27
    };

    // Get base rate or calculate inverse
    let rate = baseRates[cacheKey];
    if (!rate) {
      const inverseKey = `${quoteCurrency}_${baseCurrency}`;
      const inverseRate = baseRates[inverseKey];
      if (inverseRate) {
        rate = 1 / inverseRate;
      }
    }

    if (!rate) return 1;

    // Apply markup only when converting TO GHS
    return quoteCurrency === 'GHS' ? rate + FX_MARKUP : rate;
  }
}

/**
 * Convert amount from one currency to another
 */
export async function convertCurrency(amount, fromCurrency, toCurrency) {
  if (!amount || amount <= 0) return null;
  if (fromCurrency === toCurrency) return amount;

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
}

/**
 * Format currency amount with symbol and 2 decimals
 */
export function formatCurrency(amount, currencyCode) {
  if (amount == null || amount === '') return null;

  const num = parseFloat(amount);
  if (isNaN(num)) return null;

  const symbols = {
    USD: '$',
    GHS: '₵',
    GBP: '£'
  };

  const symbol = symbols[currencyCode] || currencyCode;

  // Format with commas and 2 decimals
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return `${currencyCode} ${formatted}`;
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currencyCode) {
  const symbols = {
    USD: '$',
    GHS: '₵',
    GBP: '£'
  };
  return symbols[currencyCode] || currencyCode;
}

/**
 * Format amount with equivalent in brackets
 * Returns: "USD 150.00 (≈ GHS 1,950.00)" or just "USD 150.00" if same currency
 */
export async function formatWithEquivalent(amount, currencyCode, equivalentCurrency) {
  if (!amount || !currencyCode) return null;
  if (currencyCode === equivalentCurrency) {
    return formatCurrency(amount, currencyCode);
  }

  const primary = formatCurrency(amount, currencyCode);
  const converted = await convertCurrency(amount, currencyCode, equivalentCurrency);

  if (!converted) return primary;

  const equivalent = formatCurrency(converted, equivalentCurrency);
  return `${primary} (≈ ${equivalent})`;
}

/**
 * Calculate profit and markup for an asset
 * @param {number} costAmount - Cost amount in cost currency
 * @param {string} costCurrency - Cost currency code
 * @param {number} sellingAmount - Selling price in selling currency
 * @param {string} sellingCurrency - Selling currency code
 * @returns {Promise<Object>} Profit and markup data
 */
export async function calculateProfitAndMarkup(costAmount, costCurrency, sellingAmount, sellingCurrency) {
  // Validate inputs
  if (!sellingAmount || sellingAmount <= 0) {
    return { profit: null, markup: null, error: 'Missing selling price' };
  }
  if (!costAmount || costAmount <= 0) {
    return { profit: null, markup: null, error: 'Missing cost' };
  }
  if (!costCurrency || !sellingCurrency) {
    return { profit: null, markup: null, error: 'Missing currency' };
  }

  // Convert cost to selling currency
  const costInSellingCurrency = await convertCurrency(costAmount, costCurrency, sellingCurrency);

  if (costInSellingCurrency == null) {
    return { profit: null, markup: null, error: 'Conversion failed' };
  }

  // Calculate profit in selling currency
  const profitInSellingCurrency = sellingAmount - costInSellingCurrency;

  // Calculate profit in cost currency (for display as equivalent)
  let profitInCostCurrency = null;
  if (costCurrency !== sellingCurrency) {
    profitInCostCurrency = await convertCurrency(profitInSellingCurrency, sellingCurrency, costCurrency);
  }

  // Calculate markup percentage: (profit / cost) * 100
  // Use cost in selling currency for consistency
  let markupPercent = null;
  if (costInSellingCurrency > 0) {
    markupPercent = (profitInSellingCurrency / costInSellingCurrency) * 100;
  }

  return {
    profit: {
      amount: profitInSellingCurrency,
      currency: sellingCurrency,
      equivalentAmount: profitInCostCurrency,
      equivalentCurrency: costCurrency !== sellingCurrency ? costCurrency : null
    },
    markup: {
      percent: markupPercent,
      costInSellingCurrency
    },
    error: null
  };
}

/**
 * Format profit with equivalent currency
 * @returns {string} Formatted profit string like "GHS 3,050.00 (≈ USD 238.28)"
 */
export function formatProfit(profitData) {
  if (!profitData || profitData.amount == null) return '—';

  const primary = formatCurrency(profitData.amount, profitData.currency);
  if (!primary) return '—';

  // If same currency or no equivalent, just return primary
  if (!profitData.equivalentCurrency || profitData.equivalentAmount == null) {
    return primary;
  }

  const equivalent = formatCurrency(profitData.equivalentAmount, profitData.equivalentCurrency);
  return `${primary} (≈ ${equivalent})`;
}

/**
 * Format markup percentage
 * @returns {string} Formatted markup like "160.4%"
 */
export function formatMarkup(markupData) {
  if (!markupData || markupData.percent == null) return '—';

  // Format with 1 decimal place
  return `${markupData.percent.toFixed(1)}%`;
}

export default {
  convertCurrency,
  formatCurrency,
  formatWithEquivalent,
  getCurrencySymbol,
  calculateProfitAndMarkup,
  formatProfit,
  formatMarkup
};
