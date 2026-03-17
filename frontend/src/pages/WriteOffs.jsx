import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { usePermissions } from '../hooks/usePermissions'

const REASONS = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
  { value: 'obsolete', label: 'Obsolete' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'expired', label: 'Expired' },
  { value: 'other', label: 'Other' }
]

const STATUSES = [
  { value: 'PENDING', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'APPROVED', label: 'Approved', color: 'bg-green-100 text-green-800' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-800' },
  { value: 'REVERSED', label: 'Reversed', color: 'bg-gray-100 text-gray-800' }
]

function StatusBadge({ status }) {
  const s = STATUSES.find(st => st.value === status) || STATUSES[0]
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
}

function formatCurrency(amount, currency = 'GHS') {
  if (amount === null || amount === undefined) return '—'
  return `${currency} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function WriteOffs() {
  const { user } = useAuth()
  const { permissions } = usePermissions()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'Admin'
  const isApprover = ['Admin', 'Manager'].includes(user?.role)

  // List state
  const [writeOffs, setWriteOffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary, setSummary] = useState(null)
  const [filters, setFilters] = useState({ status: '', reason: '', page: 1 })

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    asset_id: '',
    asset_unit_id: '',
    reason: 'damaged',
    reason_detail: '',
    quantity: 1
  })

  // Asset search
  const [assetSearch, setAssetSearch] = useState('')
  const [assetResults, setAssetResults] = useState([])
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [assetUnits, setAssetUnits] = useState([])
  const [searchingAssets, setSearchingAssets] = useState(false)

  // Action modals
  const [actionModal, setActionModal] = useState(null) // { type: 'approve'|'reject'|'reverse', writeOff }
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchWriteOffs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page: filters.page, limit: 25, sortBy: 'created_at', sortDir: 'DESC' }
      if (filters.status) params.status = filters.status
      if (filters.reason) params.reason = filters.reason

      const res = await axios.get('/api/v1/write-offs', { params })
      setWriteOffs(res.data.data)
      setMeta(res.data.meta)
      setSummary(res.data.summary)
    } catch (err) {
      console.error('Failed to load write-offs:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchWriteOffs() }, [fetchWriteOffs])

  // Asset search
  const searchAssets = useCallback(async (query) => {
    if (query.length < 2) { setAssetResults([]); return }
    setSearchingAssets(true)
    try {
      const res = await axios.get('/api/v1/assets', { params: { search: query, limit: 10, status: 'In Stock' } })
      setAssetResults(res.data.data || [])
    } catch (err) {
      console.error('Asset search error:', err)
    } finally {
      setSearchingAssets(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchAssets(assetSearch), 300)
    return () => clearTimeout(timer)
  }, [assetSearch, searchAssets])

  // Load units when serialized asset selected
  const selectAsset = async (asset) => {
    setSelectedAsset(asset)
    setCreateForm(f => ({ ...f, asset_id: asset.id, asset_unit_id: '', quantity: 1 }))
    setAssetResults([])
    setAssetSearch(`${asset.asset_tag} - ${asset.make} ${asset.model}`)

    if (asset.is_serialized) {
      try {
        const res = await axios.get(`/api/v1/assets/${asset.id}/units`, { params: { status: 'Available' } })
        setAssetUnits(res.data.data || [])
      } catch (err) {
        console.error('Failed to load units:', err)
        setAssetUnits([])
      }
    } else {
      setAssetUnits([])
    }
  }

  // Create write-off
  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await axios.post('/api/v1/write-offs', {
        asset_id: createForm.asset_id,
        asset_unit_id: createForm.asset_unit_id || undefined,
        reason: createForm.reason,
        reason_detail: createForm.reason_detail || undefined,
        quantity: selectedAsset?.is_serialized ? 1 : parseInt(createForm.quantity)
      })
      setShowCreateModal(false)
      resetCreateForm()
      fetchWriteOffs()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to create write-off')
    } finally {
      setCreating(false)
    }
  }

  const resetCreateForm = () => {
    setCreateForm({ asset_id: '', asset_unit_id: '', reason: 'damaged', reason_detail: '', quantity: 1 })
    setSelectedAsset(null)
    setAssetSearch('')
    setAssetResults([])
    setAssetUnits([])
  }

  // Action handlers
  const handleAction = async () => {
    if (!actionModal) return
    setActionLoading(true)
    try {
      const { type, writeOff } = actionModal
      const body = {}
      if (type === 'reject') body.rejection_reason = actionReason
      if (type === 'reverse') body.reversal_reason = actionReason

      await axios.post(`/api/v1/write-offs/${writeOff.id}/${type}`, body)
      setActionModal(null)
      setActionReason('')
      fetchWriteOffs()
    } catch (err) {
      alert(err.response?.data?.error?.message || `Failed to ${actionModal.type} write-off`)
    } finally {
      setActionLoading(false)
    }
  }

  // Summary cards
  const pendingCount = summary?.byStatus?.find(s => s.status === 'PENDING')?.count || 0
  const approvedCount = summary?.byStatus?.find(s => s.status === 'APPROVED')?.count || 0
  const totalValue = summary?.totalValue || 0

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Write-Offs</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage inventory shrinkage</p>
        </div>
        <button
          onClick={() => { resetCreateForm(); setShowCreateModal(true) }}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
          New Write-Off
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Write-Offs</div>
          <div className="text-xl font-bold text-gray-900">{summary?.totalCount || 0}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-xs text-gray-500 mb-1">Pending</div>
          <div className="text-xl font-bold text-yellow-600">{pendingCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-xs text-gray-500 mb-1">Approved</div>
          <div className="text-xl font-bold text-green-600">{approvedCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Shrinkage</div>
          <div className="text-lg font-bold text-red-600">{formatCurrency(totalValue)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={filters.reason}
          onChange={e => setFilters(f => ({ ...f, reason: e.target.value, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Reasons</option>
          {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">WO #</th>
                <th className="px-4 py-3 text-left font-medium">Asset</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Reason</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium hidden md:table-cell">Cost</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Created By</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Date</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : writeOffs.length === 0 ? (
                <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-400">No write-offs found</td></tr>
              ) : writeOffs.map(wo => (
                <tr key={wo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{wo.write_off_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{wo.asset?.asset_tag || '—'}</div>
                    <div className="text-xs text-gray-500">
                      {wo.asset?.make} {wo.asset?.model}
                      {wo.assetUnit?.serial_number && <span className="ml-1">S/N: {wo.assetUnit.serial_number}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell capitalize">{wo.reason}</td>
                  <td className="px-4 py-3 text-right">{wo.quantity}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">{formatCurrency(wo.total_cost_amount, wo.currency)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={wo.status} /></td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600">{wo.creator?.full_name || '—'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                    {wo.created_at ? new Date(wo.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {wo.status === 'PENDING' && isApprover && (
                        <>
                          <button
                            onClick={() => setActionModal({ type: 'approve', writeOff: wo })}
                            className="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded hover:bg-green-50"
                            title="Approve"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setActionModal({ type: 'reject', writeOff: wo }); setActionReason('') }}
                            className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
                            title="Reject"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {wo.status === 'APPROVED' && isAdmin && (
                        <button
                          onClick={() => { setActionModal({ type: 'reverse', writeOff: wo }); setActionReason('') }}
                          className="text-orange-600 hover:text-orange-800 text-xs px-2 py-1 rounded hover:bg-orange-50"
                          title="Reverse"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <div className="text-xs text-gray-500">
              Page {meta.page} of {meta.totalPages} ({meta.total} total)
            </div>
            <div className="flex gap-1">
              <button
                disabled={meta.page <= 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">New Write-Off</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l10 10M15 5L5 15" /></svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {/* Asset search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={assetSearch}
                    onChange={e => { setAssetSearch(e.target.value); setSelectedAsset(null); setCreateForm(f => ({ ...f, asset_id: '' })) }}
                    placeholder="Search by tag, make, model..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required={!selectedAsset}
                  />
                  {searchingAssets && <div className="absolute right-3 top-2.5 text-xs text-gray-400">Searching...</div>}
                  {assetResults.length > 0 && !selectedAsset && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {assetResults.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => selectAsset(a)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                        >
                          <span className="font-medium">{a.asset_tag}</span>
                          <span className="text-gray-500 ml-2">{a.make} {a.model}</span>
                          {a.is_serialized && <span className="text-blue-500 ml-2 text-xs">(Serialized)</span>}
                          {!a.is_serialized && <span className="text-gray-400 ml-2 text-xs">Qty: {a.quantity}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Unit selection for serialized */}
              {selectedAsset?.is_serialized && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <select
                    value={createForm.asset_unit_id}
                    onChange={e => setCreateForm(f => ({ ...f, asset_unit_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select a unit...</option>
                    {assetUnits.map(u => (
                      <option key={u.id} value={u.id}>
                        S/N: {u.serial_number} {u.cpu ? `| ${u.cpu}` : ''} {u.memory ? `| ${Math.round(u.memory/1024)}GB RAM` : ''}
                      </option>
                    ))}
                  </select>
                  {assetUnits.length === 0 && <p className="text-xs text-red-500 mt-1">No available units</p>}
                </div>
              )}

              {/* Quantity for non-serialized */}
              {selectedAsset && !selectedAsset.is_serialized && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedAsset.quantity || 1}
                    value={createForm.quantity}
                    onChange={e => setCreateForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">Available: {selectedAsset.quantity}</p>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <select
                  value={createForm.reason}
                  onChange={e => setCreateForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  required
                >
                  {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {/* Detail */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
                <textarea
                  value={createForm.reason_detail}
                  onChange={e => setCreateForm(f => ({ ...f, reason_detail: e.target.value }))}
                  rows={3}
                  placeholder="Additional details about the write-off..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Auto-approve notice */}
              {isApprover && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                  This write-off will be auto-approved since you are a {user?.role}.
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createForm.asset_id || (selectedAsset?.is_serialized && !createForm.asset_unit_id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Write-Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Modal (Approve/Reject/Reverse) */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold capitalize">{actionModal.type} Write-Off</h2>
              <p className="text-sm text-gray-500">{actionModal.writeOff.write_off_number}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-gray-600">
                <p><strong>Asset:</strong> {actionModal.writeOff.asset?.asset_tag} — {actionModal.writeOff.asset?.make} {actionModal.writeOff.asset?.model}</p>
                <p><strong>Cost:</strong> {formatCurrency(actionModal.writeOff.total_cost_amount, actionModal.writeOff.currency)}</p>
                <p><strong>Reason:</strong> <span className="capitalize">{actionModal.writeOff.reason}</span></p>
              </div>

              {actionModal.type === 'approve' && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                  Approving this write-off confirms the inventory loss.
                </div>
              )}

              {(actionModal.type === 'reject' || actionModal.type === 'reverse') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {actionModal.type === 'reject' ? 'Rejection' : 'Reversal'} Reason {actionModal.type === 'reverse' ? '*' : ''}
                  </label>
                  <textarea
                    value={actionReason}
                    onChange={e => setActionReason(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required={actionModal.type === 'reverse'}
                  />
                  {actionModal.type === 'reject' && (
                    <p className="text-xs text-gray-400 mt-1">Rejecting will restore the deducted inventory.</p>
                  )}
                  {actionModal.type === 'reverse' && (
                    <p className="text-xs text-gray-400 mt-1">Reversing will restore the deducted inventory.</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setActionModal(null); setActionReason('') }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  disabled={actionLoading || (actionModal.type === 'reverse' && !actionReason.trim())}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
                    actionModal.type === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                    actionModal.type === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                    'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {actionLoading ? 'Processing...' : `${actionModal.type.charAt(0).toUpperCase() + actionModal.type.slice(1)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
