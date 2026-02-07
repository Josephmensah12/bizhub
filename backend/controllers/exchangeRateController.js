/**
 * Exchange Rate Controller
 *
 * Handles API requests for exchange rates
 */

const exchangeRateService = require('../services/exchangeRateService');

/**
 * Get latest exchange rate for a currency pair
 * GET /api/v1/exchange-rates/latest?base=USD&quote=GHS
 */
async function getLatestRate(req, res) {
  try {
    const { base, quote } = req.query;

    if (!base || !quote) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Base and quote currencies are required',
          code: 'MISSING_PARAMETERS'
        }
      });
    }

    // Validate currencies
    const allowedCurrencies = ['USD', 'GHS', 'GBP'];
    if (!allowedCurrencies.includes(base) || !allowedCurrencies.includes(quote)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid currency. Only USD, GHS, and GBP are supported.',
          code: 'INVALID_CURRENCY'
        }
      });
    }

    const rateInfo = await exchangeRateService.getLatestRate(base, quote);

    res.json({
      success: true,
      data: rateInfo
    });
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch exchange rate',
        code: 'RATE_FETCH_ERROR'
      }
    });
  }
}

/**
 * Convert amount between currencies
 * POST /api/v1/exchange-rates/convert
 * Body: { amount, from, to }
 */
async function convertCurrency(req, res) {
  try {
    const { amount, from, to } = req.body;

    if (!amount || !from || !to) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Amount, from, and to currencies are required',
          code: 'MISSING_PARAMETERS'
        }
      });
    }

    const allowedCurrencies = ['USD', 'GHS', 'GBP'];
    if (!allowedCurrencies.includes(from) || !allowedCurrencies.includes(to)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid currency. Only USD, GHS, and GBP are supported.',
          code: 'INVALID_CURRENCY'
        }
      });
    }

    const rate = await exchangeRateService.getExchangeRate(from, to);
    const converted = await exchangeRateService.convertAmount(amount, from, to);

    res.json({
      success: true,
      data: {
        amount: parseFloat(amount),
        from,
        to,
        rate,
        converted: parseFloat(converted.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error converting currency:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to convert currency',
        code: 'CONVERSION_ERROR'
      }
    });
  }
}

/**
 * Get cached rates for today
 * GET /api/v1/exchange-rates/cached
 */
async function getCachedRates(req, res) {
  try {
    const rates = await exchangeRateService.getCachedRates();

    res.json({
      success: true,
      data: {
        rates,
        count: rates.length
      }
    });
  } catch (error) {
    console.error('Error fetching cached rates:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to fetch cached rates',
        code: 'CACHE_FETCH_ERROR'
      }
    });
  }
}

module.exports = {
  getLatestRate,
  convertCurrency,
  getCachedRates
};
