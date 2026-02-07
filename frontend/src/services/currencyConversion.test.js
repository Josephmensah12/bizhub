/**
 * Tests for Currency Conversion Service
 *
 * Run with: npm test -- currencyConversion.test.js
 */

import {
  formatCurrency,
  formatProfit,
  formatMarkup,
  calculateProfitAndMarkup,
  convertCurrency
} from './currencyConversion';

// Mock axios for testing
jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({
    data: {
      data: {
        rate: 12.5 // Base rate without markup
      }
    }
  }))
}));

describe('Currency Conversion Service', () => {
  describe('formatCurrency', () => {
    it('formats USD correctly', () => {
      expect(formatCurrency(1500.50, 'USD')).toBe('USD 1,500.50');
    });

    it('formats GHS correctly', () => {
      expect(formatCurrency(5000, 'GHS')).toBe('GHS 5,000.00');
    });

    it('formats GBP correctly', () => {
      expect(formatCurrency(1234.56, 'GBP')).toBe('GBP 1,234.56');
    });

    it('returns null for null amount', () => {
      expect(formatCurrency(null, 'USD')).toBe(null);
    });

    it('returns null for invalid amount', () => {
      expect(formatCurrency('invalid', 'USD')).toBe(null);
    });
  });

  describe('calculateProfitAndMarkup', () => {
    it('calculates profit and markup for USD cost + GHS selling', async () => {
      // Cost: USD 150, Selling: GHS 5000
      // fxRateUsed = 12.5 + 0.5 = 13.0 (markup applied for USD→GHS)
      // costInGHS = 150 * 13.0 = 1950
      // profitGHS = 5000 - 1950 = 3050
      // markupPercent = (3050 / 1950) * 100 = 156.4%

      const result = await calculateProfitAndMarkup(150, 'USD', 5000, 'GHS');

      expect(result.error).toBe(null);
      expect(result.profit.currency).toBe('GHS');
      expect(result.profit.amount).toBeCloseTo(3050, 0);
      expect(result.profit.equivalentCurrency).toBe('USD');
      expect(result.markup.percent).toBeCloseTo(156.4, 0);
    });

    it('calculates for same currency (GHS cost + GHS selling)', async () => {
      // Cost: GHS 2000, Selling: GHS 5000
      // profitGHS = 5000 - 2000 = 3000
      // markupPercent = (3000 / 2000) * 100 = 150%

      const result = await calculateProfitAndMarkup(2000, 'GHS', 5000, 'GHS');

      expect(result.error).toBe(null);
      expect(result.profit.currency).toBe('GHS');
      expect(result.profit.amount).toBe(3000);
      expect(result.profit.equivalentCurrency).toBe(null); // Same currency, no equivalent
      expect(result.markup.percent).toBe(150);
    });

    it('handles missing cost amount', async () => {
      const result = await calculateProfitAndMarkup(null, 'USD', 5000, 'GHS');

      expect(result.error).toBe('Missing cost');
      expect(result.profit).toBe(null);
      expect(result.markup).toBe(null);
    });

    it('handles missing selling price', async () => {
      const result = await calculateProfitAndMarkup(150, 'USD', null, 'GHS');

      expect(result.error).toBe('Missing selling price');
      expect(result.profit).toBe(null);
      expect(result.markup).toBe(null);
    });

    it('handles zero cost (divide by zero)', async () => {
      const result = await calculateProfitAndMarkup(0, 'USD', 5000, 'GHS');

      expect(result.error).toBe('Missing cost');
      expect(result.profit).toBe(null);
      expect(result.markup).toBe(null);
    });

    it('handles negative profit (loss)', async () => {
      // Cost: USD 500, Selling: GHS 5000
      // costInGHS = 500 * 13.0 = 6500
      // profitGHS = 5000 - 6500 = -1500 (loss)

      const result = await calculateProfitAndMarkup(500, 'USD', 5000, 'GHS');

      expect(result.error).toBe(null);
      expect(result.profit.amount).toBeLessThan(0);
      expect(result.markup.percent).toBeLessThan(0);
    });
  });

  describe('formatProfit', () => {
    it('formats profit with equivalent currency', () => {
      const profitData = {
        amount: 3050,
        currency: 'GHS',
        equivalentAmount: 234.62,
        equivalentCurrency: 'USD'
      };

      const result = formatProfit(profitData);
      expect(result).toBe('GHS 3,050.00 (≈ USD 234.62)');
    });

    it('formats profit without equivalent (same currency)', () => {
      const profitData = {
        amount: 3000,
        currency: 'GHS',
        equivalentAmount: null,
        equivalentCurrency: null
      };

      const result = formatProfit(profitData);
      expect(result).toBe('GHS 3,000.00');
    });

    it('returns dash for null profit', () => {
      expect(formatProfit(null)).toBe('—');
    });

    it('returns dash for missing amount', () => {
      expect(formatProfit({ amount: null })).toBe('—');
    });
  });

  describe('formatMarkup', () => {
    it('formats markup percentage with 1 decimal', () => {
      const markupData = { percent: 156.41 };
      expect(formatMarkup(markupData)).toBe('156.4%');
    });

    it('formats zero markup', () => {
      const markupData = { percent: 0 };
      expect(formatMarkup(markupData)).toBe('0.0%');
    });

    it('formats negative markup (loss)', () => {
      const markupData = { percent: -23.08 };
      expect(formatMarkup(markupData)).toBe('-23.1%');
    });

    it('returns dash for null markup', () => {
      expect(formatMarkup(null)).toBe('—');
    });

    it('returns dash for missing percent', () => {
      expect(formatMarkup({ percent: null })).toBe('—');
    });
  });
});
