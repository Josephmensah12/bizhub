/**
 * Tests for Valuation Service
 *
 * Verifies rollup math, markup calculation, and currency conversion
 */

const { calculateMetrics, FX_MARKUP } = require('../services/valuationService');

// Test exchange rates (with markup applied for GHS conversions)
const testRates = {
  USD_GHS: 12.5 + FX_MARKUP, // 13.0
  GBP_GHS: 16.0 + FX_MARKUP, // 16.5
  GHS_USD: 1 / (12.5 + FX_MARKUP), // ~0.0769
  GBP_USD: 1 / 0.79 // ~1.266
};

describe('Valuation Service - calculateMetrics', () => {
  test('returns zero metrics for empty array', () => {
    const result = calculateMetrics([], testRates);

    expect(result.totalCost.ghs).toBe(0);
    expect(result.totalCost.usd).toBe(0);
    expect(result.totalSelling.ghs).toBe(0);
    expect(result.totalSelling.usd).toBe(0);
    expect(result.profit.ghs).toBe(0);
    expect(result.profit.usd).toBe(0);
    expect(result.markupPercent).toBeNull();
    expect(result.itemCount).toBe(0);
    expect(result.totalQuantity).toBe(0);
  });

  test('calculates single USD asset correctly', () => {
    const assets = [{
      quantity: 1,
      cost_amount: 100,
      cost_currency: 'USD',
      price_amount: 1500,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    // Cost: $100 * 13.0 = GHS 1300
    expect(result.totalCost.ghs).toBeCloseTo(1300, 2);
    expect(result.totalCost.usd).toBeCloseTo(100, 2);

    // Selling: GHS 1500
    expect(result.totalSelling.ghs).toBeCloseTo(1500, 2);

    // Profit: 1500 - 1300 = GHS 200
    expect(result.totalProfit?.ghs || result.profit.ghs).toBeCloseTo(200, 2);

    // Markup: 200 / 1300 * 100 = 15.38%
    expect(result.markupPercent).toBeCloseTo(15.38, 1);
  });

  test('handles quantity multiplier correctly', () => {
    const assets = [{
      quantity: 5,
      cost_amount: 100,
      cost_currency: 'USD',
      price_amount: 1500,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    // Cost: $100 * 5 = $500 * 13.0 = GHS 6500
    expect(result.totalCost.ghs).toBeCloseTo(6500, 2);
    expect(result.totalCost.usd).toBeCloseTo(500, 2);

    // Selling: GHS 1500 * 5 = GHS 7500
    expect(result.totalSelling.ghs).toBeCloseTo(7500, 2);

    // Profit: 7500 - 6500 = GHS 1000
    expect(result.profit.ghs).toBeCloseTo(1000, 2);

    // Total quantity
    expect(result.totalQuantity).toBe(5);
  });

  test('handles GHS cost correctly (no conversion)', () => {
    const assets = [{
      quantity: 1,
      cost_amount: 1000,
      cost_currency: 'GHS',
      price_amount: 1500,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    // Cost stays in GHS
    expect(result.totalCost.ghs).toBeCloseTo(1000, 2);

    // Profit: 1500 - 1000 = GHS 500
    expect(result.profit.ghs).toBeCloseTo(500, 2);

    // Markup: 500 / 1000 * 100 = 50%
    expect(result.markupPercent).toBeCloseTo(50, 1);
  });

  test('handles GBP cost correctly', () => {
    const assets = [{
      quantity: 1,
      cost_amount: 100,
      cost_currency: 'GBP',
      price_amount: 2000,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    // Cost: £100 * 16.5 = GHS 1650
    expect(result.totalCost.ghs).toBeCloseTo(1650, 2);

    // Profit: 2000 - 1650 = GHS 350
    expect(result.profit.ghs).toBeCloseTo(350, 2);
  });

  test('handles multiple assets correctly', () => {
    const assets = [
      {
        quantity: 2,
        cost_amount: 100,
        cost_currency: 'USD',
        price_amount: 1500,
        price_currency: 'GHS'
      },
      {
        quantity: 1,
        cost_amount: 500,
        cost_currency: 'GHS',
        price_amount: 800,
        price_currency: 'GHS'
      }
    ];

    const result = calculateMetrics(assets, testRates);

    // Asset 1: $100 * 2 = $200 * 13.0 = GHS 2600
    // Asset 2: GHS 500
    // Total Cost: GHS 3100
    expect(result.totalCost.ghs).toBeCloseTo(3100, 2);

    // Asset 1: GHS 1500 * 2 = GHS 3000
    // Asset 2: GHS 800
    // Total Selling: GHS 3800
    expect(result.totalSelling.ghs).toBeCloseTo(3800, 2);

    // Profit: 3800 - 3100 = GHS 700
    expect(result.profit.ghs).toBeCloseTo(700, 2);

    // Item count and quantity
    expect(result.itemCount).toBe(2);
    expect(result.totalQuantity).toBe(3);
  });

  test('handles missing cost correctly', () => {
    const assets = [{
      quantity: 1,
      cost_amount: null,
      cost_currency: 'USD',
      price_amount: 1500,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    expect(result.totalCost.ghs).toBe(0);
    expect(result.itemsWithCost).toBe(0);
    expect(result.itemsMissingCost).toBe(1);
    expect(result.totalSelling.ghs).toBeCloseTo(1500, 2);
  });

  test('handles missing price correctly', () => {
    const assets = [{
      quantity: 1,
      cost_amount: 100,
      cost_currency: 'USD',
      price_amount: null,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    expect(result.totalCost.ghs).toBeCloseTo(1300, 2);
    expect(result.itemsWithPrice).toBe(0);
    expect(result.itemsMissingPrice).toBe(1);
    expect(result.totalSelling.ghs).toBe(0);
  });

  test('handles zero cost (markup should be null)', () => {
    const assets = [{
      quantity: 1,
      cost_amount: 0,
      cost_currency: 'USD',
      price_amount: 1500,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    // Zero cost should not count
    expect(result.totalCost.ghs).toBe(0);
    expect(result.markupPercent).toBeNull();
  });

  test('handles negative profit correctly', () => {
    const assets = [{
      quantity: 1,
      cost_amount: 200,
      cost_currency: 'USD', // $200 * 13 = GHS 2600
      price_amount: 2000,   // Selling below cost
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    // Cost: GHS 2600
    expect(result.totalCost.ghs).toBeCloseTo(2600, 2);

    // Selling: GHS 2000
    expect(result.totalSelling.ghs).toBeCloseTo(2000, 2);

    // Profit: 2000 - 2600 = -GHS 600
    expect(result.profit.ghs).toBeCloseTo(-600, 2);

    // Markup: -600 / 2600 * 100 = -23.08%
    expect(result.markupPercent).toBeCloseTo(-23.08, 1);
  });

  test('handles default quantity (undefined = 1)', () => {
    const assets = [{
      // quantity not specified
      cost_amount: 100,
      cost_currency: 'USD',
      price_amount: 1500,
      price_currency: 'GHS'
    }];

    const result = calculateMetrics(assets, testRates);

    // Should default to quantity of 1
    expect(result.totalQuantity).toBe(1);
    expect(result.totalCost.ghs).toBeCloseTo(1300, 2);
  });

  test('handles USD selling price correctly', () => {
    const assets = [{
      quantity: 1,
      cost_amount: 100,
      cost_currency: 'USD',
      price_amount: 150,
      price_currency: 'USD'
    }];

    const result = calculateMetrics(assets, testRates);

    // Cost: $100 * 13 = GHS 1300
    expect(result.totalCost.usd).toBeCloseTo(100, 2);

    // Selling: $150 * 13 = GHS 1950
    expect(result.totalSelling.ghs).toBeCloseTo(1950, 2);
    expect(result.totalSelling.usd).toBeCloseTo(150, 2);

    // Profit: 1950 - 1300 = GHS 650
    expect(result.profit.ghs).toBeCloseTo(650, 2);
  });
});

describe('Valuation Service - FX Markup', () => {
  test('FX_MARKUP constant is 0.5', () => {
    expect(FX_MARKUP).toBe(0.5);
  });

  test('rates include markup for GHS conversions', () => {
    // Base USD/GHS rate is 12.5, with 0.5 markup = 13.0
    expect(testRates.USD_GHS).toBe(13.0);

    // Base GBP/GHS rate is 16.0, with 0.5 markup = 16.5
    expect(testRates.GBP_GHS).toBe(16.5);
  });
});
