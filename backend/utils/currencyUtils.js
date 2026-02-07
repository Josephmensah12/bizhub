/**
 * Currency utilities for BizHub
 * Only USD, GHS, and GBP are supported
 */

const ALLOWED_CURRENCIES = ['USD', 'GHS', 'GBP'];

const CURRENCY_INFO = {
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    label: 'USD — US Dollar'
  },
  GHS: {
    code: 'GHS',
    name: 'Ghana Cedi',
    symbol: '₵',
    label: 'GHS — Ghana Cedi'
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    label: 'GBP — British Pound'
  }
};

/**
 * Check if a currency code is valid
 */
function isValidCurrency(code) {
  return code && ALLOWED_CURRENCIES.includes(code.toUpperCase());
}

/**
 * Validate currency and return normalized code or throw error
 */
function validateCurrency(code, fieldName = 'currency') {
  if (!code) {
    throw new Error(`${fieldName} is required`);
  }

  const normalized = code.toUpperCase();

  if (!isValidCurrency(normalized)) {
    throw new Error(
      `Invalid ${fieldName}: ${code}. Must be one of: ${ALLOWED_CURRENCIES.join(', ')}`
    );
  }

  return normalized;
}

/**
 * Get currency info
 */
function getCurrencyInfo(code) {
  const normalized = code?.toUpperCase();
  return CURRENCY_INFO[normalized] || null;
}

/**
 * Get all allowed currencies with info
 */
function getAllCurrencies() {
  return ALLOWED_CURRENCIES.map(code => CURRENCY_INFO[code]);
}

/**
 * Format amount with currency
 */
function formatMoney(amount, currencyCode) {
  if (amount == null || amount === '') return null;

  const info = getCurrencyInfo(currencyCode);
  const num = parseFloat(amount);

  if (isNaN(num)) return null;

  return `${info?.symbol || currencyCode} ${num.toFixed(2)}`;
}

module.exports = {
  ALLOWED_CURRENCIES,
  CURRENCY_INFO,
  isValidCurrency,
  validateCurrency,
  getCurrencyInfo,
  getAllCurrencies,
  formatMoney
};
