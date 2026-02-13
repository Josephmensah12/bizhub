import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash/debounce';

function formatCurrency(amount, currency = 'GHS') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(amount);
}

export default function InventoryPickerModal({ open, onClose, onAddItems, invoiceId, existingItems = [] }) {
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selected, setSelected] = useState(new Map()); // Map<assetId, asset>

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelected(new Map());
      fetchAssets('');
    }
  }, [open]);

  const fetchAssets = async (query) => {
    try {
      setLoading(true);
      const params = { limit: 30 };
      if (query) params.search = query;
      if (invoiceId) params.excludeInvoiceId = invoiceId;
      const response = await axios.get('/api/v1/invoices/available-assets', { params });

      // Filter out assets already fully used on invoice
      const usedQtyByAssetId = {};
      existingItems.forEach(i => {
        usedQtyByAssetId[i.asset_id] = (usedQtyByAssetId[i.asset_id] || 0) + i.quantity;
      });

      const available = response.data.data.assets.filter(a => {
        const totalAvailable = a.available_quantity != null ? Number(a.available_quantity) : (a.quantity || 1);
        const usedOnInvoice = usedQtyByAssetId[a.id] || 0;
        return (totalAvailable - usedOnInvoice) > 0;
      });

      setAssets(available);
    } catch (err) {
      console.error('Asset fetch error:', err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce((query) => fetchAssets(query), 300),
    [invoiceId] // existingItems filtering happens post-fetch, no need to recreate debounce
  );

  // Cleanup debounce on unmount
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    debouncedSearch(val);
  };

  const toggleSelect = (asset) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.set(asset.id, asset);
      }
      return next;
    });
  };

  const handleDone = () => {
    onAddItems(Array.from(selected.values()));
    onClose();
  };

  if (!open) return null;

  // Compute remaining qty for display
  const usedQtyByAssetId = {};
  existingItems.forEach(i => {
    usedQtyByAssetId[i.asset_id] = (usedQtyByAssetId[i.asset_id] || 0) + i.quantity;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-2xl bg-white sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Select Inventory</h2>
            {selected.size > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary-100 text-primary-700">
                {selected.size}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by asset tag, serial, make/model..."
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {initialLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">Loading inventory...</div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <p>No available items found</p>
              {search && <p className="text-sm mt-1">Try a different search term</p>}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {assets.map((asset) => {
                const totalAvailable = asset.available_quantity != null ? Number(asset.available_quantity) : (asset.quantity || 1);
                const usedOnInvoice = usedQtyByAssetId[asset.id] || 0;
                const remaining = totalAvailable - usedOnInvoice;
                const isSelected = selected.has(asset.id);

                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleSelect(asset)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="pt-0.5 shrink-0">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{asset.make} {asset.model}</div>
                        <div className="text-sm text-gray-500">
                          {asset.asset_tag}
                          {asset.serial_number && ` • S/N: ${asset.serial_number}`}
                        </div>
                        <div className="text-xs text-gray-400">
                          {asset.condition} • {asset.category}
                        </div>
                      </div>

                      {/* Price & availability */}
                      <div className="text-right shrink-0">
                        <div className="font-medium text-green-600">
                          {formatCurrency(asset.price_amount, asset.price_currency)}
                        </div>
                        <div className="text-xs text-gray-400">
                          Cost: {formatCurrency(asset.cost_amount, asset.cost_currency)}
                        </div>
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          {remaining} available
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {loading && !initialLoading && (
            <div className="text-center py-3 text-sm text-gray-400">Searching...</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 shrink-0 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handleDone}
            disabled={selected.size === 0}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Selected ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
