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
  const [selected, setSelected] = useState(new Map()); // Map<assetId, { asset, quantity }> or Map<"unit-{unitId}", { asset, unit, quantity: 1 }>
  const [expandedAssets, setExpandedAssets] = useState(new Set()); // which serialized products are expanded
  const [unitsByAsset, setUnitsByAsset] = useState({}); // { assetId: units[] }
  const [unitsLoading, setUnitsLoading] = useState(new Set());

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelected(new Map());
      setExpandedAssets(new Set());
      setUnitsByAsset({});
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

  const fetchUnitsForAsset = async (assetId) => {
    if (unitsByAsset[assetId]) return; // already loaded
    setUnitsLoading(prev => new Set(prev).add(assetId));
    try {
      const res = await axios.get(`/api/v1/assets/${assetId}/units`, { params: { status: 'Available', limit: 200 } });
      const units = res.data.data.units || [];
      // Filter out units already on this invoice
      const usedUnitIds = new Set(existingItems.filter(i => i.asset_unit_id).map(i => i.asset_unit_id));
      const available = units.filter(u => !usedUnitIds.has(u.id));
      setUnitsByAsset(prev => ({ ...prev, [assetId]: available }));
    } catch (err) {
      console.error('Failed to fetch units:', err);
      setUnitsByAsset(prev => ({ ...prev, [assetId]: [] }));
    } finally {
      setUnitsLoading(prev => { const n = new Set(prev); n.delete(assetId); return n; });
    }
  };

  const toggleExpandSerialized = (asset) => {
    setExpandedAssets(prev => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.add(asset.id);
        fetchUnitsForAsset(asset.id);
      }
      return next;
    });
  };

  const toggleSelectUnit = (asset, unit) => {
    const key = `unit-${unit.id}`;
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { asset, unit, quantity: 1 });
      }
      return next;
    });
  };

  const toggleSelect = (asset, remaining) => {
    if (asset.is_serialized) {
      toggleExpandSerialized(asset);
      return;
    }
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.set(asset.id, { asset, quantity: 1, max: remaining });
      }
      return next;
    });
  };

  const updateQuantity = (assetId, qty) => {
    setSelected(prev => {
      const next = new Map(prev);
      const entry = next.get(assetId);
      if (entry) {
        next.set(assetId, { ...entry, quantity: Math.max(1, Math.min(qty, entry.max)) });
      }
      return next;
    });
  };

  const totalUnits = Array.from(selected.values()).reduce((sum, e) => sum + e.quantity, 0);

  const handleDone = () => {
    const items = Array.from(selected.values()).map(({ asset, unit, quantity }) => {
      if (unit) {
        // Serialized unit — each is qty 1 with unit reference
        return {
          ...asset,
          _selectedQty: 1,
          _unitId: unit.id,
          _unitSerial: unit.serial_number,
          _unitPrice: unit.effective_price,
          _unitCost: unit.effective_cost
        };
      }
      return { ...asset, _selectedQty: quantity };
    });
    onAddItems(items);
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
            {totalUnits > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary-100 text-primary-700">
                {totalUnits}
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
                const isSerialized = !!asset.is_serialized;
                const isExpanded = expandedAssets.has(asset.id);
                const isSelected = !isSerialized && selected.has(asset.id);

                // Count how many units of this serialized product are selected
                const selectedUnitCount = isSerialized
                  ? (unitsByAsset[asset.id] || []).filter(u => selected.has(`unit-${u.id}`)).length
                  : 0;

                const selectedEntry = selected.get(asset.id);
                const selectedQty = selectedEntry?.quantity || 1;

                return (
                  <div key={asset.id}>
                    <div
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected ? 'bg-primary-50' : isExpanded ? 'bg-purple-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <button
                        onClick={() => toggleSelect(asset, remaining)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox or expand arrow */}
                          <div className="pt-0.5 shrink-0">
                            {isSerialized ? (
                              <div className="w-5 h-5 flex items-center justify-center text-purple-600">
                                <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            ) : (
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
                            )}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">
                              {asset.make} {asset.model}
                              {isSerialized && (
                                <span className="ml-1.5 text-[10px] font-medium text-purple-600 bg-purple-100 px-1.5 rounded">SN</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {asset.asset_tag}
                              {!isSerialized && asset.serial_number && ` • S/N: ${asset.serial_number}`}
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
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                              {remaining} available
                            </span>
                            {selectedUnitCount > 0 && (
                              <div className="text-xs text-purple-600 font-medium mt-0.5">{selectedUnitCount} selected</div>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Quantity stepper — only for non-serialized selected items with remaining > 1 */}
                      {!isSerialized && isSelected && remaining > 1 && (
                        <div className="flex items-center gap-2 mt-2 ml-8">
                          <span className="text-xs text-gray-500">Qty:</span>
                          <button
                            onClick={() => updateQuantity(asset.id, selectedQty - 1)}
                            disabled={selectedQty <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                          >
                            &minus;
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={remaining}
                            value={selectedQty}
                            onChange={(e) => updateQuantity(asset.id, parseInt(e.target.value, 10) || 1)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-14 text-center text-sm border border-gray-300 rounded py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          <button
                            onClick={() => updateQuantity(asset.id, selectedQty + 1)}
                            disabled={selectedQty >= remaining}
                            className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                          >
                            +
                          </button>
                          <span className="text-xs text-gray-400">of {remaining}</span>
                        </div>
                      )}
                    </div>

                    {/* Expanded units list for serialized products */}
                    {isSerialized && isExpanded && (
                      <div className="bg-purple-50/50 border-t border-purple-100">
                        {unitsLoading.has(asset.id) ? (
                          <div className="px-8 py-3 text-sm text-gray-500">Loading units...</div>
                        ) : (unitsByAsset[asset.id] || []).length === 0 ? (
                          <div className="px-8 py-3 text-sm text-gray-400">No available units</div>
                        ) : (
                          (unitsByAsset[asset.id] || []).map(unit => {
                            const unitKey = `unit-${unit.id}`;
                            const isUnitSelected = selected.has(unitKey);
                            return (
                              <button
                                key={unit.id}
                                onClick={() => toggleSelectUnit(asset, unit)}
                                className={`w-full px-8 py-2 text-left flex items-center gap-3 transition-colors ${
                                  isUnitSelected ? 'bg-primary-50' : 'hover:bg-purple-100/50'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                  isUnitSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300 bg-white'
                                }`}>
                                  {isUnitSelected && (
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-mono text-gray-800">{unit.serial_number}</span>
                                  <span className="text-xs text-gray-400 ml-2">
                                    {[unit.cpu, unit.memory ? `${unit.memory >= 1024 ? (unit.memory/1024)+'GB' : unit.memory+'MB'} RAM` : null, unit.storage ? `${unit.storage}GB` : null]
                                      .filter(Boolean).join(' • ')}
                                  </span>
                                  {unit.conditionStatus && (
                                    <span className="ml-2 inline-block px-1.5 py-0 text-[10px] font-medium rounded-full" style={{ backgroundColor: unit.conditionStatus.color + '20', color: unit.conditionStatus.color }}>
                                      {unit.conditionStatus.name}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-medium text-green-600 shrink-0">
                                  {formatCurrency(unit.effective_price, asset.price_currency)}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
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
            disabled={totalUnits === 0}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Selected ({totalUnits})
          </button>
        </div>
      </div>
    </div>
  );
}
