/**
 * Exchange Rate Service
 *
 * Fetches and caches exchange rates for supported currency pairs
 * Phase 1: Uses hardcoded rates (can be replaced with external API in Phase 2)
 */

const { ExchangeRateCache } = require('../models');
const { Op } = require('sequelize');

// Hardcoded rates for Phase 1 (base rates without markup)
const HARDCODED_RATES = {
  'USD_GHS': 12.5,
  'GHS_USD': 1 / 12.5,
  'GBP_GHS': 16.0,
  'GHS_GBP': 1 / 16.0,
  'USD_GBP': 0.79,
  'GBP_USD': 1 / 0.79
};

/**
 * Get exchange rate for a currency pair
 * @param {string} baseCurrency - Base currency code
 * @param {string} quoteCurrency - Quote currency code
 * @param {Date} rateDate - Date for the rate (defaults to today)
 * @returns {Promise<number>} Exchange rate
 */
async function getExchangeRate(baseCurrency, quoteCurrency, rateDate = null) {
  // Same currency = 1
  if (baseCurrency === quoteCurrency) {
    return 1;
  }

  const today = rateDate || new Date();
  today.setHours(0, 0, 0, 0);

  // Try to get from cache
  const cached = await ExchangeRateCache.findOne({
    where: {
      base_currency: baseCurrency,
      quote_currency: quoteCurrency,
      rate_date: today
    }
  });

  if (cached) {
    return parseFloat(cached.rate);
  }

  // Fetch new rate (using hardcoded rates for Phase 1)
  const pairKey = `${baseCurrency}_${quoteCurrency}`;
  const rate = HARDCODED_RATES[pairKey];

  if (!rate) {
    throw new Error(`Exchange rate not available for ${baseCurrency}/${quoteCurrency}`);
  }

  // Cache the rate
  await ExchangeRateCache.create({
    base_currency: baseCurrency,
    quote_currency: quoteCurrency,
    rate: rate,
    rate_date: today,
    source: 'hardcoded',
    fetched_at: new Date()
  });

  return rate;
}

/**
 * Get the latest exchange rate (with caching)
 * @param {string} baseCurrency
 * @param {string} quoteCurrency
 * @returns {Promise<Object>} Rate info with metadata
 */
async function getLatestRate(baseCurrency, quoteCurrency) {
  const rate = await getExchangeRate(baseCurrency, quoteCurrency);

  return {
    baseCurrency,
    quoteCurrency,
    rate,
    source: 'hardcoded',
    date: new Date().toISOString().split('T')[0],
    note: 'Phase 1: Using hardcoded rates. Will integrate live API in Phase 2.'
  };
}

/**
 * Convert amount between currencies
 * @param {number} amount
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @returns {Promise<number>} Converted amount
 */
async function convertAmount(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
}

/**
 * Get all cached rates for a specific date
 * @param {Date} date
 * @returns {Promise<Array>} Cached rates
 */
async function getCachedRates(date = null) {
  const targetDate = date || new Date();
  targetDate.setHours(0, 0, 0, 0);

  return await ExchangeRateCache.findAll({
    where: {
      rate_date: targetDate
    },
    order: [['created_at', 'DESC']]
  });
}

module.exports = {
  getExchangeRate,
  getLatestRate,
  convertAmount,
  getCachedRates
};
