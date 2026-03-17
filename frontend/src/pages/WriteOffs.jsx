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

  // Salvage picker modal
  const [showPicker, setShowPicker] = useState(false)
  const [salvageUnits, setSalvageUnits] = useState([])
  const [salvageLoading, setSalvageLoading] = useState(false)
  const [selectedUnitIds, setSelectedUnitIds] = useState(new Set())
  const [bulkReason, setBulkReason] = useState('obsolete')
  const [bulkDetail, setBulkDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [salvageSearch, setSalvageSearch] = useState('')

  // Action modals
  const [actionModal, setActionModal] = useState(null)
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

  // Fetch salvage/scrapped units
  const openPicker = async () => {
    setShowPicker(true)
    setSalvageLoading(true)
    setSelectedUnitIds(new Set())
    setBulkReason('obsolete')
    setBulkDetail('')
    setSalvageSearch('')
    try {
      const res = await axios.get('/api/v1/write-offs/salvage-units')
      setSalvageUnits(res.data.data || [])
    } catch (err) {
      console.error('Failed to load salvage units:', err)
      setSalvageUnits([])
    } finally {
      setSalvageLoading(false)
    }
  }

  const toggleUnit = (id) => {
    setSelectedUnitIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedUnitIds.size === filteredSalvage.length) {
      setSelectedUnitIds(new Set())
    } else {
      setSelectedUnitIds(new Set(filteredSalvage.map(u => u.id)))
    }
  }

  // Filter salvage units by search
  const filteredSalvage = salvageUnits.filter(u => {
    if (!salvageSearch) return true
    const q = salvageSearch.toLowerCase()
    return (u.serial_number || '').toLowerCase().includes(q)
      || (u.asset_tag || '').toLowerCase().includes(q)
      || (u.make || '').toLowerCase().includes(q)
      || (u.model || '').toLowerCase().includes(q)
  })

  // Submit bulk write-offs
  const handleBulkSubmit = async () => {
    if (selectedUnitIds.size === 0) return
    setSubmitting(true)
    try {
      const res = await axios.post('/api/v1/write-offs/bulk', {
        unit_ids: [...selectedUnitIds],
        reason: bulkReason,
        reason_detail: bulkDetail || undefined
      })
      setShowPicker(false)
      fetchWriteOffs()
      alert(`${res.data.data.count} write-off(s) created successfully`)
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to create write-offs')
    } finally {
      setSubmitting(false)
    }
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
          onClick={openPicker}
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
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setActionModal({ type: 'reject', writeOff: wo }); setActionReason('') }}
                            className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {wo.status === 'APPROVED' && isAdmin && (
                        <button
                          onClick={() => { setActionModal({ type: 'reverse', writeOff: wo }); setActionReason('') }}
                          className="text-orange-600 hover:text-orange-800 text-xs px-2 py-1 rounded hover:bg-orange-50"
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

      {/* Salvage/Scrapped Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Select Units for Write-Off</h2>
                <p className="text-xs text-gray-500 mt-0.5">Showing salvage and scrapped units not yet written off</p>
              </div>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l10 10M15 5L5 15" /></svg>
              </button>
            </div>

            {/* Search + stats bar */}
            <div className="px-6 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3 shrink-0">
              <input
                type="text"
                value={salvageSearch}
                onChange={e => setSalvageSearch(e.target.value)}
                placeholder="Search by S/N, tag, make, model..."
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]"
              />
              <span className="text-xs text-gray-500">
                {filteredSalvage.length} unit{filteredSalvage.length !== 1 ? 's' : ''} available
                {selectedUnitIds.size > 0 && <span className="text-red-600 font-medium ml-2">{selectedUnitIds.size} selected</span>}
              </span>
            </div>

            {/* Unit list */}
            <div className="flex-1 overflow-y-auto">
              {salvageLoading ? (
                <div className="p-8 text-center text-gray-400">Loading units...</div>
              ) : filteredSalvage.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No salvage or scrapped units available for write-off</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={selectedUnitIds.size === filteredSalvage.length && filteredSalvage.length > 0}
                          onChange={toggleAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Asset</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Serial Number</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Condition</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSalvage.map(u => (
                      <tr
                        key={u.id}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedUnitIds.has(u.id) ? 'bg-red-50' : ''}`}
                        onClick={() => toggleUnit(u.id)}
                      >
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={selectedUnitIds.has(u.id)}
                            onChange={() => toggleUnit(u.id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900">{u.asset_tag}</div>
                          <div className="text-xs text-gray-500">{u.make} {u.model}</div>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{u.serial_number}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.condition_name === 'Salvage' ? 'bg-orange-100 text-orange-800' :
                            u.condition_name === 'Parts Only' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {u.condition_name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.status === 'Scrapped' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-xs">
                          {formatCurrency(u.unit_cost || u.product_cost, u.cost_currency || 'GHS')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer: reason + submit */}
            {filteredSalvage.length > 0 && (
              <div className="border-t px-6 py-4 bg-gray-50 shrink-0">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Reason *</label>
                    <select
                      value={bulkReason}
                      onChange={e => setBulkReason(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Details</label>
                    <input
                      type="text"
                      value={bulkDetail}
                      onChange={e => setBulkDetail(e.target.value)}
                      placeholder="Optional notes..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPicker(false)}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkSubmit}
                      disabled={submitting || selectedUnitIds.size === 0}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {submitting ? 'Creating...' : `Write Off ${selectedUnitIds.size} Unit${selectedUnitIds.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
                {isApprover && selectedUnitIds.size > 0 && (
                  <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-blue-700">
                    These will be auto-approved since you are a {user?.role}.
                  </div>
                )}
              </div>
            )}
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
