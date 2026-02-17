import { useState, useEffect } from 'react'
import axios from 'axios'

const VALUATION_RULES = [
  { value: 'selling_price', label: 'Selling Price' },
  { value: 'cost_price', label: 'Cost Price' },
  { value: 'percentage_of_cost', label: '% of Cost' },
  { value: 'fixed_amount', label: 'Fixed Amount' },
  { value: 'zero', label: 'Zero' },
]

const NEEDS_VALUE = ['percentage_of_cost', 'fixed_amount']

function ConditionForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || {
    name: '', valuation_rule: 'selling_price', valuation_value: '', color: '#6b7280', is_default: false
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      valuation_value: NEEDS_VALUE.includes(form.valuation_rule) && form.valuation_value !== ''
        ? parseFloat(form.valuation_value)
        : null
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Name</label>
          <input name="name" value={form.name} onChange={handleChange} required className="input" placeholder="e.g. Good" />
        </div>
        <div>
          <label className="label">Valuation Rule</label>
          <select name="valuation_rule" value={form.valuation_rule} onChange={handleChange} className="input">
            {VALUATION_RULES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {NEEDS_VALUE.includes(form.valuation_rule) && (
          <div>
            <label className="label">
              {form.valuation_rule === 'percentage_of_cost' ? 'Percentage (%)' : 'Fixed Amount'}
            </label>
            <input
              name="valuation_value"
              type="number"
              step="0.01"
              min="0"
              value={form.valuation_value}
              onChange={handleChange}
              required
              className="input"
              placeholder={form.valuation_rule === 'percentage_of_cost' ? 'e.g. 75' : 'e.g. 500'}
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              name="color"
              value={form.color}
              onChange={handleChange}
              className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
            />
            <input
              type="text"
              name="color"
              value={form.color}
              onChange={handleChange}
              className="input flex-1"
              placeholder="#6b7280"
              pattern="^#[0-9a-fA-F]{6}$"
            />
          </div>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="is_default" checked={form.is_default} onChange={handleChange} className="h-4 w-4 text-primary-600 rounded" />
            <span className="text-sm text-gray-700">Default for new assets</span>
          </label>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Saving...' : (initial ? 'Update' : 'Create')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </form>
  )
}

export default function ConditionSettings() {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchStatuses = async () => {
    try {
      const res = await axios.get('/api/v1/condition-statuses')
      setStatuses(res.data.data.conditionStatuses)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load condition statuses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatuses() }, [])

  const handleCreate = async (data) => {
    try {
      setSaving(true)
      await axios.post('/api/v1/condition-statuses', data)
      setShowAdd(false)
      fetchStatuses()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (data) => {
    try {
      setSaving(true)
      await axios.put(`/api/v1/condition-statuses/${editingId}`, data)
      setEditingId(null)
      fetchStatuses()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this condition status?')) return
    try {
      await axios.delete(`/api/v1/condition-statuses/${id}`)
      fetchStatuses()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete')
    }
  }

  const handleSetDefault = async (id) => {
    try {
      await axios.put(`/api/v1/condition-statuses/${id}/set-default`)
      fetchStatuses()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to set default')
    }
  }

  const moveOrder = async (status, direction) => {
    const idx = statuses.findIndex(s => s.id === status.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= statuses.length) return

    const other = statuses[swapIdx]
    try {
      await Promise.all([
        axios.put(`/api/v1/condition-statuses/${status.id}`, { sort_order: other.sort_order }),
        axios.put(`/api/v1/condition-statuses/${other.id}`, { sort_order: status.sort_order }),
      ])
      fetchStatuses()
    } catch (err) {
      alert('Failed to reorder')
    }
  }

  const ruleLabel = (rule) => VALUATION_RULES.find(r => r.value === rule)?.label || rule

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Condition Statuses</h1>
          <p className="text-sm text-gray-500 mt-1">Configure asset conditions and their valuation rules</p>
        </div>
        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setEditingId(null) }} className="btn-primary">
            Add Condition
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
      )}

      {showAdd && (
        <div className="mb-6">
          <ConditionForm onSave={handleCreate} onCancel={() => setShowAdd(false)} saving={saving} />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Order</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Valuation Rule</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Value</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Color</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Default</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((status, idx) => (
              editingId === status.id ? (
                <tr key={status.id}>
                  <td colSpan={7} className="p-4">
                    <ConditionForm
                      initial={{
                        name: status.name,
                        valuation_rule: status.valuation_rule,
                        valuation_value: status.valuation_value != null ? status.valuation_value : '',
                        color: status.color,
                        is_default: status.is_default
                      }}
                      onSave={handleUpdate}
                      onCancel={() => setEditingId(null)}
                      saving={saving}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={status.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveOrder(status, 'up')}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-25 text-xs"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveOrder(status, 'down')}
                        disabled={idx === statuses.length - 1}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-25 text-xs"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-900">{status.name}</td>
                  <td className="py-3 px-4 text-gray-600">{ruleLabel(status.valuation_rule)}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {status.valuation_rule === 'percentage_of_cost' && status.valuation_value != null ? `${status.valuation_value}%` :
                     status.valuation_rule === 'fixed_amount' && status.valuation_value != null ? `GHS ${status.valuation_value}` :
                     '—'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: status.color }} />
                      <span className="text-xs text-gray-500 font-mono">{status.color}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {status.is_default ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Default</span>
                    ) : (
                      <button onClick={() => handleSetDefault(status.id)} className="text-xs text-gray-400 hover:text-primary-600">
                        Set default
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setEditingId(status.id); setShowAdd(false) }} className="text-primary-600 hover:text-primary-700 text-sm">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(status.id)} className="text-red-600 hover:text-red-700 text-sm">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            {statuses.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400">No condition statuses configured</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
