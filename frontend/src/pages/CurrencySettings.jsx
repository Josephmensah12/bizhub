import { CURRENCY_CONFIG, getCurrencyInfo } from '../config/currencyConfig';

export default function CurrencySettings() {
  const currencyConfig = CURRENCY_CONFIG;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Currency Settings</h1>
        <p className="text-gray-600 mt-2">
          Currency configuration for BizHub Inventory and Sales
        </p>
        <span className="inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
          Read-only (Phase 1)
        </span>
      </div>

      {/* Allowed Currencies */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Allowed Currencies</h2>
        <p className="text-sm text-gray-600 mb-4">
          Only these currencies are currently supported in BizHub Inventory and Sales.
        </p>
        <div className="flex flex-wrap gap-3">
          {currencyConfig.allowedCurrencies.map((currency) => (
            <div
              key={currency.code}
              className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg"
            >
              <span className="text-2xl">{currency.symbol}</span>
              <div>
                <div className="font-semibold text-gray-900">{currency.code}</div>
                <div className="text-sm text-gray-600">{currency.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default Currency Values */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Default Currency Values</h2>
        <p className="text-sm text-gray-600 mb-4">
          System defaults used when creating new inventory items and sales.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Cost Currency
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getCurrencyInfo(currencyConfig.defaultCostCurrency)?.symbol}</span>
              <div>
                <div className="font-bold text-gray-900">{currencyConfig.defaultCostCurrency}</div>
                <div className="text-xs text-gray-600">{getCurrencyInfo(currencyConfig.defaultCostCurrency)?.name}</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Inventory items usually have cost recorded in {currencyConfig.defaultCostCurrency}
            </p>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Selling Currency
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getCurrencyInfo(currencyConfig.defaultSaleCurrency)?.symbol}</span>
              <div>
                <div className="font-bold text-gray-900">{currencyConfig.defaultSaleCurrency}</div>
                <div className="text-xs text-gray-600">{getCurrencyInfo(currencyConfig.defaultSaleCurrency)?.name}</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Sales are usually priced in {getCurrencyInfo(currencyConfig.defaultSaleCurrency)?.name}
            </p>
          </div>
        </div>
      </div>

      {/* FX Markup Default */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Exchange Rate Markup</h2>
        <p className="text-sm text-gray-600 mb-4">
          Markup applied to daily market exchange rates when calculating margins.
        </p>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">💱</span>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                +{currencyConfig.defaultFxMarkup.toFixed(1)}
              </div>
              <div className="text-sm text-gray-600">Markup Adjustment</div>
            </div>
          </div>
          <p className="text-sm text-gray-700 mt-3">
            BizHub uses the daily market FX rate and adds <strong>+{currencyConfig.defaultFxMarkup}</strong> to
            reflect operational conversion costs when calculating margin.
          </p>
          <div className="mt-3 p-3 bg-white rounded border border-yellow-300">
            <p className="text-xs text-gray-700">
              <strong>Example:</strong> If market rate is 1 USD = 12.5 GHS, BizHub uses 1 USD = 13.0 GHS
              (12.5 + 0.5) for margin calculations.
            </p>
          </div>
        </div>
      </div>

      {/* Supported Exchange Rate Pairs */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Supported Exchange Rate Pairs</h2>
        <p className="text-sm text-gray-600 mb-4">
          BizHub fetches daily exchange rates for these currency pairs:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="font-semibold text-gray-900">USD ↔ GHS</div>
            <div className="text-xs text-gray-600 mt-1">US Dollar to Ghana Cedi</div>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="font-semibold text-gray-900">GBP ↔ GHS</div>
            <div className="text-xs text-gray-600 mt-1">British Pound to Ghana Cedi</div>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="font-semibold text-gray-900">USD ↔ GBP</div>
            <div className="text-xs text-gray-600 mt-1">US Dollar to British Pound</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Exchange rates are fetched daily and cached. The markup is applied automatically during sale finalization
          to ensure accurate margin calculations across different currencies.
        </p>
      </div>

      {/* Future Configuration Note */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">🔒 Configuration Locked (Phase 1)</h3>
        <p className="text-sm text-gray-600">
          In future phases, administrators will be able to:
        </p>
        <ul className="text-sm text-gray-600 mt-2 space-y-1 ml-4 list-disc">
          <li>Add or remove supported currencies</li>
          <li>Change default currency preferences</li>
          <li>Adjust the FX markup percentage</li>
          <li>Configure automatic exchange rate update schedules</li>
        </ul>
      </div>
    </div>
  );
}
