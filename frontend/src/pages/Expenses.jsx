import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { usePermissions } from '../hooks/usePermissions'

function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—'
  return `${currency} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

// ─── Main Expenses Page ──────────────────────────────────────
export default function Expenses() {
  const { user } = useAuth()
  const { permissions } = usePermissions()
  const isAdmin = user?.role === 'Admin'
  const canCreate = ['Admin', 'Manager', 'Sales'].includes(user?.role)
  const canManage = ['Admin', 'Manager'].includes(user?.role)

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
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', category_id: '', search: '', page: 1 })

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [showRecurringModal, setShowRecurringModal] = useState(false)

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
  useEffect(() => { fetchExpenses() }, [fetchExpenses])
  useEffect(() => {
    if (activeTab === 'recurring') fetchRecurring()
    if (activeTab === 'analytics') fetchAnalytics()
  }, [activeTab, fetchRecurring, fetchAnalytics])

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
    { key: 'analytics', label: 'Analytics' }
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage business expenses</p>
        </div>
        <div className="flex gap-2">
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
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total (USD)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totals.total_usd, 'USD')}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total (Local)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totals.total_local, 'GHS')}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Expense Count</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totals.count}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border p-4 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <input type="text" placeholder="Search..." value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value, page: 1 }))}
                className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value, page: 1 }))}
                className="border rounded-lg px-3 py-2 text-sm" />
              <select value={filters.category_id}
                onChange={e => setFilters(f => ({ ...f, category_id: e.target.value, page: 1 }))}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => setFilters({ dateFrom: '', dateTo: '', category_id: '', search: '', page: 1 })}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Clear</button>
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
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">USD</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">By</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr><td colSpan="9" className="text-center py-12 text-gray-400">Loading...</td></tr>
                  ) : expenses.length === 0 ? (
                    <tr><td colSpan="9" className="text-center py-12 text-gray-400">No expenses found</td></tr>
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
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(exp.amount_local, exp.currency_code)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(exp.amount_usd, 'USD')}</td>
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
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.amount_local, r.currency_code)}</td>
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

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Expense Analytics</h2>
            <select value={analyticsPeriod} onChange={e => setAnalyticsPeriod(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>

          {!analytics ? (
            <div className="text-center py-12 text-gray-400">Loading analytics...</div>
          ) : (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500 uppercase">Total Expenses (USD)</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(analytics.summary.total_usd, 'USD')}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500 uppercase">Expense Count</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.summary.count}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500 uppercase">Avg per Expense (USD)</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(analytics.summary.avg_usd, 'USD')}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500 uppercase">Categories</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{analytics.by_category.length}</p>
                </div>
              </div>

              {/* By category */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">By Category</h3>
                <div className="space-y-3">
                  {analytics.by_category.map((cat, i) => {
                    const pct = analytics.summary.total_usd > 0 ? (cat.total_usd / analytics.summary.total_usd * 100) : 0
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{cat.category_name}</span>
                          <span className="font-medium">{formatCurrency(cat.total_usd, 'USD')} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {analytics.by_category.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No expense data for this period</p>
                  )}
                </div>
              </div>

              {/* Monthly trend */}
              {analytics.monthly_trend.length > 0 && (
                <div className="bg-white rounded-xl border p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Trend</h3>
                  <div className="space-y-2">
                    {analytics.monthly_trend.map((m, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <span className="text-sm text-gray-500 w-20">{m.period}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 relative">
                          <div className="bg-blue-500 h-4 rounded-full"
                            style={{ width: `${Math.min((m.total_usd / Math.max(...analytics.monthly_trend.map(t => t.total_usd))) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-medium w-28 text-right">{formatCurrency(m.total_usd, 'USD')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top vendors */}
              {analytics.top_vendors.length > 0 && (
                <div className="bg-white rounded-xl border p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Vendors</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-gray-500">Vendor</th>
                        <th className="text-right py-2 text-gray-500">Total (USD)</th>
                        <th className="text-right py-2 text-gray-500">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {analytics.top_vendors.map((v, i) => (
                        <tr key={i}>
                          <td className="py-2">{v.vendor}</td>
                          <td className="py-2 text-right font-medium">{formatCurrency(v.total_usd, 'USD')}</td>
                          <td className="py-2 text-right text-gray-500">{v.expense_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
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
