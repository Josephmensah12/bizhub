import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  formatWithEquivalent,
  calculateProfitAndMarkup,
  formatProfit,
  formatMarkup
} from '../services/currencyConversion';
import { usePermissions } from '../hooks/usePermissions';

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { permissions } = usePermissions();
  const canSeeCost = permissions?.canSeeCost ?? false;
  const canManage = permissions?.role && ['Admin', 'Manager', 'Warehouse'].includes(permissions.role);
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [costDisplay, setCostDisplay] = useState(null);
  const [priceDisplay, setPriceDisplay] = useState(null);
  const [profitDisplay, setProfitDisplay] = useState('—');
  const [markupDisplay, setMarkupDisplay] = useState('—');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  // Units state
  const [units, setUnits] = useState([]);
  const [unitSummary, setUnitSummary] = useState(null);
  const [unitFilter, setUnitFilter] = useState({ status: '', condition_status_id: '', search: '' });
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [conditionStatuses, setConditionStatuses] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSerials, setBulkSerials] = useState('');
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [unitSaving, setUnitSaving] = useState(false);
  const emptyUnitForm = { serial_number: '', cpu: '', memory: '', storage: '', cost_amount: '', price_amount: '', condition_status_id: '', notes: '' };
  const [addFormData, setAddFormData] = useState(emptyUnitForm);

  const fetchUnits = useCallback(async (filters = unitFilter) => {
    if (!id) return;
    setUnitsLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.condition_status_id) params.condition_status_id = filters.condition_status_id;
      if (filters.search) params.search = filters.search;
      params.limit = 200;

      const [unitsRes, summaryRes] = await Promise.all([
        axios.get(`/api/v1/assets/${id}/units`, { params }),
        axios.get(`/api/v1/assets/${id}/units/summary`)
      ]);
      setUnits(unitsRes.data.data.units || []);
      setUnitSummary(summaryRes.data.data);
    } catch (err) {
      console.error('Failed to fetch units:', err);
    } finally {
      setUnitsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAsset();
    fetchHistory();
    axios.get('/api/v1/condition-statuses').then(res => {
      setConditionStatuses(res.data.data.conditionStatuses || []);
    }).catch(() => {});
  }, [id]);

  // Fetch units when asset loads (if serialized) or filter changes
  useEffect(() => {
    if (asset?.is_serialized) {
      fetchUnits(unitFilter);
    }
  }, [asset?.is_serialized, unitFilter, fetchUnits]);

  // Calculate currency equivalents, profit, and markup when asset loads
  useEffect(() => {
    async function calculatePricingData() {
      if (!asset) return;

      // Cost with GHS equivalent (show in selling currency)
      if (asset.cost_amount && asset.cost_currency) {
        const formatted = await formatWithEquivalent(
          asset.cost_amount,
          asset.cost_currency,
          asset.price_currency || 'GHS'
        );
        setCostDisplay(formatted);
      } else {
        setCostDisplay('—');
      }

      // Selling Price with cost currency equivalent
      if (asset.price_amount && asset.price_currency) {
        const formatted = await formatWithEquivalent(
          asset.price_amount,
          asset.price_currency,
          asset.cost_currency || 'USD'
        );
        setPriceDisplay(formatted);
      } else {
        setPriceDisplay('—');
      }

      // Calculate profit and markup
      const result = await calculateProfitAndMarkup(
        parseFloat(asset.cost_amount),
        asset.cost_currency,
        parseFloat(asset.price_amount),
        asset.price_currency
      );

      if (result.error) {
        setProfitDisplay('—');
        setMarkupDisplay('—');
      } else {
        setProfitDisplay(formatProfit(result.profit));
        setMarkupDisplay(formatMarkup(result.markup));
      }
    }

    calculatePricingData();
  }, [asset]);

  const fetchAsset = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/v1/assets/${id}`);
      setAsset(response.data.data.asset);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch asset details');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await axios.get(`/api/v1/assets/${id}/history`);
      setHistory(response.data.data.events || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`/api/v1/assets/${id}`);
      navigate('/inventory');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete asset');
    }
  };

  // ---- Unit handlers ----
  const handleAddUnit = async (e) => {
    e.preventDefault();
    if (!addFormData.serial_number.trim()) return;
    setUnitSaving(true);
    try {
      await axios.post(`/api/v1/assets/${id}/units`, {
        ...addFormData,
        memory: addFormData.memory ? parseInt(addFormData.memory) : null,
        storage: addFormData.storage ? parseInt(addFormData.storage) : null,
        cost_amount: addFormData.cost_amount !== '' ? parseFloat(addFormData.cost_amount) : null,
        price_amount: addFormData.price_amount !== '' ? parseFloat(addFormData.price_amount) : null,
        condition_status_id: addFormData.condition_status_id || null
      });
      setAddFormData(emptyUnitForm);
      setShowAddForm(false);
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to add unit');
    } finally {
      setUnitSaving(false);
    }
  };

  const handleBulkAdd = async () => {
    const serials = bulkSerials.split('\n').map(s => s.trim()).filter(Boolean);
    if (serials.length === 0) return;
    setUnitSaving(true);
    try {
      const res = await axios.post(`/api/v1/assets/${id}/units/bulk`, {
        units: serials.map(sn => ({ serial_number: sn }))
      });
      const { created, skipped } = res.data.data;
      alert(`${created} unit(s) created, ${skipped} skipped (duplicates)`);
      setBulkSerials('');
      setShowBulkModal(false);
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to bulk add units');
    } finally {
      setUnitSaving(false);
    }
  };

  const handleEditUnit = async (unitId) => {
    setUnitSaving(true);
    try {
      await axios.put(`/api/v1/assets/${id}/units/${unitId}`, {
        ...editFormData,
        memory: editFormData.memory ? parseInt(editFormData.memory) : null,
        storage: editFormData.storage ? parseInt(editFormData.storage) : null,
        cost_amount: editFormData.cost_amount !== '' ? parseFloat(editFormData.cost_amount) : null,
        price_amount: editFormData.price_amount !== '' ? parseFloat(editFormData.price_amount) : null,
        condition_status_id: editFormData.condition_status_id || null
      });
      setEditingUnitId(null);
      setEditFormData({});
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update unit');
    } finally {
      setUnitSaving(false);
    }
  };

  const handleDeleteUnit = async (unitId, serialNumber) => {
    if (!window.confirm(`Delete unit "${serialNumber}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/v1/assets/${id}/units/${unitId}`);
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete unit');
    }
  };

  const startEditUnit = (unit) => {
    setEditingUnitId(unit.id);
    setEditFormData({
      serial_number: unit.serial_number || '',
      cpu: unit.cpu || '',
      memory: unit.memory || '',
      storage: unit.storage || '',
      cost_amount: unit.cost_amount ?? '',
      price_amount: unit.price_amount ?? '',
      condition_status_id: unit.condition_status_id || '',
      status: unit.status || 'Available',
      notes: unit.notes || ''
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div>
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <div className="text-center py-8 text-gray-500">Asset not found</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{asset.asset_tag}</h1>
            <p className="text-gray-600 mt-1">
              {asset.make} {asset.model}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to={`/inventory/${id}/edit`}
              className="btn btn-secondary"
            >
              Edit Asset
            </Link>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mb-6">
        <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${
          asset.status === 'In Stock' ? 'bg-green-100 text-green-800' :
          asset.status === 'Processing' ? 'bg-blue-100 text-blue-800' :
          asset.status === 'Reserved' ? 'bg-yellow-100 text-yellow-800' :
          asset.status === 'Sold' ? 'bg-gray-100 text-gray-800' :
          asset.status === 'In Repair' ? 'bg-orange-100 text-orange-800' :
          'bg-purple-100 text-purple-800'
        }`}>
          {asset.status}
        </span>
        {asset.conditionStatus ? (
          <span
            className="ml-2 inline-block px-3 py-1 text-sm font-semibold rounded-full"
            style={{ backgroundColor: asset.conditionStatus.color + '20', color: asset.conditionStatus.color }}
          >
            {asset.conditionStatus.name}
          </span>
        ) : asset.condition ? (
          <span className="ml-2 inline-block px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
            {asset.condition}
          </span>
        ) : null}
        {/* Show linked invoice for Reserved or Sold status */}
        {(asset.status === 'Processing' || asset.status === 'Reserved' || asset.status === 'Sold') && (() => {
          const linkedEvent = history.find(e =>
            (e.eventType === 'RESERVED' || e.eventType === 'SOLD' || e.eventType === 'ADDED_TO_INVOICE') &&
            e.details?.invoiceId
          );
          if (linkedEvent?.details?.invoiceId) {
            return (
              <Link
                to={`/invoices/${linkedEvent.details.invoiceId}`}
                className="ml-3 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Invoice: {linkedEvent.details.invoiceNumber || 'View'}
              </Link>
            );
          }
          return null;
        })()}
      </div>

      {/* Basic Information */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailItem label="Asset Tag" value={asset.asset_tag} />
          <DetailItem label="Category" value={asset.category} />
          <DetailItem label="Asset Type" value={asset.asset_type} />
          <DetailItem label="Serial Number" value={asset.serial_number} />
          <DetailItem label="Make" value={asset.make} />
          <DetailItem label="Model" value={asset.model} />
          <DetailItem label="Product Category" value={asset.product_category} />
          <DetailItem label="Subcategory" value={asset.subcategory} />
          {asset.is_serialized ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <span className="inline-block px-2 py-0.5 text-xs font-medium text-purple-700 bg-purple-100 rounded">Serialized</span>
              {unitSummary && (
                <span className="ml-2 text-sm text-gray-600">{unitSummary.total} unit(s)</span>
              )}
            </div>
          ) : (
            <DetailItem label="Quantity" value={asset.quantity} />
          )}
        </div>
        {asset.specs && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Specifications</label>
            <p className="text-gray-900">{asset.specs}</p>
          </div>
        )}
      </div>

      {/* Technical Specifications */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Technical Specifications</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailItem label="RAM" value={asset.ram_gb ? `${asset.ram_gb} GB` : null} />
          <DetailItem label="Storage" value={asset.storage_gb ? `${asset.storage_gb} GB ${asset.storage_type || ''}` : null} />
          <DetailItem label="CPU" value={asset.cpu} />
          <DetailItem label="GPU" value={asset.gpu} />
          <DetailItem label="Screen Size" value={asset.screen_size_inches ? `${asset.screen_size_inches}"` : null} />
          <DetailItem label="Resolution" value={asset.resolution} />
          <DetailItem label="Battery Health" value={asset.battery_health_percent ? `${asset.battery_health_percent}%` : null} />
        </div>
        {asset.major_characteristics && asset.major_characteristics.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Major Characteristics</label>
            <div className="flex flex-wrap gap-2">
              {asset.major_characteristics.map((char, idx) => (
                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded">
                  {char}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {canSeeCost && (
            <DetailItem
              label="Cost (Purchase Price)"
              value={costDisplay}
            />
          )}
          <DetailItem
            label="Selling Price"
            value={priceDisplay}
          />
          {canSeeCost && (
            <>
              <DetailItem
                label="Profit"
                value={profitDisplay}
                highlight={profitDisplay !== '—' && !profitDisplay.startsWith('-')}
                negative={profitDisplay !== '—' && profitDisplay.includes('-')}
              />
              <DetailItem
                label="Markup"
                value={markupDisplay}
                subtext="profit as % of cost"
              />
            </>
          )}
        </div>
        {canSeeCost && asset.cost_currency !== asset.price_currency && asset.cost_amount && asset.price_amount && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
            <strong>Multi-Currency:</strong> Equivalents shown use daily exchange rate + 0.5 markup.
            Exchange rates update daily for accurate margin calculations.
          </div>
        )}
      </div>

      {/* Units Section (serialized only) */}
      {asset.is_serialized && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Units</h2>
            {canManage && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddForm(!showAddForm); setShowBulkModal(false); }}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  + Add Unit
                </button>
                <button
                  onClick={() => { setShowBulkModal(!showBulkModal); setShowAddForm(false); }}
                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Bulk Add
                </button>
              </div>
            )}
          </div>

          {/* Summary pills */}
          {unitSummary && (
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">Total: {unitSummary.total}</span>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Available: {unitSummary.available}</span>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Reserved: {unitSummary.reserved}</span>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-600">Sold: {unitSummary.sold}</span>
              {unitSummary.in_repair > 0 && (
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">In Repair: {unitSummary.in_repair}</span>
              )}
              {unitSummary.scrapped > 0 && (
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Scrapped: {unitSummary.scrapped}</span>
              )}
            </div>
          )}

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={unitFilter.status}
              onChange={e => setUnitFilter(f => ({ ...f, status: e.target.value }))}
              className="input-field !w-auto text-sm"
            >
              <option value="">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Reserved">Reserved</option>
              <option value="Sold">Sold</option>
              <option value="In Repair">In Repair</option>
              <option value="Scrapped">Scrapped</option>
            </select>
            <select
              value={unitFilter.condition_status_id}
              onChange={e => setUnitFilter(f => ({ ...f, condition_status_id: e.target.value }))}
              className="input-field !w-auto text-sm"
            >
              <option value="">All Conditions</option>
              {conditionStatuses.map(cs => (
                <option key={cs.id} value={cs.id}>{cs.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search serial, CPU, notes..."
              value={unitFilter.search}
              onChange={e => setUnitFilter(f => ({ ...f, search: e.target.value }))}
              className="input-field !w-auto text-sm flex-1 min-w-[180px]"
            />
          </div>

          {/* Add Unit Form */}
          {showAddForm && (
            <form onSubmit={handleAddUnit} className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Add New Unit</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Serial Number *"
                  value={addFormData.serial_number}
                  onChange={e => setAddFormData(f => ({ ...f, serial_number: e.target.value }))}
                  className="input-field text-sm"
                  required
                />
                <input
                  type="text"
                  placeholder="CPU"
                  value={addFormData.cpu}
                  onChange={e => setAddFormData(f => ({ ...f, cpu: e.target.value }))}
                  className="input-field text-sm"
                />
                <input
                  type="number"
                  placeholder="Memory (MB)"
                  value={addFormData.memory}
                  onChange={e => setAddFormData(f => ({ ...f, memory: e.target.value }))}
                  className="input-field text-sm"
                />
                <input
                  type="number"
                  placeholder="Storage (GB)"
                  value={addFormData.storage}
                  onChange={e => setAddFormData(f => ({ ...f, storage: e.target.value }))}
                  className="input-field text-sm"
                />
                {canSeeCost && (
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Cost"
                    value={addFormData.cost_amount}
                    onChange={e => setAddFormData(f => ({ ...f, cost_amount: e.target.value }))}
                    className="input-field text-sm"
                  />
                )}
                <input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={addFormData.price_amount}
                  onChange={e => setAddFormData(f => ({ ...f, price_amount: e.target.value }))}
                  className="input-field text-sm"
                />
                <select
                  value={addFormData.condition_status_id}
                  onChange={e => setAddFormData(f => ({ ...f, condition_status_id: e.target.value }))}
                  className="input-field text-sm"
                >
                  <option value="">Condition (default)</option>
                  {conditionStatuses.map(cs => (
                    <option key={cs.id} value={cs.id}>{cs.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Notes"
                  value={addFormData.notes}
                  onChange={e => setAddFormData(f => ({ ...f, notes: e.target.value }))}
                  className="input-field text-sm"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button type="submit" disabled={unitSaving} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {unitSaving ? 'Saving...' : 'Add Unit'}
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Bulk Add Modal */}
          {showBulkModal && (
            <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Bulk Add Units</h3>
              <p className="text-xs text-gray-500 mb-2">Paste one serial number per line, or upload a CSV/XLSX file. Duplicates will be skipped.</p>
              <textarea
                rows={6}
                placeholder={"SN-001\nSN-002\nSN-003"}
                value={bulkSerials}
                onChange={e => setBulkSerials(e.target.value)}
                className="input-field text-sm w-full font-mono"
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleBulkAdd}
                  disabled={unitSaving || !bulkSerials.trim()}
                  className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {unitSaving ? 'Adding...' : `Add ${bulkSerials.split('\n').filter(s => s.trim()).length} Unit(s)`}
                </button>
                <label className="px-4 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer">
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      if (file.name.endsWith('.csv')) {
                        const text = await file.text();
                        const lines = text.split('\n').map(l => l.split(',')[0].trim().replace(/^["']|["']$/g, '')).filter(Boolean);
                        // Skip header if it looks like a header
                        const start = /serial/i.test(lines[0]) ? 1 : 0;
                        setBulkSerials(prev => (prev ? prev + '\n' : '') + lines.slice(start).join('\n'));
                      } else {
                        alert('For XLSX files, please copy-paste serial numbers from your spreadsheet.');
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button onClick={() => setShowBulkModal(false)} className="px-4 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Units table */}
          {unitsLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : units.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No units found. {canManage ? 'Click "Add Unit" to get started.' : ''}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2 pr-3">Serial Number</th>
                    <th className="pb-2 pr-3">CPU</th>
                    <th className="pb-2 pr-3">Memory</th>
                    <th className="pb-2 pr-3">Storage</th>
                    <th className="pb-2 pr-3">Price</th>
                    {canSeeCost && <th className="pb-2 pr-3">Cost</th>}
                    <th className="pb-2 pr-3">Condition</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3">Notes</th>
                    {canManage && <th className="pb-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {units.map(unit => (
                    editingUnitId === unit.id ? (
                      <tr key={unit.id} className="border-b border-gray-100 bg-yellow-50">
                        <td className="py-2 pr-2">
                          <input type="text" value={editFormData.serial_number} onChange={e => setEditFormData(f => ({ ...f, serial_number: e.target.value }))} className="input-field text-xs w-28" />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="text" value={editFormData.cpu} onChange={e => setEditFormData(f => ({ ...f, cpu: e.target.value }))} className="input-field text-xs w-24" />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" value={editFormData.memory} onChange={e => setEditFormData(f => ({ ...f, memory: e.target.value }))} className="input-field text-xs w-20" placeholder="MB" />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" value={editFormData.storage} onChange={e => setEditFormData(f => ({ ...f, storage: e.target.value }))} className="input-field text-xs w-20" placeholder="GB" />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" step="0.01" value={editFormData.price_amount} onChange={e => setEditFormData(f => ({ ...f, price_amount: e.target.value }))} className="input-field text-xs w-20" />
                        </td>
                        {canSeeCost && (
                          <td className="py-2 pr-2">
                            <input type="number" step="0.01" value={editFormData.cost_amount} onChange={e => setEditFormData(f => ({ ...f, cost_amount: e.target.value }))} className="input-field text-xs w-20" />
                          </td>
                        )}
                        <td className="py-2 pr-2">
                          <select value={editFormData.condition_status_id} onChange={e => setEditFormData(f => ({ ...f, condition_status_id: e.target.value }))} className="input-field text-xs w-24">
                            <option value="">None</option>
                            {conditionStatuses.map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <select value={editFormData.status} onChange={e => setEditFormData(f => ({ ...f, status: e.target.value }))} className="input-field text-xs w-24">
                            <option value="Available">Available</option>
                            <option value="Reserved">Reserved</option>
                            <option value="Sold">Sold</option>
                            <option value="In Repair">In Repair</option>
                            <option value="Scrapped">Scrapped</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input type="text" value={editFormData.notes} onChange={e => setEditFormData(f => ({ ...f, notes: e.target.value }))} className="input-field text-xs w-24" />
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          <button onClick={() => handleEditUnit(unit.id)} disabled={unitSaving} className="text-xs text-green-600 hover:text-green-800 mr-2 disabled:opacity-50">Save</button>
                          <button onClick={() => setEditingUnitId(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={unit.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-mono text-xs">{unit.serial_number}</td>
                        <td className="py-2 pr-3 text-gray-700">{unit.cpu || '—'}</td>
                        <td className="py-2 pr-3 text-gray-700">{unit.memory ? `${unit.memory >= 1024 ? (unit.memory / 1024) + 'GB' : unit.memory + 'MB'}` : '—'}</td>
                        <td className="py-2 pr-3 text-gray-700">{unit.storage ? `${unit.storage >= 1000 ? (unit.storage / 1000) + 'TB' : unit.storage + 'GB'}` : '—'}</td>
                        <td className="py-2 pr-3">{unit.effective_price != null ? parseFloat(unit.effective_price).toFixed(2) : '—'}</td>
                        {canSeeCost && <td className="py-2 pr-3">{unit.effective_cost != null ? parseFloat(unit.effective_cost).toFixed(2) : '—'}</td>}
                        <td className="py-2 pr-3">
                          {unit.conditionStatus ? (
                            <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full" style={{ backgroundColor: unit.conditionStatus.color + '20', color: unit.conditionStatus.color }}>
                              {unit.conditionStatus.name}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2 pr-3">
                          <UnitStatusBadge status={unit.status} />
                        </td>
                        <td className="py-2 pr-3 text-gray-500 text-xs max-w-[120px] truncate" title={unit.notes}>{unit.notes || ''}</td>
                        {canManage && (
                          <td className="py-2 whitespace-nowrap">
                            <button onClick={() => startEditUnit(unit)} className="text-xs text-blue-600 hover:text-blue-800 mr-2">Edit</button>
                            {!['Sold', 'Reserved'].includes(unit.status) && (
                              <button onClick={() => handleDeleteUnit(unit.id, unit.serial_number)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Information - Collapsible */}
      <div className="card mb-6">
        <button
          onClick={() => setAuditExpanded(!auditExpanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-gray-900">Audit Information</h2>
          <span className={`text-gray-500 transition-transform duration-200 ${auditExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {auditExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
            <DetailItem
              label="Created At"
              value={new Date(asset.created_at).toLocaleString()}
            />
            <DetailItem
              label="Created By"
              value={asset.creator?.full_name}
            />
            <DetailItem
              label="Updated At"
              value={new Date(asset.updated_at).toLocaleString()}
            />
            <DetailItem
              label="Updated By"
              value={asset.updater?.full_name}
            />
          </div>
        )}
      </div>

      {/* History Timeline - Collapsible */}
      <div className="card">
        <button
          onClick={() => setHistoryExpanded(!historyExpanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            History
            {!historyLoading && history.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">({history.length} events)</span>
            )}
          </h2>
          <span className={`text-gray-500 transition-transform duration-200 ${historyExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {historyExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : history.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">No history events recorded yet.</p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                <div className="space-y-6">
                  {history.map((event, index) => (
                    <HistoryEvent key={event.id} event={event} isFirst={index === 0} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value, highlight, negative, subtext }) {
  if (!value) return null;

  // Determine text color based on props
  let valueClass = 'text-gray-900';
  if (highlight) valueClass = 'text-green-600 font-semibold';
  if (negative) valueClass = 'text-red-600 font-semibold';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {subtext && <span className="text-xs text-gray-500 ml-1">({subtext})</span>}
      </label>
      <p className={valueClass}>{value}</p>
    </div>
  );
}

/**
 * Get icon and color for event type
 */
function getEventStyle(eventType) {
  const styles = {
    IMPORTED: { icon: '📥', color: 'bg-blue-500', textColor: 'text-blue-700' },
    CREATED: { icon: '✨', color: 'bg-green-500', textColor: 'text-green-700' },
    UPDATED: { icon: '✏️', color: 'bg-yellow-500', textColor: 'text-yellow-700' },
    ADDED_TO_INVOICE: { icon: '📄', color: 'bg-purple-500', textColor: 'text-purple-700' },
    RESERVED: { icon: '🔒', color: 'bg-orange-500', textColor: 'text-orange-700' },
    SOLD: { icon: '💰', color: 'bg-green-600', textColor: 'text-green-700' },
    PAYMENT_RECEIVED: { icon: '💵', color: 'bg-green-500', textColor: 'text-green-700' },
    RETURN_INITIATED: { icon: '↩️', color: 'bg-amber-500', textColor: 'text-amber-700' },
    RETURN_FINALIZED: { icon: '✅', color: 'bg-amber-600', textColor: 'text-amber-700' },
    REFUND_ISSUED: { icon: '💸', color: 'bg-red-500', textColor: 'text-red-700' },
    EXCHANGE_CREDIT_CREATED: { icon: '🎫', color: 'bg-purple-500', textColor: 'text-purple-700' },
    CREDIT_APPLIED: { icon: '🎟️', color: 'bg-purple-400', textColor: 'text-purple-700' },
    INVENTORY_RELEASED: { icon: '📦', color: 'bg-blue-500', textColor: 'text-blue-700' },
    SOFT_DELETED: { icon: '🗑️', color: 'bg-red-500', textColor: 'text-red-700' },
    RESTORED: { icon: '♻️', color: 'bg-green-500', textColor: 'text-green-700' },
    BULK_UPLOAD_REVERTED: { icon: '⏪', color: 'bg-gray-500', textColor: 'text-gray-700' },
    INVOICE_CANCELLED: { icon: '❌', color: 'bg-red-500', textColor: 'text-red-700' },
    INVOICE_CANCELLED_INVENTORY_RELEASED: { icon: '📦', color: 'bg-blue-500', textColor: 'text-blue-700' }
  };
  return styles[eventType] || { icon: '📌', color: 'bg-gray-500', textColor: 'text-gray-700' };
}

function UnitStatusBadge({ status }) {
  const styles = {
    'Available': 'bg-green-100 text-green-700',
    'Reserved': 'bg-blue-100 text-blue-700',
    'Sold': 'bg-gray-200 text-gray-600',
    'In Repair': 'bg-orange-100 text-orange-700',
    'Scrapped': 'bg-red-100 text-red-700'
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function HistoryEvent({ event, isFirst }) {
  const style = getEventStyle(event.eventType);
  const date = new Date(event.occurredAt);

  // Check if this event is linked to an invoice
  const hasInvoiceLink = event.referenceType === 'invoice' && event.details?.invoiceId;
  const invoiceNumber = event.details?.invoiceNumber;

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div className={`absolute left-2 w-5 h-5 rounded-full ${style.color} flex items-center justify-center text-xs shadow-sm`}>
        <span className="text-white text-[10px]">{style.icon}</span>
      </div>

      <div className={`p-3 rounded-lg ${isFirst ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
        <div className="flex items-start justify-between">
          <div>
            <span className={`font-medium ${style.textColor}`}>{event.label}</span>
            {event.summary && (
              <p className="text-sm text-gray-600 mt-1">{event.summary}</p>
            )}
            {/* Invoice link for Reserved/Added to Invoice events */}
            {hasInvoiceLink && (
              <Link
                to={`/invoices/${event.details.invoiceId}`}
                className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                <span>📄</span>
                <span>View Invoice {invoiceNumber || ''}</span>
              </Link>
            )}
          </div>
          <div className="text-right text-xs text-gray-500 ml-4 whitespace-nowrap">
            <div>{date.toLocaleDateString()}</div>
            <div>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        {/* Actor and source info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          {event.actor && (
            <span>by {event.actor.name}</span>
          )}
          {event.source && event.source !== 'USER' && (
            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">
              {event.source}
            </span>
          )}
        </div>

        {/* Details expandable */}
        {event.details && Object.keys(event.details).length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
              View details
            </summary>
            <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-xs">
              <pre className="whitespace-pre-wrap text-gray-600">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
