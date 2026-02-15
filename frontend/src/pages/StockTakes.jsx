import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  finalized: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
}

const STATUS_LABELS = {
  draft: 'Draft',
  in_progress: 'In Progress',
  under_review: 'Under Review',
  finalized: 'Finalized',
  cancelled: 'Cancelled'
}

export default function StockTakes() {
  const navigate = useNavigate()
  const [stockTakes, setStockTakes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [form, setForm] = useState({
    name: '',
    scope: 'full',
    scope_filter: { category: '' },
    blind_count: false,
    notes: ''
  })

  useEffect(() => { fetchList() }, [statusFilter])

  const fetchList = async () => {
    try {
      setLoading(true)
      const params = {}
      if (statusFilter) params.status = statusFilter
      const res = await axios.get('/api/v1/stock-takes', { params })
      setStockTakes(res.data.data.stockTakes)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load stock takes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const payload = {
        name: form.name || undefined,
        scope: form.scope,
        blind_count: form.blind_count,
        notes: form.notes || undefined
      }
      if (form.scope === 'category' && form.scope_filter.category) {
        payload.scope_filter = { category: form.scope_filter.category }
      }
      const res = await axios.post('/api/v1/stock-takes', payload)
      setShowCreate(false)
      navigate(`/stock-takes/${res.data.data.stockTake.id}`)
    } catch (err) {
      setCreateError(err.response?.data?.error?.message || 'Failed to create stock take')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this stock take?')) return
    try {
      await axios.delete(`/api/v1/stock-takes/${id}`)
      fetchList()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stock Takes</h1>
        <button
          onClick={() => { setForm({ name: '', scope: 'full', scope_filter: { category: '' }, blind_count: false, notes: '' }); setCreateError(null); setShowCreate(true) }}
          className="btn btn-primary"
        >
          + New Stock Take
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>}

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : stockTakes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No stock takes found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Scope</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stockTakes.map(st => {
                const p = st.progress || st.summary
                const progressPct = p && p.total_items > 0 ? Math.round((p.counted / p.total_items) * 100) : 0
                return (
                  <tr key={st.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/stock-takes/${st.id}`)}>
                    <td className="px-4 py-4 text-sm font-medium text-primary-600">{st.reference}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{st.name}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[st.status]}`}>
                        {STATUS_LABELS[st.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-center text-gray-500 capitalize">{st.scope}</td>
                    <td className="px-4 py-4 text-center">
                      {p ? (
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${progressPct}%` }}></div>
                          </div>
                          <span className="text-xs text-gray-500">{p.counted}/{p.total_items}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {new Date(st.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => navigate(`/stock-takes/${st.id}`)} className="text-blue-600 hover:text-blue-800">View</button>
                        {['draft', 'cancelled'].includes(st.status) && (
                          <button onClick={() => handleDelete(st.id)} className="text-red-600 hover:text-red-800">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <form onSubmit={handleCreate} className="p-6">
              <h2 className="text-lg font-semibold mb-4">New Stock Take</h2>
              {createError && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{createError}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. February 2026 Full Count"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                    <select
                      value={form.scope}
                      onChange={(e) => setForm(f => ({ ...f, scope: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="full">Full Inventory</option>
                      <option value="category">By Category</option>
                      <option value="location">By Location</option>
                    </select>
                  </div>
                  {form.scope === 'category' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <input
                        type="text"
                        value={form.scope_filter.category}
                        onChange={(e) => setForm(f => ({ ...f, scope_filter: { ...f.scope_filter, category: e.target.value } }))}
                        placeholder="e.g. Computer"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="blind_count"
                    checked={form.blind_count}
                    onChange={(e) => setForm(f => ({ ...f, blind_count: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="blind_count" className="text-sm text-gray-700">
                    Blind count (hide expected quantities during counting)
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={creating} className="btn btn-primary disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Stock Take'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
