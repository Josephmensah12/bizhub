import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { usePermissions } from '../hooks/usePermissions';

const REPAIR_STATE_LABELS = {
  under_repair: 'Under Repair',
  salvage_parts: 'Salvage / Parts'
};

const REPAIR_STATE_STYLES = {
  under_repair: { badge: 'bg-orange-100 text-orange-700', row: 'border-l-orange-400', btn: 'bg-orange-600 hover:bg-orange-700' },
  salvage_parts: { badge: 'bg-red-100 text-red-700', row: 'border-l-red-400', btn: 'bg-red-600 hover:bg-red-700' }
};

const UNIT_STATUS_STYLES = {
  Available: 'bg-green-100 text-green-800',
  Reserved: 'bg-yellow-100 text-yellow-800',
  Sold: 'bg-gray-200 text-gray-600',
  'In Repair': 'bg-orange-100 text-orange-800',
  Scrapped: 'bg-purple-100 text-purple-800'
};

export default function Repairs() {
  const { permissions } = usePermissions();
  const canRepair = ['Admin', 'Manager', 'Warehouse', 'Technician'].includes(permissions?.role);

  const [tab, setTab] = useState('all');
  const [groups, setGroups] = useState([]);
  const [nonSerialized, setNonSerialized] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [counts, setCounts] = useState({ under_repair: 0, salvage_parts: 0 });
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Notes panel
  const [notesPanel, setNotesPanel] = useState(null); // { unitId, assetId, notes: [] }
  const [newNote, setNewNote] = useState('');

  // Repair state modal
  const [modal, setModal] = useState(null); // { unitId, assetId, serial, currentState, targetState }
  const [modalNotes, setModalNotes] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = { limit: 200 };
      if (tab !== 'all') params.repairState = tab;
      if (debouncedSearch) params.search = debouncedSearch;

      const res = await axios.get('/api/v1/assets/repair-units', { params });
      setGroups(res.data.data.groups);
      setNonSerialized(res.data.data.non_serialized);
      setCounts(res.data.data.counts);

      // Auto-expand all groups on first load
      if (expandedGroups.size === 0 && res.data.data.groups.length > 0) {
        setExpandedGroups(new Set(res.data.data.groups.map(g => g.asset_id)));
      }
    } catch (err) {
      console.error('Failed to fetch repair units:', err);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleGroup = (assetId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    });
  };

  const expandAll = () => setExpandedGroups(new Set(groups.map(g => g.asset_id)));
  const collapseAll = () => setExpandedGroups(new Set());

  // Add a note to an individual unit
  const addNote = async () => {
    if (!notesPanel || !newNote.trim()) return;
    try {
      await axios.put(`/api/v1/assets/${notesPanel.assetId}/units/${notesPanel.unitId}`, {
        repair_notes: newNote.trim()
      });
      showToast('success', 'Note added');
      setNewNote('');
      // Refresh data and update panel
      const res = await axios.get('/api/v1/assets/repair-units', {
        params: { limit: 200, ...(tab !== 'all' ? { repairState: tab } : {}), ...(debouncedSearch ? { search: debouncedSearch } : {}) }
      });
      setGroups(res.data.data.groups);
      setNonSerialized(res.data.data.non_serialized);
      setCounts(res.data.data.counts);
      // Update notes panel with fresh data
      const updatedGroup = res.data.data.groups.find(g => g.asset_id === notesPanel.assetId);
      const updatedUnit = updatedGroup?.units.find(u => u.id === notesPanel.unitId);
      if (updatedUnit) {
        setNotesPanel(prev => ({ ...prev, notes: Array.isArray(updatedUnit.repair_notes) ? updatedUnit.repair_notes : [] }));
      }
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to add note');
    }
  };

  // Change repair state on a single unit
  const handleRepairAction = async () => {
    if (!modal) return;
    try {
      setModalSaving(true);
      await axios.put(`/api/v1/assets/${modal.assetId}/repair-state`, {
        repair_state: modal.targetState,
        repair_notes: modalNotes || undefined,
        unit_ids: [modal.unitId]
      });
      showToast('success', `${modal.serial} marked as ${modal.targetState === 'regular' ? 'Regular' : REPAIR_STATE_LABELS[modal.targetState]}`);
      setModal(null);
      setModalNotes('');
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to update');
    } finally {
      setModalSaving(false);
    }
  };

  // Change repair state on a non-serialized asset
  const handleNonSerializedAction = async (assetId, assetTag, targetState) => {
    setModal({ unitId: null, assetId, serial: assetTag, currentState: null, targetState, isAsset: true });
    setModalNotes('');
  };

  const confirmNonSerializedAction = async () => {
    if (!modal) return;
    try {
      setModalSaving(true);
      await axios.put(`/api/v1/assets/${modal.assetId}/repair-state`, {
        repair_state: modal.targetState,
        repair_notes: modalNotes || undefined
      });
      showToast('success', `${modal.serial} marked as ${modal.targetState === 'regular' ? 'Regular' : REPAIR_STATE_LABELS[modal.targetState]}`);
      setModal(null);
      setModalNotes('');
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.error?.message || 'Failed to update');
    } finally {
      setModalSaving(false);
    }
  };

  const totalCount = counts.under_repair + counts.salvage_parts;
  const totalUnits = groups.reduce((sum, g) => sum + g.units.length, 0) + nonSerialized.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repairs & Salvage</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} item{totalCount !== 1 ? 's' : ''} across {groups.length + (nonSerialized.length > 0 ? nonSerialized.length : 0)} product{groups.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded">Expand All</button>
          <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded">Collapse All</button>
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all', label: 'All', count: totalCount },
              { key: 'under_repair', label: 'Under Repair', count: counts.under_repair },
              { key: 'salvage_parts', label: 'Salvage / Parts', count: counts.salvage_parts }
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  tab === t.key ? 'bg-gray-200 text-gray-700' : 'bg-gray-200/60 text-gray-500'
                }`}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Search serial, tag, make, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : totalUnits === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2 text-gray-500 font-medium">No items in repair or salvage</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Serialized product groups */}
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.asset_id);
              const repairCount = group.units.filter(u => u.repair_state === 'under_repair').length;
              const salvageCount = group.units.filter(u => u.repair_state === 'salvage_parts').length;

              return (
                <div key={group.asset_id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.asset_id)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <Link to={`/inventory/${group.asset_id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800" onClick={e => e.stopPropagation()}>
                        {group.asset_tag}
                      </Link>
                      <span className="text-sm font-semibold text-gray-900">{group.make} {group.model}</span>
                      <span className="text-xs text-gray-500">{group.category} / {group.asset_type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {repairCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
                          {repairCount} repair
                        </span>
                      )}
                      {salvageCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                          {salvageCount} salvage
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{group.units.length} unit{group.units.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>

                  {/* Unit rows */}
                  {isExpanded && (
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead>
                        <tr className="bg-gray-50/50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-48">Serial Number</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">Repair State</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Condition</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Specs</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                          {canRepair && <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-36">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.units.map((unit) => {
                          const rs = unit.repair_state;
                          const style = REPAIR_STATE_STYLES[rs] || {};

                          return (
                            <tr key={unit.id} className={`border-l-4 ${style.row || 'border-l-gray-200'} hover:bg-gray-50`}>
                              <td className="px-4 py-2.5">
                                <span className="font-mono text-sm text-gray-800">{unit.serial_number}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${UNIT_STATUS_STYLES[unit.status] || 'bg-gray-100 text-gray-600'}`}>
                                  {unit.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${style.badge || 'bg-gray-100 text-gray-600'}`}>
                                  {REPAIR_STATE_LABELS[rs] || rs}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                {unit.conditionStatus ? (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{ backgroundColor: unit.conditionStatus.color + '20', color: unit.conditionStatus.color }}
                                  >
                                    {unit.conditionStatus.name}
                                  </span>
                                ) : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-600">
                                {unit.cpu && <span>{unit.cpu}</span>}
                                {unit.memory && <span>{unit.cpu ? ' · ' : ''}{Math.round(unit.memory / 1024)}GB</span>}
                                {unit.storage && <span>{(unit.cpu || unit.memory) ? ' · ' : ''}{unit.storage}GB</span>}
                                {!unit.cpu && !unit.memory && !unit.storage && <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                {(() => {
                                  const notes = Array.isArray(unit.repair_notes) ? unit.repair_notes : [];
                                  const lastNote = notes.length > 0 ? notes[notes.length - 1] : null;
                                  return (
                                    <div
                                      className={`cursor-pointer hover:text-blue-600 ${notes.length > 0 ? 'text-gray-700' : 'text-gray-300'}`}
                                      onClick={() => { setNotesPanel({ unitId: unit.id, assetId: group.asset_id, serial: unit.serial_number, notes }); setNewNote(''); }}
                                    >
                                      {lastNote ? (
                                        <>
                                          <div className="text-xs max-w-[300px] whitespace-normal break-words">{lastNote.text}</div>
                                          <div className="text-[10px] text-gray-400 mt-0.5">
                                            {lastNote.author} · {new Date(lastNote.timestamp).toLocaleString()}
                                            {notes.length > 1 && <span className="ml-1 text-blue-500">+{notes.length - 1} more</span>}
                                          </div>
                                        </>
                                      ) : (
                                        <span className="text-xs">{canRepair ? 'Add notes...' : '—'}</span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              {canRepair && (
                                <td className="px-4 py-2.5">
                                  <div className="flex gap-2">
                                    {rs === 'under_repair' && (
                                      <>
                                        <button
                                          onClick={() => { setModal({ unitId: unit.id, assetId: group.asset_id, serial: unit.serial_number, currentState: rs, targetState: 'regular' }); setModalNotes(''); }}
                                          className="text-green-600 hover:text-green-800 text-xs font-medium"
                                        >Return</button>
                                        <button
                                          onClick={() => { setModal({ unitId: unit.id, assetId: group.asset_id, serial: unit.serial_number, currentState: rs, targetState: 'salvage_parts' }); setModalNotes(''); }}
                                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                                        >Salvage</button>
                                      </>
                                    )}
                                    {rs === 'salvage_parts' && (
                                      <button
                                        onClick={() => { setModal({ unitId: unit.id, assetId: group.asset_id, serial: unit.serial_number, currentState: rs, targetState: 'regular' }); setModalNotes(''); }}
                                        className="text-green-600 hover:text-green-800 text-xs font-medium"
                                      >Return to Regular</button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {/* Non-serialized assets */}
            {nonSerialized.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Non-Serialized Items</span>
                  <span className="ml-2 text-xs text-gray-400">{nonSerialized.length} item{nonSerialized.length !== 1 ? 's' : ''}</span>
                </div>
                <table className="min-w-full divide-y divide-gray-100">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Asset Tag</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Make & Model</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Repair State</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                      {canRepair && <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {nonSerialized.map((asset) => {
                      const rs = asset.repair_state;
                      const style = REPAIR_STATE_STYLES[rs] || {};
                      return (
                        <tr key={asset.id} className={`border-l-4 ${style.row || 'border-l-gray-200'} hover:bg-gray-50`}>
                          <td className="px-4 py-2.5">
                            <Link to={`/inventory/${asset.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">{asset.asset_tag}</Link>
                          </td>
                          <td className="px-4 py-2.5 text-sm">
                            <span className="font-medium text-gray-900">{asset.make}</span>
                            <span className="text-gray-500 ml-1">{asset.model}</span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-600">{asset.quantity}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${style.badge}`}>
                              {REPAIR_STATE_LABELS[rs]}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {asset.conditionStatus ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: asset.conditionStatus.color + '20', color: asset.conditionStatus.color }}>
                                {asset.conditionStatus.name}
                              </span>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[300px] whitespace-normal break-words">
                            {asset.repair_notes || <span className="text-gray-300">—</span>}
                          </td>
                          {canRepair && (
                            <td className="px-4 py-2.5">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleNonSerializedAction(asset.id, asset.asset_tag, 'regular')}
                                  className="text-green-600 hover:text-green-800 text-xs font-medium"
                                >Return</button>
                                {rs === 'under_repair' && (
                                  <button
                                    onClick={() => handleNonSerializedAction(asset.id, asset.asset_tag, 'salvage_parts')}
                                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                                  >Salvage</button>
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
            )}
          </div>
        )}
      </div>

      {/* Notes panel */}
      {notesPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Repair Notes</h3>
                <p className="text-sm text-gray-500 font-mono">{notesPanel.serial}</p>
              </div>
              <button onClick={() => setNotesPanel(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[100px]">
              {notesPanel.notes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No notes yet</p>
              ) : (
                [...notesPanel.notes].reverse().map((note, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-sm text-gray-800">{note.text}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                      <span className="font-medium text-gray-500">{note.author}</span>
                      <span>·</span>
                      <span>{new Date(note.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add note input */}
            {canRepair && (
              <div className="border-t pt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && newNote.trim()) addNote(); }}
                    placeholder="Add a note..."
                    className="input flex-1 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={addNote}
                    disabled={!newNote.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >Add</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              <span className="font-mono font-medium text-gray-700">{modal.serial}</span>
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
              >Cancel</button>
              <button
                onClick={modal.isAsset ? confirmNonSerializedAction : handleRepairAction}
                disabled={modalSaving}
                className={`px-4 py-2 text-white text-sm rounded-lg disabled:opacity-50 ${
                  modal.targetState === 'regular' ? 'bg-green-600 hover:bg-green-700' :
                  modal.targetState === 'under_repair' ? 'bg-orange-600 hover:bg-orange-700' :
                  'bg-red-600 hover:bg-red-700'
                }`}
              >{modalSaving ? 'Saving...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
          toast.type === 'success' ? 'bg-green-700' : 'bg-red-700'
        }`}>{toast.message}</div>
      )}
    </div>
  );
}
