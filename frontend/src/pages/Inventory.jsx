import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Format currency amount with symbol
 */
function formatCurrency(amount, currencyCode = 'GHS') {
  if (amount == null || isNaN(amount)) return '—';

  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${currencyCode} ${formatted}`;
}

/**
 * Format with equivalent currency in brackets
 */
function formatWithEquiv(ghs, usd) {
  if (ghs == null || isNaN(ghs)) return '—';

  const ghsFormatted = formatCurrency(ghs, 'GHS');
  const usdFormatted = formatCurrency(usd, 'USD');

  return (
    <span>
      {ghsFormatted}
      <span className="text-gray-500 text-sm ml-1">(≈ {usdFormatted})</span>
    </span>
  );
}

/**
 * Valuation Summary Card Component
 */
function SummaryCard({ title, value, subtext, highlight, negative }) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${highlight ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
      <div className="text-sm font-medium text-gray-600 mb-1">{title}</div>
      <div className={`text-lg font-semibold ${negative ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </div>
      {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
    </div>
  );
}

/**
 * Valuation Breakdown Row Component
 */
function BreakdownRow({ level, name, data, expanded, onToggle, hasChildren }) {
  const indent = level === 'category' ? 'pl-6' : level === 'assetType' ? 'pl-12' : '';
  const fontWeight = level === 'all' ? 'font-semibold' : level === 'category' ? 'font-medium' : 'font-normal';
  const bgColor = level === 'all' ? 'bg-gray-100' : level === 'category' ? 'bg-gray-50' : 'bg-white';

  return (
    <tr className={`${bgColor} hover:bg-gray-100`}>
      <td className={`px-4 py-3 text-sm ${indent} ${fontWeight}`}>
        <div className="flex items-center gap-2">
          {hasChildren && (
            <button
              onClick={onToggle}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700"
            >
              {expanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && level !== 'all' && <span className="w-5" />}
          <span>{name}</span>
          {data.itemCount > 0 && (
            <span className="text-xs text-gray-500">
              ({data.itemCount} items, {data.totalQuantity} units)
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-right">
        {formatWithEquiv(data.totalCost?.ghs, data.totalCost?.usd)}
      </td>
      <td className="px-4 py-3 text-sm text-right">
        {formatWithEquiv(data.totalSelling?.ghs, data.totalSelling?.usd)}
      </td>
      <td className={`px-4 py-3 text-sm text-right ${data.profit?.ghs < 0 ? 'text-red-600' : 'text-green-600'}`}>
        {formatWithEquiv(data.profit?.ghs, data.profit?.usd)}
      </td>
      <td className="px-4 py-3 text-sm text-right font-medium">
        {data.markupPercent != null ? `${data.markupPercent.toFixed(1)}%` : '—'}
      </td>
    </tr>
  );
}

/**
 * Multi-Select Dropdown Component
 */
function MultiSelectDropdown({ label, options, selected, onChange, onClear }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (value) => {
    onChange(value);
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white cursor-pointer flex items-center justify-between min-h-[42px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="text-gray-400">All {label}</span>
          ) : selected.length <= 2 ? (
            selected.map(val => (
              <span
                key={val}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
              >
                {val}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-700">
              {selected.length} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          {selected.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
          <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options</div>
            ) : (
              options.map(option => (
                <label
                  key={option}
                  className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggleOption(option)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700">{option}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Inventory() {
  const { permissions } = usePermissions();
  const canSeeCost = permissions?.canSeeCost ?? false;
  const canAddInventory = permissions?.canAddInventory ?? false;
  const canImport = permissions?.canImport ?? false;
  const canDelete = permissions?.canDelete ?? false;

  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState(null);

  // Undo delete state
  const [undoToast, setUndoToast] = useState(null); // { deletedIds: [], count: number, timeoutId: number }
  const [restoring, setRestoring] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    category: [],      // Multi-select
    assetType: [],     // Multi-select
    status: [],        // Multi-select
    condition: [],     // Multi-select
    make: []           // Multi-select
  });
  const [filterOptions, setFilterOptions] = useState({
    categories: [],
    assetTypes: [],
    statuses: [],
    conditions: [],
    makes: []
  });
  const [taxonomy, setTaxonomy] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Sorting state
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Valuation summary state
  const [valuation, setValuation] = useState(null);
  const [valuationLoading, setValuationLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Fetch filter options and taxonomy
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [optionsRes, taxonomyRes] = await Promise.all([
          axios.get('/api/v1/assets/filters/options'),
          axios.get('/api/v1/assets/taxonomy')
        ]);
        setFilterOptions({
          ...optionsRes.data.data,
          categories: taxonomyRes.data.data.categories
        });
        setTaxonomy(taxonomyRes.data.data);
      } catch (err) {
        console.error('Error fetching initial data:', err);
      }
    };

    fetchInitialData();
  }, []);

  // Fetch assets
  useEffect(() => {
    fetchAssets();
  }, [pagination.page, filters, sortBy, sortOrder]);

  // Fetch valuation summary when filters change
  useEffect(() => {
    fetchValuation();
  }, [filters]);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
        search: filters.search
      };

      // Add multi-select filters as comma-separated strings
      if (filters.category.length > 0) params.category = filters.category.join(',');
      if (filters.assetType.length > 0) params.assetType = filters.assetType.join(',');
      if (filters.status.length > 0) params.status = filters.status.join(',');
      if (filters.condition.length > 0) params.condition = filters.condition.join(',');
      if (filters.make.length > 0) params.make = filters.make.join(',');

      const response = await axios.get('/api/v1/assets', { params });
      setAssets(response.data.data.assets);
      setPagination(prev => ({
        ...prev,
        ...response.data.data.pagination
      }));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch assets');
    } finally {
      setLoading(false);
    }
  };

  const fetchValuation = async () => {
    try {
      setValuationLoading(true);
      const params = {};
      if (filters.category.length > 0) params.category = filters.category.join(',');
      if (filters.assetType.length > 0) params.assetType = filters.assetType.join(',');
      if (filters.status.length > 0) params.status = filters.status.join(',');
      if (filters.condition.length > 0) params.condition = filters.condition.join(',');
      if (filters.make.length > 0) params.make = filters.make.join(',');

      const response = await axios.get('/api/v1/assets/valuation-summary', { params });
      setValuation(response.data.data);
    } catch (err) {
      console.error('Error fetching valuation:', err);
    } finally {
      setValuationLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    // When category changes, reset asset type filter
    if (key === 'category') {
      setFilters(prev => ({ ...prev, category: value, assetType: [] }));
    } else {
      setFilters(prev => ({ ...prev, [key]: value }));
    }
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Handle multi-select toggle
  const handleMultiSelectToggle = (key, value) => {
    setFilters(prev => {
      const currentValues = prev[key] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];

      // When category changes, reset asset type filter
      if (key === 'category') {
        return { ...prev, category: newValues, assetType: [] };
      }
      return { ...prev, [key]: newValues };
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Clear all selections for a filter
  const clearFilter = (key) => {
    if (key === 'category') {
      setFilters(prev => ({ ...prev, category: [], assetType: [] }));
    } else {
      setFilters(prev => ({ ...prev, [key]: [] }));
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Get asset types for filter based on selected categories
  const assetTypesForFilter = filters.category.length > 0 && taxonomy
    ? [...new Set(filters.category.flatMap(cat => taxonomy.taxonomy[cat] || []))]
    : filterOptions.assetTypes;

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  // Handle column sorting
  const handleSort = (column) => {
    if (sortBy === column) {
      // Toggle order if same column
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      // New column, default to DESC
      setSortBy(column);
      setSortOrder('DESC');
    }
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Sortable header component
  const SortHeader = ({ column, label }) => {
    const isActive = sortBy === column;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          <span>{label}</span>
          <span className={`text-xs ${isActive ? 'text-blue-600' : 'text-gray-300'}`}>
            {isActive ? (sortOrder === 'ASC' ? '▲' : '▼') : '⇅'}
          </span>
        </div>
      </th>
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this asset?')) {
      return;
    }

    try {
      const response = await axios.delete(`/api/v1/assets/${id}`);
      const { deletedIds } = response.data.data;

      // Clear any existing undo toast timeout
      if (undoToast?.timeoutId) {
        clearTimeout(undoToast.timeoutId);
      }

      // Show undo toast for 15 seconds
      const timeoutId = setTimeout(() => {
        setUndoToast(null);
      }, 15000);

      setUndoToast({
        deletedIds: deletedIds || [id],
        count: 1,
        timeoutId
      });

      fetchAssets();
      fetchValuation();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete asset');
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Clear selection when assets list changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [assets]);

  // Bulk selection handlers
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(assets.map(a => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id, checked) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const isAllSelected = assets.length > 0 && selectedIds.size === assets.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < assets.length;

  // Bulk delete handler
  const handleBulkDelete = async () => {
    const selectedCount = selectedIds.size;
    if (selectedCount === 0) return;

    // Get selected assets to check for sold items
    const selectedAssets = assets.filter(a => selectedIds.has(a.id));
    const soldItems = selectedAssets.filter(a => a.status === 'Sold');

    if (soldItems.length > 0) {
      setBulkDeleteError(`Cannot delete ${soldItems.length} sold item(s). Please deselect them first.`);
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedCount} asset(s)?`
    );

    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      setBulkDeleteError(null);

      const response = await axios.delete('/api/v1/assets/bulk', {
        data: { ids: Array.from(selectedIds) }
      });

      const { deletedCount, deletedIds } = response.data.data;

      // Clear any existing undo toast timeout
      if (undoToast?.timeoutId) {
        clearTimeout(undoToast.timeoutId);
      }

      // Show undo toast for 15 seconds
      const timeoutId = setTimeout(() => {
        setUndoToast(null);
      }, 15000);

      setUndoToast({
        deletedIds: deletedIds || [],
        count: deletedCount,
        timeoutId
      });

      // Refresh data
      setSelectedIds(new Set());
      fetchAssets();
      fetchValuation();
    } catch (err) {
      const errorData = err.response?.data?.error;
      if (errorData?.code === 'HAS_SOLD_ITEMS') {
        setBulkDeleteError(errorData.message);
      } else {
        setBulkDeleteError(errorData?.message || 'Failed to delete selected assets');
      }
    } finally {
      setBulkDeleting(false);
    }
  };

  // Handle undo delete
  const handleUndo = async () => {
    if (!undoToast?.deletedIds?.length) return;

    try {
      setRestoring(true);

      const response = await axios.post('/api/v1/assets/restore', {
        ids: undoToast.deletedIds
      });

      const { restoredCount } = response.data.data;

      // Clear undo toast
      if (undoToast.timeoutId) {
        clearTimeout(undoToast.timeoutId);
      }
      setUndoToast(null);

      // Refresh data
      fetchAssets();
      fetchValuation();

      // Brief success feedback could be added here if needed
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to restore items');
    } finally {
      setRestoring(false);
    }
  };

  // Dismiss undo toast
  const dismissUndoToast = () => {
    if (undoToast?.timeoutId) {
      clearTimeout(undoToast.timeoutId);
    }
    setUndoToast(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        <div className="flex gap-3">
          {canDelete && (
            <Link
              to="/inventory/recycle-bin"
              className="btn btn-secondary"
            >
              Recycle Bin
            </Link>
          )}
          {canImport && (
            <>
              <Link
                to="/inventory/import-history"
                className="btn btn-secondary"
              >
                Import History
              </Link>
              <Link
                to="/inventory/import"
                className="btn btn-secondary"
              >
                Import Assets
              </Link>
            </>
          )}
          {canAddInventory && (
            <Link
              to="/inventory/add"
              className="btn btn-primary"
            >
              Add Asset
            </Link>
          )}
        </div>
      </div>

      {/* Undo Delete Toast */}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-4">
            <span>Deleted {undoToast.count} item(s)</span>
            <button
              onClick={handleUndo}
              disabled={restoring}
              className="text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50"
            >
              {restoring ? 'Restoring...' : 'Undo'}
            </button>
            <button
              onClick={dismissUndoToast}
              className="text-gray-400 hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-medium text-blue-800">
              {selectedIds.size} item(s) selected
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-3">
            {bulkDeleteError && (
              <span className="text-sm text-red-600">{bulkDeleteError}</span>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {bulkDeleting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Deleting...
                </>
              ) : (
                <>Delete Selected</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Valuation Summary Cards — hidden for roles that cannot see cost */}
      {canSeeCost && !valuationLoading && valuation && (
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <SummaryCard
              title="Total Cost"
              value={formatWithEquiv(valuation.overall.totalCost.ghs, valuation.overall.totalCost.usd)}
              subtext={`${valuation.overall.itemsWithCost} items with cost`}
            />
            <SummaryCard
              title="Total Selling Value"
              value={formatWithEquiv(valuation.overall.totalSelling.ghs, valuation.overall.totalSelling.usd)}
              subtext={`${valuation.overall.itemsWithPrice} items with price`}
            />
            <SummaryCard
              title="Projected Profit"
              value={formatWithEquiv(valuation.overall.profit.ghs, valuation.overall.profit.usd)}
              negative={valuation.overall.profit.ghs < 0}
              highlight
            />
            <SummaryCard
              title="Markup %"
              value={valuation.overall.markupPercent != null ? `${valuation.overall.markupPercent.toFixed(1)}%` : '—'}
              subtext="Profit / Cost"
              highlight
            />
          </div>

          {/* FX Note */}
          <div className="text-xs text-gray-500 mb-2">
            Using today's FX rate + {valuation.fx.markup} markup (USD/GHS: {valuation.fx.rates.USD_GHS.toFixed(2)})
          </div>

          {/* Drilldown Toggle */}
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            {showBreakdown ? '▼ Hide' : '▶ Show'} Breakdown by Category & Type
          </button>

          {/* Drilldown Breakdown Table */}
          {showBreakdown && (
            <div className="mt-4 overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Level
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total Cost
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Selling Value
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Profit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Markup %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {/* Overall Row */}
                  <BreakdownRow
                    level="all"
                    name="All Inventory"
                    data={valuation.overall}
                    hasChildren={false}
                  />

                  {/* Category Rows */}
                  {Object.entries(valuation.byCategory).map(([category, categoryData]) => (
                    <>
                      <BreakdownRow
                        key={category}
                        level="category"
                        name={category}
                        data={categoryData}
                        expanded={expandedCategories[category]}
                        onToggle={() => toggleCategory(category)}
                        hasChildren={Object.keys(categoryData.byAssetType || {}).length > 0}
                      />

                      {/* Asset Type Rows (when expanded) */}
                      {expandedCategories[category] && categoryData.byAssetType &&
                        Object.entries(categoryData.byAssetType).map(([assetType, typeData]) => (
                          <BreakdownRow
                            key={`${category}-${assetType}`}
                            level="assetType"
                            name={assetType}
                            data={typeData}
                            hasChildren={false}
                          />
                        ))
                      }
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Valuation Loading Skeleton */}
      {canSeeCost && valuationLoading && (
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-32"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Asset tag, serial, make, model..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <MultiSelectDropdown
            label="Category"
            options={filterOptions.categories}
            selected={filters.category}
            onChange={(val) => handleMultiSelectToggle('category', val)}
            onClear={() => clearFilter('category')}
          />

          <MultiSelectDropdown
            label="Asset Type"
            options={assetTypesForFilter}
            selected={filters.assetType}
            onChange={(val) => handleMultiSelectToggle('assetType', val)}
            onClear={() => clearFilter('assetType')}
          />

          <MultiSelectDropdown
            label="Status"
            options={filterOptions.statuses}
            selected={filters.status}
            onChange={(val) => handleMultiSelectToggle('status', val)}
            onClear={() => clearFilter('status')}
          />

          <MultiSelectDropdown
            label="Condition"
            options={filterOptions.conditions}
            selected={filters.condition}
            onChange={(val) => handleMultiSelectToggle('condition', val)}
            onClear={() => clearFilter('condition')}
          />

          <MultiSelectDropdown
            label="Make"
            options={filterOptions.makes}
            selected={filters.make}
            onChange={(val) => handleMultiSelectToggle('make', val)}
            onClear={() => clearFilter('make')}
          />
        </div>
      </div>

      {/* Assets Table */}
      <div className="card overflow-x-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No assets found. Try adjusting your filters.
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-center w-12">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={el => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  </th>
                  <SortHeader column="asset_tag" label="Asset Tag" />
                  <SortHeader column="category" label="Category" />
                  <SortHeader column="asset_type" label="Type" />
                  <SortHeader column="make" label="Make & Model" />
                  <SortHeader column="ram_gb" label="Specs" />
                  <SortHeader column="serial_number" label="Serial Number" />
                  <SortHeader column="quantity" label="Qty" />
                  <SortHeader column="status" label="Status" />
                  <SortHeader column="condition" label="Condition" />
                  <SortHeader column="price_amount" label="Price" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assets.map((asset) => {
                  const remaining = asset.available_quantity != null ? Number(asset.available_quantity) : (asset.quantity || 1);
                  const isUnavailable = remaining <= 0;
                  const reserved = asset.reserved_quantity != null ? Number(asset.reserved_quantity) : 0;
                  const isPartial = remaining > 0 && reserved > 0;
                  const rowClasses = `hover:bg-gray-50 ${selectedIds.has(asset.id) ? 'bg-blue-50' : ''} ${isUnavailable ? 'opacity-50' : ''}`;

                  return (
                  <tr key={asset.id} className={rowClasses}>
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(asset.id)}
                        onChange={(e) => handleSelectOne(asset.id, e.target.checked)}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Link
                        to={`/inventory/${asset.id}`}
                        className={`font-medium ${isUnavailable ? 'text-gray-500 hover:text-gray-700' : 'text-blue-600 hover:text-blue-800'}`}
                      >
                        {asset.asset_tag}
                      </Link>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {asset.category || '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {asset.asset_type}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      <div className="font-medium">{asset.make}</div>
                      <div className="text-gray-500">{asset.model}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {asset.ram_gb && `${asset.ram_gb}GB RAM`}
                      {asset.ram_gb && asset.storage_gb && ', '}
                      {asset.storage_gb && `${asset.storage_gb}GB ${asset.storage_type || 'Storage'}`}
                      {(asset.ram_gb || asset.storage_gb) && asset.screen_size_inches && ', '}
                      {asset.screen_size_inches && `${asset.screen_size_inches}"`}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 font-mono">
                      {asset.serial_number || '—'}
                    </td>
                    <td className="px-4 py-4 text-center text-sm text-gray-900">
                      <div className="flex flex-col items-center gap-0.5">
                        {asset.is_serialized && (
                          <span className="text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 rounded">SN</span>
                        )}
                        <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded ${
                          isUnavailable ? 'bg-red-100 text-red-800 font-medium' :
                          isPartial ? 'bg-cyan-100 text-cyan-800 font-medium' :
                          (asset.total_quantity || asset.quantity) > 1 ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600'
                        }`}>
                          {remaining}/{asset.total_quantity || asset.quantity || 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {(() => {
                        const displayStatus = isPartial ? 'Partial Stock' : asset.status;
                        const badgeClass =
                          displayStatus === 'In Stock' ? 'bg-green-100 text-green-800' :
                          displayStatus === 'Partial Stock' ? 'bg-cyan-100 text-cyan-800' :
                          displayStatus === 'Processing' ? 'bg-blue-100 text-blue-800' :
                          displayStatus === 'Reserved' ? 'bg-yellow-100 text-yellow-800' :
                          displayStatus === 'Sold' ? 'bg-gray-200 text-gray-600' :
                          displayStatus === 'In Repair' ? 'bg-orange-100 text-orange-800' :
                          'bg-purple-100 text-purple-800';
                        return (
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badgeClass}`}>
                            {displayStatus}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {asset.conditionStatus ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: asset.conditionStatus.color + '20', color: asset.conditionStatus.color }}
                        >
                          {asset.conditionStatus.name}
                        </span>
                      ) : asset.condition ? (
                        <span className="text-gray-500">{asset.condition}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {asset.price_amount ? `${asset.price_currency} ${parseFloat(asset.price_amount).toFixed(2)}` : 'N/A'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <Link
                          to={`/inventory/${asset.id}/edit`}
                          className={isUnavailable ? 'text-gray-400 hover:text-gray-600' : 'text-blue-600 hover:text-blue-800'}
                        >
                          Edit
                        </Link>
                        {canDelete && !isUnavailable && (
                          <button
                            onClick={() => handleDelete(asset.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} assets
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
