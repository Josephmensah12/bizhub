/**
 * Exchange Rate Service
 *
 * Fetches and caches exchange rates for supported currency pairs.
 * Uses open.er-api.com (free, no key needed) with daily caching.
 * Falls back to hardcoded rates if API fails.
 */

const { ExchangeRateCache } = require('../models');
const https = require('https');

// Fallback rates (only used if API is unreachable)
const FALLBACK_RATES = {
  'USD_GHS': 11.0,
  'GHS_USD': 1 / 11.0,
  'GBP_GHS': 14.0,
  'GHS_GBP': 1 / 14.0,
  'USD_GBP': 0.79,
  'GBP_USD': 1 / 0.79
};

/**
 * Fetch live rates from open.er-api.com
 */
function fetchLiveRates(baseCurrency) {
  return new Promise((resolve, reject) => {
    const url = `https://open.er-api.com/v6/latest/${baseCurrency}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result === 'success' && json.rates) {
            resolve(json.rates);
          } else {
            reject(new Error('API returned unexpected response'));
          }
        } catch (e) {
          reject(new Error('Failed to parse exchange rate API response'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Get exchange rate for a currency pair.
 * Checks cache first, then fetches live rate, falls back to hardcoded.
 */
async function getExchangeRate(baseCurrency, quoteCurrency, rateDate = null) {
  if (baseCurrency === quoteCurrency) return 1;

  const today = rateDate ? new Date(rateDate) : new Date();
  const dateStr = today.toISOString().split('T')[0];

  // Try cache first
  const cached = await ExchangeRateCache.findOne({
    where: {
      base_currency: baseCurrency,
      quote_currency: quoteCurrency,
      rate_date: dateStr
    }
  });

  if (cached) {
    return parseFloat(cached.rate);
  }

  // Fetch live rate
  let rate = null;
  let source = 'fallback';

  try {
    const rates = await fetchLiveRates(baseCurrency);
    if (rates[quoteCurrency]) {
      rate = rates[quoteCurrency];
      source = 'open.er-api.com';

      // Cache all supported pairs from this response
      const supportedQuotes = ['USD', 'GHS', 'GBP'].filter(c => c !== baseCurrency);
      for (const quote of supportedQuotes) {
        if (rates[quote]) {
          await ExchangeRateCache.upsert({
            base_currency: baseCurrency,
            quote_currency: quote,
            rate: rates[quote],
            rate_date: dateStr,
            source: 'open.er-api.com',
            fetched_at: new Date()
          }).catch(() => {}); // Ignore upsert conflicts
        }
      }
    }
  } catch (err) {
    console.warn(`Exchange rate API failed for ${baseCurrency}/${quoteCurrency}:`, err.message);
  }

  // Fallback to hardcoded
  if (!rate) {
    const pairKey = `${baseCurrency}_${quoteCurrency}`;
    rate = FALLBACK_RATES[pairKey];
    source = 'fallback';

    if (!rate) {
      throw new Error(`Exchange rate not available for ${baseCurrency}/${quoteCurrency}`);
    }
  }

  // Cache the rate
  await ExchangeRateCache.upsert({
    base_currency: baseCurrency,
    quote_currency: quoteCurrency,
    rate: rate,
    rate_date: dateStr,
    source,
    fetched_at: new Date()
  }).catch(() => {});

  return rate;
}

/**
 * Get the latest exchange rate with metadata
 */
async function getLatestRate(baseCurrency, quoteCurrency) {
  const rate = await getExchangeRate(baseCurrency, quoteCurrency);

  // Find the cached entry for source info
  const dateStr = new Date().toISOString().split('T')[0];
  const cached = await ExchangeRateCache.findOne({
    where: {
      base_currency: baseCurrency,
      quote_currency: quoteCurrency,
      rate_date: dateStr
    }
  });

  return {
    baseCurrency,
    quoteCurrency,
    rate,
    source: cached?.source || 'unknown',
    date: dateStr,
    fetchedAt: cached?.fetched_at || new Date()
  };
}

/**
 * Convert amount between currencies
 */
async function convertAmount(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
}

/**
 * Get all cached rates for a specific date
 */
async function getCachedRates(date = null) {
  const targetDate = date || new Date();
  const dateStr = targetDate.toISOString().split('T')[0];

  return await ExchangeRateCache.findAll({
    where: { rate_date: dateStr },
    order: [['created_at', 'DESC']]
  });
}

module.exports = {
  getExchangeRate,
  getLatestRate,
  convertAmount,
  getCachedRates
};
