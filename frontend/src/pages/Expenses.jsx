import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import MonthYearPicker from '../components/MonthYearPicker'

const TREE_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#8b5cf6', '#0ea5e9', '#84cc16']

function formatCurrencyRaw(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—'
  return `${currency} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function convertAndFormat(amount, fromCurrency, displayCurrency, xRate) {
  if (amount === null || amount === undefined) return '—'
  let val = parseFloat(amount)
  if (fromCurrency === 'GHS' && displayCurrency === 'USD') val = val / xRate
  else if (fromCurrency === 'USD' && displayCurrency === 'GHS') val = val * xRate
  return `${displayCurrency} ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const EXPENSE_TYPES = [
  { value: 'one_time', label: 'One-time' },
  { value: 'fixed_recurring', label: 'Recurring' }
]

// ─── Expense Form Modal ──────────────────────────────────────
function ExpenseModal({ open, onClose, onSaved, expense, categories, isAdmin }) {
  const [form, setForm] = useState({
    expense_date: '', category_id: '', description: '', vendor_or_payee: '',
    amount_local: '', currency_code: 'GHS', exchange_rate_used: '',
    expense_type: 'one_time', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (expense) {
      setForm({
        expense_date: expense.expense_date || '',
        category_id: expense.category_id || '',
        description: expense.description || '',
        vendor_or_payee: expense.vendor_or_payee || '',
        amount_local: expense.amount_local || '',
        currency_code: expense.currency_code || 'GHS',
        exchange_rate_used: expense.exchange_rate_used || '',
        expense_type: expense.expense_type || 'one_time',
        notes: expense.notes || ''
      })
    } else {
      setForm({
        expense_date: new Date().toISOString().split('T')[0],
        category_id: '', description: '', vendor_or_payee: '',
        amount_local: '', currency_code: 'GHS', exchange_rate_used: '',
        expense_type: 'one_time', notes: ''
      })
    }
    setError('')
  }, [expense, open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        amount_local: parseFloat(form.amount_local),
        category_id: parseInt(form.category_id),
        exchange_rate_used: form.exchange_rate_used ? parseFloat(form.exchange_rate_used) : undefined
      }
      if (expense) {
        await axios.patch(`/api/v1/expenses/${expense.id}`, payload)
      } else {
        await axios.post('/api/v1/expenses', payload)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{expense ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Select...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="What was this expense for?" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor / Payee</label>
            <input type="text" value={form.vendor_or_payee} onChange={e => setForm(f => ({ ...f, vendor_or_payee: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Landlord, MTN, etc." />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input type="number" step="0.01" min="0" value={form.amount_local}
                onChange={e => setForm(f => ({ ...f, amount_local: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={form.currency_code} onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="GHS">GHS</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">FX Rate</label>
              <input type="number" step="0.0001" value={form.exchange_rate_used}
                onChange={e => setForm(f => ({ ...f, exchange_rate_used: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Auto" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.expense_type} onChange={e => setForm(f => ({ ...f, expense_type: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {EXPENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows="2" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving...' : expense ? 'Update' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Recurring Expense Modal ─────────────────────────────────
function RecurringModal({ open, onClose, onSaved, categories }) {
  const [form, setForm] = useState({
    category_id: '', description: '', vendor_or_payee: '',
    amount_local: '', currency_code: 'GHS', exchange_rate_used: '',
    start_date: '', end_date: '', auto_post_enabled: true
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({
        category_id: '', description: '', vendor_or_payee: '',
        amount_local: '', currency_code: 'GHS', exchange_rate_used: '',
        start_date: new Date().toISOString().split('T')[0], end_date: '', auto_post_enabled: true
      })
      setError('')
    }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await axios.post('/api/v1/expenses/recurring', {
        ...form,
        amount_local: parseFloat(form.amount_local),
        category_id: parseInt(form.category_id),
        exchange_rate_used: form.exchange_rate_used ? parseFloat(form.exchange_rate_used) : undefined,
        end_date: form.end_date || undefined
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create recurring expense')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Recurring Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" required>
              <option value="">Select...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Monthly office rent" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor / Payee</label>
            <input type="text" value={form.vendor_or_payee} onChange={e => setForm(f => ({ ...f, vendor_or_payee: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input type="number" step="0.01" min="0" value={form.amount_local}
                onChange={e => setForm(f => ({ ...f, amount_local: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={form.currency_code} onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="GHS">GHS</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">FX Rate</label>
              <input type="number" step="0.0001" value={form.exchange_rate_used}
                onChange={e => setForm(f => ({ ...f, exchange_rate_used: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Auto" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="auto_post" checked={form.auto_post_enabled}
              onChange={e => setForm(f => ({ ...f, auto_post_enabled: e.target.checked }))} className="rounded" />
            <label htmlFor="auto_post" className="text-sm text-gray-700">Auto-post monthly entries</label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Recurring'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Category Management Panel ──────────────────────────────
function CategoryManager({ categories, isAdmin, onCategoriesChanged }) {
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    try {
      await axios.post('/api/v1/expense-categories', { name: newName.trim() })
      setNewName('')
      onCategoriesChanged()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add category')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id) => {
    if (!editName.trim()) return
    try {
      await axios.patch(`/api/v1/expense-categories/${id}`, { name: editName.trim() })
      setEditingId(null)
      setEditName('')
      onCategoriesChanged()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update category')
    }
  }

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this category? It will no longer appear in dropdowns.')) return
    try {
      await axios.delete(`/api/v1/expense-categories/${id}`)
      onCategoriesChanged()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to deactivate category')
    }
  }

  const handleReactivate = async (id) => {
    try {
      await axios.patch(`/api/v1/expense-categories/${id}`, { is_active: true })
      onCategoriesChanged()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to reactivate category')
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Manage Expense Categories</h2>

      {/* Add new category */}
      <form onSubmit={handleAdd} className="flex gap-3 mb-6">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New category name..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm max-w-xs"
          required
        />
        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Adding...' : 'Add Category'}
        </button>
      </form>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Categories list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              {isAdmin && <th className="text-left px-4 py-3 font-medium text-gray-500">Sensitive</th>}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.length === 0 ? (
              <tr><td colSpan={isAdmin ? 4 : 3} className="text-center py-8 text-gray-400">No categories</td></tr>
            ) : categories.map(cat => (
              <tr key={cat.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {editingId === cat.id ? (
                    <div className="flex gap-2">
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="border rounded px-2 py-1 text-sm flex-1" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdate(cat.id); if (e.key === 'Escape') setEditingId(null) }} />
                      <button onClick={() => handleUpdate(cat.id)} className="text-xs text-primary-600 hover:underline">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <span className="text-gray-900">{cat.name}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{cat.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    {cat.is_sensitive && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Sensitive</span>}
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    {editingId !== cat.id && (
                      <button onClick={() => { setEditingId(cat.id); setEditName(cat.name) }}
                        className="text-xs text-primary-600 hover:underline">Rename</button>
                    )}
                    {isAdmin && cat.is_active && (
                      <button onClick={() => handleDeactivate(cat.id)}
                        className="text-xs text-red-600 hover:underline">Deactivate</button>
                    )}
                    {isAdmin && !cat.is_active && (
                      <button onClick={() => handleReactivate(cat.id)}
                        className="text-xs text-green-600 hover:underline">Reactivate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Expenses Page ──────────────────────────────────────
const DONUT_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#8b5cf6']

function ExpenseReports({ fc, displayCurrency, analyticsPeriod, setAnalyticsPeriod }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState(null)
  const [vendorFilter, setVendorFilter] = useState(null)

  useEffect(() => {
    setLoading(true)
    axios.get('/api/v1/expenses/reports', { params: { period: analyticsPeriod } })
      .then(res => setData(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [analyticsPeriod])

  if (loading) return <div className="text-center py-12 text-gray-400">Loading reports...</div>
  if (!data) return <div className="text-center py-12 text-gray-400">No data</div>

  const { summary, monthly_trend, by_category, top_vendors, type_split, ratio_trend, largest_expenses, mom_comparison } = data

  // Filter largest expenses by category or vendor
  let filteredLargest = largest_expenses
  if (catFilter) filteredLargest = filteredLargest.filter(e => e.category_name === catFilter)
  if (vendorFilter) filteredLargest = filteredLargest.filter(e => (e.vendor_or_payee || 'Unspecified') === vendorFilter)

  const fmtLocal = (v) => `GHS ${parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Expense Reports</h2>
        <select value={analyticsPeriod} onChange={e => { setAnalyticsPeriod(e.target.value); setCatFilter(null); setVendorFilter(null) }}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
          <option value="year">This Year</option>
        </select>
        {(catFilter || vendorFilter) && (
          <button onClick={() => { setCatFilter(null); setVendorFilter(null) }}
            className="text-xs text-gray-500 hover:text-gray-700 ml-2">Clear filters</button>
        )}
      </div>

      {/* 1. Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase">Total Expenses</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fc(summary.total_local, 'GHS')}</p>
          {summary.pct_change !== 0 && (
            <p className={`text-xs mt-1 ${summary.pct_change > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {summary.pct_change > 0 ? '+' : ''}{summary.pct_change.toFixed(1)}% vs prior
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase">Daily Burn Rate</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fc(summary.daily_burn, 'USD')}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase">Expense/Revenue Ratio</p>
          <p className={`text-2xl font-bold mt-1 ${summary.expense_to_revenue > 30 ? 'text-red-600' : 'text-green-600'}`}>
            {summary.expense_to_revenue.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase">Largest Expense</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fc(summary.max_usd, 'USD')}</p>
        </div>
      </div>

      {/* 2 & 3: Monthly Trend + Category Donut side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 2. Monthly Expense Trend with Revenue overlay */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Expense Trend</h3>
          <div className="space-y-2">
            {monthly_trend.map((m, i) => {
              const maxExp = Math.max(...monthly_trend.map(t => t.expenses_local), 1)
              const expPct = (m.expenses_local / maxExp) * 100
              const revPct = m.revenue > 0 ? Math.min((m.expenses_local / m.revenue) * 100, 100) : 0
              const label = new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 relative overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.max(expPct, 2)}%` }} />
                  </div>
                  <span className="text-xs font-medium w-20 text-right">{fmtLocal(m.expenses_local)}</span>
                  <span className={`text-[10px] w-10 text-right ${revPct > 30 ? 'text-red-500' : 'text-green-500'}`}>{revPct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">Purple bar = expense amount. % = expense-to-revenue ratio.</p>
        </div>

        {/* 3. Expenses by Category Donut */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Expenses by Category</h3>
          {by_category.length > 0 ? (
            <div className="space-y-2">
              {by_category.map((cat, i) => {
                const maxAmt = Math.max(...by_category.map(c => c.total_local), 1)
                const isActive = catFilter === cat.category_name
                return (
                  <button key={i} onClick={() => { setCatFilter(prev => prev === cat.category_name ? null : cat.category_name); setVendorFilter(null) }}
                    className={`flex items-center gap-3 w-full text-left transition-opacity ${catFilter && !isActive ? 'opacity-40' : ''}`}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs">
                        <span className={`${isActive ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{cat.category_name}</span>
                        <span className="font-medium">{fmtLocal(cat.total_local)} ({cat.pct_of_total.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                        <div className="h-full rounded-full" style={{ width: `${(cat.total_local / maxAmt) * 100}%`, backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No data</p>}
        </div>
      </div>

      {/* 4 & 5: Top Vendors + Recurring vs One-time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 4. Top Vendors */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Vendors</h3>
          <div className="space-y-2">
            {top_vendors.map((v, i) => {
              const maxV = Math.max(...top_vendors.map(x => x.total_local), 1)
              const isActive = vendorFilter === v.vendor
              return (
                <button key={i} onClick={() => { setVendorFilter(prev => prev === v.vendor ? null : v.vendor); setCatFilter(null) }}
                  className={`flex items-center gap-3 w-full text-left transition-opacity ${vendorFilter && !isActive ? 'opacity-40' : ''}`}>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`${isActive ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{v.vendor}</span>
                      <span className="font-medium">{fmtLocal(v.total_local)} ({v.count})</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(v.total_local / maxV) * 100}%` }} />
                    </div>
                  </div>
                </button>
              )
            })}
            {top_vendors.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data</p>}
          </div>
        </div>

        {/* 5. Recurring vs One-time + Expense-to-Revenue Ratio */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Expense Type Split</h3>
          {type_split.length > 0 ? (
            <div className="space-y-4 mb-6">
              {type_split.map((t, i) => {
                const totalAll = type_split.reduce((s, x) => s + x.total_local, 0)
                const pct = totalAll > 0 ? (t.total_local / totalAll * 100) : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 capitalize">{t.type === 'fixed_recurring' ? 'Recurring' : 'One-time'}</span>
                      <span className="font-medium">{fmtLocal(t.total_local)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div className={`h-full rounded-full ${t.type === 'fixed_recurring' ? 'bg-purple-500' : 'bg-blue-400'}`}
                        style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">No data</p>}

          <h3 className="text-sm font-semibold text-gray-700 mb-3 pt-3 border-t">Expense-to-Revenue Ratio Trend</h3>
          <div className="space-y-1.5">
            {ratio_trend.map((m, i) => {
              const label = new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-12 shrink-0">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-full rounded-full ${m.ratio > 30 ? 'bg-red-400' : m.ratio > 15 ? 'bg-yellow-400' : 'bg-green-400'}`}
                      style={{ width: `${Math.min(m.ratio, 100)}%` }} />
                  </div>
                  <span className={`text-[10px] font-medium w-10 text-right ${m.ratio > 30 ? 'text-red-500' : 'text-green-500'}`}>{m.ratio.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 6. Category Breakdown Table */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Category Breakdown
          {catFilter && <span className="ml-2 text-xs font-normal text-gray-500">— {catFilter}</span>}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 text-gray-500">Category</th>
                <th className="text-right py-2 px-2 text-gray-500">Amount ({displayCurrency})</th>
                <th className="text-right py-2 px-2 text-gray-500">% of Total</th>
                <th className="text-right py-2 px-2 text-gray-500">Count</th>
                <th className="text-right py-2 px-2 text-gray-500">Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(catFilter ? by_category.filter(c => c.category_name === catFilter) : by_category).map((c, i) => (
                <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => setCatFilter(prev => prev === c.category_name ? null : c.category_name)}>
                  <td className="py-2 px-2 font-medium">{c.category_name}</td>
                  <td className="py-2 px-2 text-right">{fc(c.total_local, 'GHS')}</td>
                  <td className="py-2 px-2 text-right text-gray-500">{c.pct_of_total.toFixed(1)}%</td>
                  <td className="py-2 px-2 text-right text-gray-500">{c.count}</td>
                  <td className="py-2 px-2 text-right text-gray-500">{fc(c.count > 0 ? c.total_local / c.count : 0, 'GHS')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Largest Expenses */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Largest Expenses
          {(catFilter || vendorFilter) && (
            <span className="ml-2 text-xs font-normal text-gray-500">— {catFilter || vendorFilter}</span>
          )}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 text-gray-500">Date</th>
                <th className="text-left py-2 px-2 text-gray-500">Description</th>
                <th className="text-left py-2 px-2 text-gray-500">Vendor</th>
                <th className="text-left py-2 px-2 text-gray-500">Category</th>
                <th className="text-left py-2 px-2 text-gray-500">Type</th>
                <th className="text-right py-2 px-2 text-gray-500">Amount ({displayCurrency})</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLargest.map((e, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="py-2 px-2 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                  <td className="py-2 px-2 max-w-[200px] truncate">{e.description}</td>
                  <td className="py-2 px-2 text-gray-500">{e.vendor_or_payee || '—'}</td>
                  <td className="py-2 px-2"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{e.category_name || '—'}</span></td>
                  <td className="py-2 px-2 text-xs text-gray-500">{e.expense_type === 'fixed_recurring' ? 'Recurring' : 'One-time'}</td>
                  <td className="py-2 px-2 text-right font-medium">{fc(e.amount_local, e.currency_code || 'GHS')}</td>
                </tr>
              ))}
              {filteredLargest.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">No expenses match filter</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 8. Month-over-Month Comparison */}
      {mom_comparison.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Month-over-Month Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 text-gray-500">Category</th>
                  <th className="text-right py-2 px-2 text-gray-500">This Month</th>
                  <th className="text-right py-2 px-2 text-gray-500">Last Month</th>
                  <th className="text-right py-2 px-2 text-gray-500">Change</th>
                  <th className="text-right py-2 px-2 text-gray-500">%</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mom_comparison.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 px-2 font-medium">{m.category}</td>
                    <td className="py-2 px-2 text-right">{fmtLocal(m.current_month)}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{fmtLocal(m.previous_month)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${m.change > 0 ? 'text-red-600' : m.change < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      {m.change > 0 ? '+' : ''}{fmtLocal(m.change)}
                    </td>
                    <td className={`py-2 px-2 text-right text-xs ${m.pct_change > 0 ? 'text-red-500' : m.pct_change < 0 ? 'text-green-500' : 'text-gray-400'}`}>
                      {m.pct_change > 0 ? '+' : ''}{m.pct_change.toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Expenses() {
  const { user } = useAuth()
  const { permissions } = usePermissions()
  const isAdmin = user?.role === 'Admin'
  const canCreate = ['Admin', 'Manager', 'Sales'].includes(user?.role)
  const canManage = ['Admin', 'Manager'].includes(user?.role)

  // Currency toggle
  const [displayCurrency, setDisplayCurrency] = useState('GHS')
  const [xRate, setXRate] = useState(1)

  useEffect(() => {
    axios.get('/api/v1/exchange-rates/latest?base=USD&quote=GHS')
      .then(res => setXRate((res.data.data.rate || 1) + 1.0))
      .catch(() => setXRate(15.5))
  }, [])

  const fc = (amount, fromCurrency) => convertAndFormat(amount, fromCurrency, displayCurrency, xRate)

  // State
  const [activeTab, setActiveTab] = useState('list')
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [recurring, setRecurring] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({ total_usd: 0, total_local: 0, count: 0 })
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 })

  // Filters
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', category_id: '', created_by: '', search: '', month: '', page: 1 })
  const [users, setUsers] = useState([])

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [showRecurringModal, setShowRecurringModal] = useState(false)

  // Category management: fetch all (including inactive) for the Categories tab
  const [allCategories, setAllCategories] = useState([])
  const fetchAllCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/expense-categories')
      setAllCategories(res.data.data.categories)
    } catch (err) {
      console.error('Failed to load all categories:', err)
    }
  }, [])

  // Analytics period
  const [analyticsPeriod, setAnalyticsPeriod] = useState('month')

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/expense-categories')
      setCategories(res.data.data.categories)
    } catch (err) {
      console.error('Failed to load categories:', err)
    }
  }, [])

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page: filters.page, limit: 50 }
      if (filters.dateFrom) params.dateFrom = filters.dateFrom
      if (filters.dateTo) params.dateTo = filters.dateTo
      if (filters.category_id) params.category_id = filters.category_id
      if (filters.search) params.search = filters.search
      if (filters.created_by) params.created_by = filters.created_by
      if (filters.month) {
        const [y, m] = filters.month.split('-')
        params.dateFrom = `${y}-${m}-01`
        params.dateTo = new Date(parseInt(y), parseInt(m), 0).toISOString().slice(0, 10)
      }

      const res = await axios.get('/api/v1/expenses', { params })
      setExpenses(res.data.data.expenses)
      setTotals(res.data.data.totals)
      setPagination(res.data.data.pagination)
    } catch (err) {
      console.error('Failed to load expenses:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Compute category totals for treemap from loaded expenses
  const categoryTreeData = useMemo(() => {
    const map = {}
    expenses.forEach(exp => {
      const name = exp.category?.name || 'Uncategorized'
      const id = exp.category?.id || ''
      if (!map[name]) map[name] = { name, size: 0, id }
      map[name].size += parseFloat(exp.amount_usd) || 0
    })
    return Object.values(map).sort((a, b) => b.size - a.size)
  }, [expenses])

  const fetchRecurring = useCallback(async () => {
    if (!canManage) return
    try {
      const res = await axios.get('/api/v1/expenses/recurring')
      setRecurring(res.data.data.recurring)
    } catch (err) {
      console.error('Failed to load recurring:', err)
    }
  }, [canManage])

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/expenses/analytics', { params: { period: analyticsPeriod } })
      setAnalytics(res.data.data)
    } catch (err) {
      console.error('Failed to load analytics:', err)
    }
  }, [analyticsPeriod])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  useEffect(() => {
    if (canManage) {
      axios.get('/api/v1/users', { params: { limit: 200 } })
        .then(res => setUsers(res.data.data?.users || res.data.data || []))
        .catch(() => {})
    }
  }, [canManage])
  useEffect(() => { fetchExpenses() }, [fetchExpenses])
  useEffect(() => {
    if (activeTab === 'recurring') fetchRecurring()
    if (activeTab === 'analytics') fetchAnalytics()
    if (activeTab === 'categories') fetchAllCategories()
  }, [activeTab, fetchRecurring, fetchAnalytics, fetchAllCategories])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return
    try {
      await axios.delete(`/api/v1/expenses/${id}`)
      fetchExpenses()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete')
    }
  }

  const handleDeactivateRecurring = async (id) => {
    if (!window.confirm('Deactivate this recurring expense?')) return
    try {
      await axios.delete(`/api/v1/expenses/recurring/${id}`)
      fetchRecurring()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to deactivate')
    }
  }

  const handleGenerateRecurring = async () => {
    try {
      const res = await axios.post('/api/v1/expenses/recurring/generate', {})
      const { generated, errors } = res.data.data
      alert(`Generated ${generated} expense(s).${errors.length ? '\nErrors: ' + errors.join(', ') : ''}`)
      fetchExpenses()
      fetchRecurring()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to generate')
    }
  }

  const tabs = [
    { key: 'list', label: 'Expenses' },
    ...(canManage ? [{ key: 'recurring', label: 'Recurring' }] : []),
    ...(canManage ? [{ key: 'categories', label: 'Categories' }] : [])
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage business expenses</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">1 USD = {xRate.toFixed(2)} GHS</span>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setDisplayCurrency('GHS')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${displayCurrency === 'GHS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                GHS
              </button>
              <button onClick={() => setDisplayCurrency('USD')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${displayCurrency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                USD
              </button>
            </div>
          </div>
          {canManage && (
            <button onClick={() => setShowRecurringModal(true)}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
              + Recurring
            </button>
          )}
          {canCreate && (
            <button onClick={() => { setEditingExpense(null); setShowExpenseModal(true) }}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              + Add Expense
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-6">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {activeTab === 'list' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total ({displayCurrency})</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {displayCurrency === 'USD' ? fc(totals.total_usd, 'USD') : fc(totals.total_local, 'GHS')}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Avg per Expense</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {displayCurrency === 'USD'
                  ? fc(totals.count > 0 ? totals.total_usd / totals.count : 0, 'USD')
                  : fc(totals.count > 0 ? totals.total_local / totals.count : 0, 'GHS')}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Expense Count</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.count}</p>
            </div>
          </div>

          {/* Category Treemap */}
          {categoryTreeData.length > 0 && (() => {
            const grandTotal = categoryTreeData.reduce((s, c) => s + c.size, 0)
            const fmtK = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`
            return (
              <div className="bg-white rounded-xl border mb-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Expenses by Category</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Click a tile to filter</p>
                  </div>
                  {filters.category_id && (
                    <button onClick={() => setFilters(f => ({ ...f, category_id: '', page: 1 }))}
                      className="text-xs text-violet-600 font-medium hover:underline">Show all</button>
                  )}
                </div>
                <div className="px-2 pb-2">
                  <ResponsiveContainer width="100%" height={220}>
                    <Treemap
                      data={categoryTreeData}
                      dataKey="size"
                      nameKey="name"
                      isAnimationActive={false}
                      content={({ x, y, width, height, name, size, index, depth }) => {
                        if (depth !== 1 || index == null || !width || !height) return null
                        const cat = categoryTreeData[index]
                        if (!cat) return null
                        const isActive = filters.category_id && String(cat.id) === String(filters.category_id)
                        const dimmed = filters.category_id && !isActive
                        const pct = grandTotal > 0 ? ((size || 0) / grandTotal * 100) : 0
                        const color = TREE_COLORS[index % TREE_COLORS.length]

                        // Tile sizing: inset by 2px for clean gaps
                        const gap = 2
                        const tx = x + gap, ty = y + gap
                        const tw = Math.max(width - gap * 2, 0), th = Math.max(height - gap * 2, 0)
                        if (tw < 2 || th < 2) return null

                        // Label logic based on tile area
                        const area = tw * th
                        const isLarge = area > 8000 && tw > 80 && th > 50
                        const isMedium = area > 3000 && tw > 50 && th > 30

                        return (
                          <g onClick={() => {
                            setFilters(f => ({
                              ...f,
                              category_id: String(f.category_id) === String(cat.id) ? '' : String(cat.id),
                              page: 1
                            }))
                          }} style={{ cursor: 'pointer' }}>
                            <rect x={tx} y={ty} width={tw} height={th} fill={color}
                              opacity={dimmed ? 0.25 : 0.88}
                              rx={6} ry={6}
                              stroke={isActive ? '#1e1b4b' : 'transparent'}
                              strokeWidth={isActive ? 2 : 0} />
                            {isLarge && (
                              <>
                                <text x={tx + tw / 2} y={ty + th / 2 - 10} textAnchor="middle"
                                  fontSize={12} fontWeight={500} fill="rgba(255,255,255,0.92)"
                                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
                                  {(name || '').length > Math.floor(tw / 8) ? (name || '').slice(0, Math.floor(tw / 8)) + '...' : name}
                                </text>
                                <text x={tx + tw / 2} y={ty + th / 2 + 8} textAnchor="middle"
                                  fontSize={14} fontWeight={700} fill="#fff"
                                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
                                  {fmtK(size || 0)}
                                </text>
                                <text x={tx + tw / 2} y={ty + th / 2 + 22} textAnchor="middle"
                                  fontSize={10} fill="rgba(255,255,255,0.6)">
                                  {pct.toFixed(1)}%
                                </text>
                              </>
                            )}
                            {!isLarge && isMedium && (
                              <text x={tx + tw / 2} y={ty + th / 2 + 4} textAnchor="middle"
                                fontSize={12} fontWeight={700} fill="#fff"
                                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
                                {fmtK(size || 0)}
                              </text>
                            )}
                          </g>
                        )
                      }}
                    >
                      <Tooltip
                        cursor={false}
                        content={({ payload }) => {
                          if (!payload?.[0]) return null
                          const d = payload[0].payload
                          const pct = grandTotal > 0 ? (d.size / grandTotal * 100) : 0
                          return (
                            <div className="bg-gray-900/95 backdrop-blur text-white text-xs px-4 py-3 rounded-lg shadow-xl border border-gray-700/50">
                              <p className="font-semibold text-[13px] mb-1">{d.name}</p>
                              <div className="flex items-baseline gap-3">
                                <span className="text-white/90">USD {parseFloat(d.size).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-white/50">{pct.toFixed(1)}% of total</span>
                              </div>
                            </div>
                          )
                        }}
                      />
                    </Treemap>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}

          {/* Filters */}
          <div className="bg-white rounded-xl border p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <input type="text" placeholder="Search..." value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                className="border rounded-lg px-3 py-2 text-sm w-44" />
              <MonthYearPicker
                value={filters.month}
                onChange={v => setFilters(f => ({ ...f, month: v, dateFrom: '', dateTo: '', page: 1 }))}
                placeholder="Pick month..."
              />
              <select value={filters.category_id}
                onChange={e => setFilters(f => ({ ...f, category_id: e.target.value, page: 1 }))}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {canManage && (
                <select value={filters.created_by}
                  onChange={e => setFilters(f => ({ ...f, created_by: e.target.value, page: 1 }))}
                  className="border rounded-lg px-3 py-2 text-sm">
                  <option value="">All Users</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              )}
              {(filters.search || filters.month || filters.category_id || filters.created_by) && (
                <button onClick={() => setFilters({ dateFrom: '', dateTo: '', category_id: '', created_by: '', search: '', month: '', page: 1 })}
                  className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Vendor</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Amount ({displayCurrency})</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">By</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr><td colSpan="8" className="text-center py-12 text-gray-400">Loading...</td></tr>
                  ) : expenses.length === 0 ? (
                    <tr><td colSpan="8" className="text-center py-12 text-gray-400">No expenses found</td></tr>
                  ) : expenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(exp.expense_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          exp.category?.is_sensitive ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>{exp.category?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate">{exp.description}</td>
                      <td className="px-4 py-3 text-gray-500">{exp.vendor_or_payee || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {displayCurrency === 'USD' ? fc(exp.amount_usd, 'USD') : fc(exp.amount_local, exp.currency_code || 'GHS')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${exp.source_type === 'auto_generated_recurring' ? 'text-purple-600' : 'text-gray-500'}`}>
                          {exp.source_type === 'auto_generated_recurring' ? 'Auto' : exp.expense_type === 'fixed_recurring' ? 'Recurring' : 'One-time'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{exp.creator?.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {canManage && (
                            <button onClick={() => { setEditingExpense(exp); setShowExpenseModal(true) }}
                              className="text-xs text-primary-600 hover:underline">Edit</button>
                          )}
                          {isAdmin && (
                            <button onClick={() => handleDelete(exp.id)}
                              className="text-xs text-red-600 hover:underline ml-2">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                <p className="text-sm text-gray-500">
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-1">
                  <button disabled={pagination.page <= 1}
                    onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50">Prev</button>
                  <button disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Recurring Tab */}
      {activeTab === 'recurring' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recurring Expenses</h2>
            {isAdmin && (
              <button onClick={handleGenerateRecurring}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                Generate Monthly Entries
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Vendor</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Start</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">End</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Last Gen</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recurring.length === 0 ? (
                  <tr><td colSpan="9" className="text-center py-8 text-gray-400">No recurring expenses</td></tr>
                ) : recurring.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{r.category?.name || '—'}</td>
                    <td className="px-4 py-3">{r.description}</td>
                    <td className="px-4 py-3 text-gray-500">{r.vendor_or_payee || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{fc(r.amount_local, r.currency_code || 'GHS')}</td>
                    <td className="px-4 py-3">{formatDate(r.start_date)}</td>
                    <td className="px-4 py-3">{r.end_date ? formatDate(r.end_date) : 'Indefinite'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.last_generated_period || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>{r.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin && r.is_active && (
                        <button onClick={() => handleDeactivateRecurring(r.id)}
                          className="text-xs text-red-600 hover:underline">Deactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && canManage && (
        <CategoryManager
          categories={allCategories}
          isAdmin={isAdmin}
          onCategoriesChanged={() => { fetchAllCategories(); fetchCategories() }}
        />
      )}

      {/* Modals */}
      <ExpenseModal
        open={showExpenseModal}
        onClose={() => { setShowExpenseModal(false); setEditingExpense(null) }}
        onSaved={fetchExpenses}
        expense={editingExpense}
        categories={categories}
        isAdmin={isAdmin}
      />
      <RecurringModal
        open={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSaved={() => { fetchRecurring(); fetchExpenses() }}
        categories={categories}
      />
    </div>
  )
}
