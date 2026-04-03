import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import MonthYearPicker from '../components/MonthYearPicker'

function formatCurrency(amount, currency = 'GHS', rate = 1) {
  if (amount === null || amount === undefined) return '—'
  const converted = currency === 'USD' ? Number(amount) / rate : Number(amount)
  const prefix = converted < 0 ? '-' : ''
  const abs = Math.abs(converted)
  return `${prefix}${currency} ${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ChangeIndicator({ value }) {
  if (value === undefined || value === null) return null
  const isPositive = value > 0
  const isNegative = value < 0
  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-400'}`}>
      {isPositive ? '+' : ''}{value}%
    </span>
  )
}

const PERIODS = [
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom' }
]

export default function FinancialReports() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('pnl')
  const [period, setPeriod] = useState('month')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [currency, setCurrency] = useState('GHS')
  const [xRate, setXRate] = useState(1)

  const [summaryData, setSummaryData] = useState(null)
  const [pnlData, setPnlData] = useState(null)
  const [rveData, setRveData] = useState(null)
  const [loading, setLoading] = useState(true)

  const params = selectedMonth
    ? (() => {
        const [y, m] = selectedMonth.split('-')
        return { period: 'custom', startDate: `${y}-${m}-01`, endDate: new Date(parseInt(y), parseInt(m), 0).toISOString().slice(0, 10) }
      })()
    : period === 'custom'
      ? { period, startDate, endDate }
      : { period }

  // Shorthand for formatting in active currency
  const fc = (amount) => formatCurrency(amount, currency, xRate)

  // Fetch exchange rate
  useEffect(() => {
    axios.get('/api/v1/exchange-rates/latest?base=USD&quote=GHS')
      .then(res => {
        const rate = res.data?.data?.rate
        if (rate) setXRate(parseFloat(rate))
      })
      .catch(() => {})
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/financial-reports/summary', { params })
      setSummaryData(res.data.data)
    } catch (err) {
      console.error('Failed to load summary:', err)
    }
  }, [period, startDate, endDate, selectedMonth])

  const fetchPnl = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/financial-reports/pnl', { params })
      setPnlData(res.data.data)
    } catch (err) {
      console.error('Failed to load P&L:', err)
    }
  }, [period, startDate, endDate, selectedMonth])

  const fetchRve = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/financial-reports/revenue-vs-expense', { params })
      setRveData(res.data.data)
    } catch (err) {
      console.error('Failed to load revenue vs expense:', err)
    }
  }, [period, startDate, endDate, selectedMonth])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchSummary(), fetchPnl(), fetchRve()]).finally(() => setLoading(false))
  }, [fetchSummary, fetchPnl, fetchRve])

  const tabs = [
    { key: 'pnl', label: 'Profit & Loss' },
    { key: 'rve', label: 'Revenue vs Expense' }
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Company financial performance overview</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Currency Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">1 USD = {xRate.toFixed(2)} GHS</span>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setCurrency('GHS')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${currency === 'GHS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                GHS
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${currency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                USD
              </button>
            </div>
          </div>
          {/* Month picker */}
          <MonthYearPicker
            value={selectedMonth}
            onChange={v => { setSelectedMonth(v); if (v) setPeriod('') }}
            placeholder="Pick month..."
          />
          {/* Period selector */}
          <select value={selectedMonth ? '' : period} onChange={e => { setPeriod(e.target.value); setSelectedMonth('') }}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="" disabled>Period...</option>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {period === 'custom' && !selectedMonth && (
            <>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{fc(summaryData.cards.revenue.value)}</p>
            <ChangeIndicator value={summaryData.cards.revenue.change} />
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Expenses</p>
            <p className="text-xl font-bold text-red-600 mt-1">{fc(summaryData.cards.expenses.value)}</p>
            <ChangeIndicator value={summaryData.cards.expenses.change} />
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Gross Profit</p>
            <p className={`text-xl font-bold mt-1 ${summaryData.cards.gross_profit.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fc(summaryData.cards.gross_profit.value)}
            </p>
            <ChangeIndicator value={summaryData.cards.gross_profit.change} />
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Net Profit</p>
            <p className={`text-xl font-bold mt-1 ${summaryData.cards.net_profit.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fc(summaryData.cards.net_profit.value)}
            </p>
            <ChangeIndicator value={summaryData.cards.net_profit.change} />
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Collected</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{fc(summaryData.cards.collected.value)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Net Margin</p>
            <p className={`text-xl font-bold mt-1 ${summaryData.cards.net_margin.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summaryData.cards.net_margin.value}%
            </p>
          </div>
        </div>
      )}

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

      {loading && <div className="text-center py-12 text-gray-400">Loading financial data...</div>}

      {/* P&L Tab */}
      {!loading && activeTab === 'pnl' && pnlData && (
        <div className="space-y-6">
          {/* P&L Statement */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Profit & Loss Statement</h2>
            </div>
            <div className="p-6">
              <table className="w-full text-sm">
                <tbody>
                  {/* Revenue */}
                  <tr className="border-b">
                    <td className="py-3 font-semibold text-gray-900">Revenue</td>
                    <td className="py-3 text-right font-semibold text-gray-900">{fc(pnlData.summary.total_revenue)}</td>
                  </tr>
                  <tr className="text-gray-500">
                    <td className="py-2 pl-6">Invoiced ({pnlData.summary.invoice_count} invoices)</td>
                    <td className="py-2 text-right">{fc(pnlData.summary.total_revenue)}</td>
                  </tr>

                  {/* COGS */}
                  <tr className="border-b">
                    <td className="py-3 font-semibold text-gray-900">Cost of Goods Sold</td>
                    <td className="py-3 text-right font-semibold text-red-600">({fc(pnlData.summary.cost_of_goods_sold)})</td>
                  </tr>

                  {/* Gross Profit */}
                  <tr className="border-b bg-gray-50">
                    <td className="py-3 font-bold text-gray-900">Gross Profit</td>
                    <td className={`py-3 text-right font-bold ${pnlData.summary.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fc(pnlData.summary.gross_profit)}
                      <span className="text-xs text-gray-500 ml-2">({pnlData.summary.gross_margin}%)</span>
                    </td>
                  </tr>

                  {/* Operating Expenses */}
                  <tr className="border-b">
                    <td className="py-3 font-semibold text-gray-900">Operating Expenses</td>
                    <td className="py-3 text-right font-semibold text-red-600">({fc(pnlData.summary.total_expenses)})</td>
                  </tr>
                  {pnlData.expense_breakdown.map((cat, i) => (
                    <tr key={i} className="text-gray-500">
                      <td className="py-2 pl-6">
                        {cat.category}
                        {cat.is_sensitive && <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Sensitive</span>}
                      </td>
                      <td className="py-2 text-right">{fc(cat.total)}</td>
                    </tr>
                  ))}

                  {/* Net Profit */}
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="py-4 font-bold text-lg text-gray-900">Net Profit</td>
                    <td className={`py-4 text-right font-bold text-lg ${pnlData.summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fc(pnlData.summary.net_profit)}
                      <span className="text-xs text-gray-500 ml-2">({pnlData.summary.net_margin}%)</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Breakdown */}
          {pnlData.monthly_breakdown.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-6 py-4 border-b bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900">Monthly Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Month</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Revenue</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">COGS</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Gross Profit</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Expenses</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pnlData.monthly_breakdown.map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{m.month}</td>
                        <td className="px-4 py-3 text-right">{fc(m.revenue)}</td>
                        <td className="px-4 py-3 text-right text-red-600">({fc(m.cogs)})</td>
                        <td className={`px-4 py-3 text-right ${m.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fc(m.gross_profit)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">({fc(m.expenses)})</td>
                        <td className={`px-4 py-3 text-right font-semibold ${m.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fc(m.net_profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revenue vs Expense Tab */}
      {!loading && activeTab === 'rve' && rveData && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-6 py-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Revenue vs Expense Comparison</h2>
            </div>

            {rveData.comparison.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No data for this period</div>
            ) : (
              <div className="p-6">
                {/* Visual bars */}
                <div className="space-y-4 mb-8">
                  {rveData.comparison.map((m, i) => {
                    const maxVal = Math.max(...rveData.comparison.map(c => Math.max(c.revenue, c.expenses)), 1)
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-gray-700">{m.month}</span>
                          <span className={`font-semibold ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            Profit: {fc(m.profit)}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <div className="flex-1">
                            <div className="bg-green-100 rounded-full h-3">
                              <div className="bg-green-500 h-3 rounded-full" style={{ width: `${(m.revenue / maxVal) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <div className="flex-1">
                            <div className="bg-red-100 rounded-full h-3">
                              <div className="bg-red-500 h-3 rounded-full" style={{ width: `${(m.expenses / maxVal) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>Revenue: {fc(m.revenue)}</span>
                          <span>Expenses: {fc(m.expenses)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="flex gap-6 justify-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-gray-600">Revenue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-gray-600">Expenses</span>
                  </div>
                </div>

                {/* Summary table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-500">Month</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500">Revenue</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500">Expenses</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500">Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rveData.comparison.map((m, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{m.month}</td>
                          <td className="px-4 py-3 text-right text-green-600">{fc(m.revenue)}</td>
                          <td className="px-4 py-3 text-right text-red-600">{fc(m.expenses)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {fc(m.profit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
