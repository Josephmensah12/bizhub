import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell } from 'recharts'
import MonthYearPicker from '../components/MonthYearPicker'

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

const DONUT_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#8b5cf6']

export default function ExpenseReportsPage() {
  const [displayCurrency, setDisplayCurrency] = useState('GHS')
  const [xRate, setXRate] = useState(1)
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState(null)
  const [vendorFilter, setVendorFilter] = useState(null)
  const [monthFilter, setMonthFilter] = useState(null)

  useEffect(() => {
    axios.get('/api/v1/exchange-rates/latest?base=USD&quote=GHS')
      .then(res => setXRate((res.data.data.rate || 1) + 1.0))
      .catch(() => setXRate(15.5))
  }, [])

  const [fullData, setFullData] = useState(null)
  const [trendData, setTrendData] = useState([])

  useEffect(() => {
    setLoading(true)
    const periodParams = selectedMonth
      ? (() => {
          const [y, m] = selectedMonth.split('-')
          return { period: 'custom', dateFrom: `${y}-${m}-01`, dateTo: new Date(parseInt(y), parseInt(m), 0).toISOString().slice(0, 10) }
        })()
      : { period }
    // Fetch period-specific data + always fetch 13-month trend separately
    Promise.all([
      axios.get('/api/v1/expenses/reports', { params: periodParams }),
      axios.get('/api/v1/expenses/reports', { params: { period: 'custom', dateFrom: (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); d.setDate(1); return d.toISOString().slice(0,10) })() } })
    ]).then(([periodRes, trendRes]) => {
      setData(periodRes.data.data)
      setFullData(periodRes.data.data)
      setTrendData(trendRes.data.data.monthly_trend || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [period, selectedMonth])

  // When a month is clicked on the trend chart, fetch that month's category breakdown
  useEffect(() => {
    if (!monthFilter || !fullData) return
    const monthStart = new Date(monthFilter)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    axios.get('/api/v1/expenses/reports', { params: { period: 'custom', dateFrom: monthStart.toISOString().slice(0,10), dateTo: monthEnd.toISOString().slice(0,10) } })
      .then(res => {
        setData(prev => ({ ...prev, by_category: res.data.data.by_category, largest_expenses: res.data.data.largest_expenses, top_vendors: res.data.data.top_vendors }))
      })
      .catch(() => {})
  }, [monthFilter, fullData])

  // When category filter changes, refetch vendors for that category
  useEffect(() => {
    if (!fullData) return
    if (!catFilter) {
      setData(prev => prev ? { ...prev, top_vendors: fullData.top_vendors } : prev)
      return
    }
    const cat = fullData.by_category?.find(c => c.category_name === catFilter)
    if (!cat) return
    const params = { period, category_id: cat.category_id }
    if (monthFilter) {
      const ms = new Date(monthFilter)
      params.period = 'custom'
      params.dateFrom = ms.toISOString().slice(0,10)
      params.dateTo = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).toISOString().slice(0,10)
    }
    axios.get('/api/v1/expenses/reports', { params })
      .then(res => setData(prev => prev ? { ...prev, top_vendors: res.data.data.top_vendors } : prev))
      .catch(() => {})
  }, [catFilter, fullData, monthFilter, period])

  const fc = (amount, fromCurrency) => convertAndFormat(amount, fromCurrency, displayCurrency, xRate)
  const fmtLocal = (v) => `GHS ${parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent"></div></div>
  if (!data) return <div className="text-center py-12 text-gray-400">No expense data</div>

  const { summary, monthly_trend, by_category, top_vendors, type_split, ratio_trend, largest_expenses, mom_comparison, category_trend } = data

  let filteredLargest = largest_expenses
  if (catFilter) filteredLargest = filteredLargest.filter(e => e.category_name === catFilter)
  if (vendorFilter) filteredLargest = filteredLargest.filter(e => (e.vendor_or_payee || 'Unspecified') === vendorFilter)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Analyze spending patterns and efficiency</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">1 USD = {xRate.toFixed(2)} GHS</span>
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setDisplayCurrency('GHS')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${displayCurrency === 'GHS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>GHS</button>
            <button onClick={() => setDisplayCurrency('USD')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${displayCurrency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>USD</button>
          </div>
          <MonthYearPicker
            value={selectedMonth}
            onChange={v => { setSelectedMonth(v); if (v) setPeriod(''); setCatFilter(null); setVendorFilter(null); setMonthFilter(null) }}
            placeholder="Pick month..."
          />
          <select value={selectedMonth ? '' : period} onChange={e => { setPeriod(e.target.value); setSelectedMonth(''); setCatFilter(null); setVendorFilter(null); setMonthFilter(null) }}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="" disabled>Period...</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          {(catFilter || vendorFilter || monthFilter || selectedMonth) && (
            <button onClick={() => { setCatFilter(null); setVendorFilter(null); setMonthFilter(null); setSelectedMonth(''); setPeriod('month'); setData(fullData) }}
              className="text-xs text-gray-500 hover:text-gray-700">Clear filters</button>
          )}
        </div>
      </div>

      {/* 1. Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
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
          <p className="text-xs text-gray-500 uppercase">Total Fixed Expenses</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{fc(summary.fixed_local || 0, 'GHS')}</p>
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

      {/* 2 & 3: Monthly Trend + Category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl border p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              Monthly Expense Trend
              {monthFilter && <span className="ml-2 text-xs font-normal text-gray-500">— {new Date(monthFilter).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>}
            </h3>
            {monthFilter && <button onClick={() => { setMonthFilter(null); setData(fullData) }} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>}
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData.map(m => ({
              ...m,
              label: new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
              ratio: m.revenue > 0 ? (m.expenses_local / m.revenue * 100) : 0
            }))}
              onClick={(state) => {
                if (state?.activePayload?.[0]?.payload?.month) {
                  const clicked = state.activePayload[0].payload.month
                  setMonthFilter(prev => prev === clicked ? null : clicked)
                  if (monthFilter === clicked) setData(fullData)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} stroke="#7c3aed" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                formatter={(value) => [fmtLocal(value), 'Expenses']}
                labelFormatter={l => l}
              />
              <Line type="monotone" dataKey="expenses_local" stroke="#7c3aed" strokeWidth={2.5} name="Expenses" dot={{ r: 4, cursor: 'pointer' }} activeDot={{ r: 6, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-2">Click a data point to filter categories below by that month.</p>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Top Vendors
            {catFilter && <span className="ml-2 text-xs font-normal text-gray-500">— {catFilter}</span>}
          </h3>
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
      </div>

      {/* Net Profit Chart */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Net Profit (Revenue - Expenses)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={trendData.map(m => ({
            label: new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            profit: (m.revenue || 0) - (m.expenses_local || 0),
            revenue: m.revenue || 0,
            expenses: m.expenses_local || 0
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [fmtLocal(value), name]}
            />
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
            <Bar dataKey="profit" name="Net Profit" radius={[4, 4, 0, 0]}>
              {trendData.map((m, i) => {
                const profit = (m.revenue || 0) - (m.expenses_local || 0)
                return <Cell key={i} fill={profit >= 0 ? '#10b981' : '#ef4444'} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Expenses by Category + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Expenses by Category
            {monthFilter && <span className="ml-2 text-xs font-normal text-gray-500">— {new Date(monthFilter).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>}
          </h3>
          {by_category.length > 0 ? (
            <div className="space-y-2">
              {by_category.map((cat, i) => {
                const maxAmt = Math.max(...by_category.map(c => c.total_local), 1)
                const isActive = catFilter === cat.category_name
                return (
                  <button key={i} onClick={() => { setCatFilter(prev => prev === cat.category_name ? null : cat.category_name); setVendorFilter(null) }}
                    className={`flex items-center gap-3 w-full text-left transition-opacity ${catFilter && !isActive ? 'opacity-40' : ''}`}>
                    <span className={`w-3 h-3 rounded-full shrink-0 ${cat.expense_type === 'recurring' ? 'ring-2 ring-purple-300' : ''}`}
                      style={{ backgroundColor: cat.expense_type === 'recurring' ? '#7c3aed' : '#3b82f6' }} />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs">
                        <span className={`${isActive ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                          {cat.category_name}
                          {cat.expense_type === 'recurring' && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">Recurring</span>
                          )}
                        </span>
                        <span className="font-medium">{fmtLocal(cat.total_local)} ({cat.pct_of_total.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                        <div className="h-full rounded-full" style={{ width: `${(cat.total_local / maxAmt) * 100}%`, backgroundColor: cat.expense_type === 'recurring' ? '#7c3aed' : '#3b82f6' }} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No data</p>}
        </div>

        <div className="bg-white rounded-xl border p-5">
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
                  <th className="text-right py-2 px-2 text-gray-500">%</th>
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
      </div>

      {/* 7. Largest Expenses */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Largest Expenses
          {(catFilter || vendorFilter) && <span className="ml-2 text-xs font-normal text-gray-500">— {catFilter || vendorFilter}</span>}
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
