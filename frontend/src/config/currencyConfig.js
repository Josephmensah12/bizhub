/**
 * Currency Configuration Service
 *
 * Phase 1: Static configuration with allowed currencies and defaults
 * Phase 2+: Will be fetched from backend system settings
 */

export const CURRENCY_CONFIG = {
  allowedCurrencies: [
    {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      label: 'USD — US Dollar'
    },
    {
      code: 'GHS',
      name: 'Ghana Cedi',
      symbol: '₵',
      label: 'GHS — Ghana Cedi'
    },
    {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
      label: 'GBP — British Pound'
    }
  ],
  defaultCostCurrency: 'USD',
  defaultSaleCurrency: 'GHS',
  defaultFxMarkup: 0.5,
  supportedPairs: [
    { base: 'USD', quote: 'GHS', label: 'USD ↔ GHS' },
    { base: 'GBP', quote: 'GHS', label: 'GBP ↔ GHS' },
    { base: 'USD', quote: 'GBP', label: 'USD ↔ GBP' }
  ]
};

/**
 * Get list of allowed currency codes
 */
export function getAllowedCurrencyCodes() {
  return CURRENCY_CONFIG.allowedCurrencies.map(c => c.code);
}

/**
 * Get currency info by code
 */
export function getCurrencyInfo(code) {
  return CURRENCY_CONFIG.allowedCurrencies.find(c => c.code === code) || null;
}

/**
 * Check if a currency code is valid
 */
export function isValidCurrency(code) {
  return getAllowedCurrencyCodes().includes(code);
}

/**
 * Get default cost currency
 */
export function getDefaultCostCurrency() {
  return CURRENCY_CONFIG.defaultCostCurrency;
}

/**
 * Get default sale currency
 */
export function getDefaultSaleCurrency() {
  return CURRENCY_CONFIG.defaultSaleCurrency;
}

/**
 * Get FX markup value
 */
export function getFxMarkup() {
  return CURRENCY_CONFIG.defaultFxMarkup;
}

/**
 * Format amount with currency symbol
 */
export function formatMoney(amount, currencyCode) {
  if (amount == null || amount === '') return 'N/A';

  const currency = getCurrencyInfo(currencyCode);
  const num = parseFloat(amount);

  if (isNaN(num)) return 'N/A';

  return `${currency?.symbol || currencyCode} ${num.toFixed(2)}`;
}

export default CURRENCY_CONFIG;
