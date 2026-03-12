import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { usePermissions } from '../hooks/usePermissions';

const REPAIR_STATE_LABELS = {
  under_repair: 'Under Repair',
  salvage_parts: 'Salvage / Parts'
};

const REPAIR_STATE_STYLES = {
  under_repair: { badge: 'bg-orange-100 text-orange-700', bg: 'bg-orange-50', btn: 'bg-orange-600 hover:bg-orange-700' },
  salvage_parts: { badge: 'bg-red-100 text-red-700', bg: 'bg-red-50', btn: 'bg-red-600 hover:bg-red-700' }
};

export default function Repairs() {
  const { permissions } = usePermissions();
  const canRepair = ['Admin', 'Manager', 'Warehouse', 'Technician'].includes(permissions?.role);

  const [tab, setTab] = useState('all'); // 'all', 'under_repair', 'salvage_parts'
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [sortBy, setSortBy] = useState('repair_updated_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [counts, setCounts] = useState({ under_repair: 0, salvage_parts: 0 });

  // Repair state change modal
  const [modal, setModal] = useState(null); // { assetId, assetTag, currentState, targetState }
  const [modalNotes, setModalNotes] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const repairStateParam = tab === 'all' ? 'under_repair,salvage_parts' : tab;

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
        repairState: repairStateParam
      };
      if (search) params.search = search;

      const response = await axios.get('/api/v1/assets', { params });
      setAssets(response.data.data.assets);
      setPagination(prev => ({ ...prev, ...response.data.data.pagination }));
    } catch (err) {
      console.error('Failed to fetch repair assets:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, tab, search, sortBy, sortOrder]);

  // Fetch counts for tabs
  const fetchCounts = useCallback(async () => {
    try {
      const [repairRes, salvageRes] = await Promise.all([
        axios.get('/api/v1/assets', { params: { repairState: 'under_repair', limit: 1 } }),
        axios.get('/api/v1/assets', { params: { repairState: 'salvage_parts', limit: 1 } })
      ]);
      setCounts({
        under_repair: repairRes.data.data.pagination.total,
        salvage_parts: salvageRes.data.data.pagination.total
      });
    } catch (err) {
      console.error('Failed to fetch counts:', err);
    }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { fetchCounts(); }, []);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleTabChange = (newTab) => {
    setTab(newTab);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  const handleRepairAction = async () => {
    if (!modal) return;
    try {
      setModalSaving(true);
      await axios.put(`/api/v1/assets/${modal.assetId}/repair-state`, {
        repair_state: modal.targetState,
        repair_notes: modalNotes || undefined
      });
      showToast('success', `${modal.assetTag} marked as ${modal.targetState === 'regular' ? 'Regular' : REPAIR_STATE_LABELS[modal.targetState]}`);
      setModal(null);
      setModalNotes('');
      fetchAssets();
      fetchCounts();
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to update repair state');
    } finally {
      setModalSaving(false);
    }
  };

  const SortHeader = ({ column, label }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="text-gray-400">
          {sortBy === column ? (sortOrder === 'ASC' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  );

  const totalCount = counts.under_repair + counts.salvage_parts;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repairs & Salvage</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} item{totalCount !== 1 ? 's' : ''} in repair or salvage
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
            <div className="text-sm text-gray-500">Total Items</div>
          </div>
        </div>
        <div className="card flex items-center gap-4 border-l-4 border-l-orange-400">
          <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-700">{counts.under_repair}</div>
            <div className="text-sm text-gray-500">Under Repair</div>
          </div>
        </div>
        <div className="card flex items-center gap-4 border-l-4 border-l-red-400">
          <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-700">{counts.salvage_parts}</div>
            <div className="text-sm text-gray-500">Salvage / Parts</div>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all', label: 'All', count: totalCount },
              { key: 'under_repair', label: 'Under Repair', count: counts.under_repair },
              { key: 'salvage_parts', label: 'Salvage / Parts', count: counts.salvage_parts }
            ].map(t => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  tab === t.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  tab === t.key ? 'bg-gray-200 text-gray-700' : 'bg-gray-200/60 text-gray-500'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by tag, make, model, serial..."
              value={search}
              onChange={handleSearch}
              className="input"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : assets.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2 text-gray-500 font-medium">No items in {tab === 'all' ? 'repair or salvage' : REPAIR_STATE_LABELS[tab]?.toLowerCase()}</p>
            <p className="text-sm text-gray-400 mt-1">Items marked for repair or salvage will appear here</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortHeader column="asset_tag" label="Asset Tag" />
                    <SortHeader column="make" label="Make & Model" />
                    <SortHeader column="category" label="Category" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specs</th>
                    <SortHeader column="quantity" label="Qty" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Repair State</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Condition</th>
                    <SortHeader column="price_amount" label="Price" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    {canRepair && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {assets.map((asset) => {
                    const rs = asset.repair_state || 'regular';
                    const style = REPAIR_STATE_STYLES[rs];
                    const remaining = asset.available_quantity != null ? Number(asset.available_quantity) : (asset.quantity || 1);
                    const total = asset.total_quantity || asset.quantity || 1;

                    return (
                      <tr key={asset.id} className={`hover:bg-gray-50 ${style?.bg || ''}`}>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <Link to={`/inventory/${asset.id}`} className="font-medium text-blue-600 hover:text-blue-800">
                            {asset.asset_tag}
                          </Link>
                          {asset.is_serialized && (
                            <span className="ml-1.5 text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 rounded">SN</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div className="font-medium text-gray-900">{asset.make}</div>
                          <div className="text-gray-500">{asset.model}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          <div>{asset.category || '—'}</div>
                          <div className="text-gray-400 text-xs">{asset.asset_type}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {asset.ram_gb && `${asset.ram_gb}GB`}
                          {asset.ram_gb && asset.storage_gb && ' / '}
                          {asset.storage_gb && `${asset.storage_gb}GB ${asset.storage_type || ''}`}
                        </td>
                        <td className="px-4 py-4 text-center text-sm">
                          <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded ${
                            remaining <= 0 ? 'bg-red-100 text-red-800 font-medium' : 'text-gray-600'
                          }`}>
                            {remaining}/{total}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {(() => {
                            const badgeClass =
                              asset.status === 'In Stock' ? 'bg-green-100 text-green-800' :
                              asset.status === 'Processing' ? 'bg-blue-100 text-blue-800' :
                              asset.status === 'Reserved' ? 'bg-yellow-100 text-yellow-800' :
                              asset.status === 'Sold' ? 'bg-gray-200 text-gray-600' :
                              'bg-purple-100 text-purple-800';
                            return (
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badgeClass}`}>
                                {asset.status}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${style?.badge || 'bg-gray-100 text-gray-600'}`}>
                            {REPAIR_STATE_LABELS[rs] || rs}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {asset.conditionStatus ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: asset.conditionStatus.color + '20', color: asset.conditionStatus.color }}
                            >
                              {asset.conditionStatus.name}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {asset.price_amount ? `${asset.price_currency} ${parseFloat(asset.price_amount).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 max-w-[200px] truncate" title={asset.repair_notes || ''}>
                          {asset.repair_notes || <span className="text-gray-300">—</span>}
                        </td>
                        {canRepair && (
                          <td className="px-4 py-4 whitespace-nowrap text-sm">
                            <div className="flex gap-2">
                              {rs === 'under_repair' && (
                                <>
                                  <button
                                    onClick={() => { setModal({ assetId: asset.id, assetTag: asset.asset_tag, currentState: rs, targetState: 'regular' }); setModalNotes(''); }}
                                    className="text-green-600 hover:text-green-800 text-xs font-medium"
                                  >
                                    Return
                                  </button>
                                  <button
                                    onClick={() => { setModal({ assetId: asset.id, assetTag: asset.asset_tag, currentState: rs, targetState: 'salvage_parts' }); setModalNotes(''); }}
                                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                                  >
                                    Salvage
                                  </button>
                                </>
                              )}
                              {rs === 'salvage_parts' && (
                                <button
                                  onClick={() => { setModal({ assetId: asset.id, assetTag: asset.asset_tag, currentState: rs, targetState: 'regular' }); setModalNotes(''); }}
                                  className="text-green-600 hover:text-green-800 text-xs font-medium"
                                >
                                  Return to Regular
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
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

      {/* Repair state change modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {modal.targetState === 'regular' ? 'Return to Regular' :
               modal.targetState === 'under_repair' ? 'Mark Under Repair' :
               'Mark Salvage / Parts'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {modal.assetTag} — currently <span className="font-medium">{REPAIR_STATE_LABELS[modal.currentState]}</span>
            </p>
            <div className="mb-4">
              <label className="label">Notes (optional)</label>
              <textarea
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                placeholder="Reason for status change..."
                className="input h-20 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setModal(null); setModalNotes(''); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                disabled={modalSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleRepairAction}
                disabled={modalSaving}
                className={`px-4 py-2 text-white text-sm rounded-lg disabled:opacity-50 ${
                  modal.targetState === 'regular' ? 'bg-green-600 hover:bg-green-700' :
                  modal.targetState === 'under_repair' ? 'bg-orange-600 hover:bg-orange-700' :
                  'bg-red-600 hover:bg-red-700'
                }`}
              >
                {modalSaving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
          toast.type === 'success' ? 'bg-green-700' : 'bg-red-700'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
