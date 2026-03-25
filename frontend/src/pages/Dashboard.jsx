import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie, Cell, Treemap, LineChart, Line, ReferenceLine } from 'recharts'

function formatCurrency(amount, currency = 'GHS', rate = 1) {
  if (amount == null) return `${currency} 0`
  const converted = currency === 'USD' ? Number(amount) / rate : Number(amount)
  return `${currency} ${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// Format a pre-computed amount (no conversion needed)
function formatAmount(amount, currency = 'GHS') {
  if (amount == null) return `${currency} 0`
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ─── Icon components for metric cards ────────────────────────
const MetricIcons = {
  revenue: (
    <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v16M6 6a4 4 0 014-4 4 4 0 010 8H6" />
        <path d="M14 14a4 4 0 01-4 4 4 4 0 010-8h8" />
      </svg>
    </div>
  ),
  inventory: (
    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6l8-4 8 4-8 4-8-4z" />
        <path d="M2 10l8 4 8-4" />
        <path d="M2 14l8 4 8-4" />
      </svg>
    </div>
  ),
  lowStock: (
    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2L2 18h16L10 2z" />
        <path d="M10 8v4M10 14v1" />
      </svg>
    </div>
  ),
  preorders: (
    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="16" r="1.5" />
        <circle cx="15" cy="16" r="1.5" />
        <path d="M1 1h3l2 10h10l2-6H6" />
      </svg>
    </div>
  ),
}

// ─── Metric Card ─────────────────────────────────────────────
function MetricCard({ title, value, subtitle, icon, trend, trendUp, tooltip, onClick }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all duration-200 relative group ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {trend && (
              <span className={`inline-flex items-center text-xs font-medium ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={trendUp ? '' : 'rotate-180'}>
                  <path d="M6 9V3M3 5l3-3 3 3" />
                </svg>
                {trend}
              </span>
            )}
            <span className="text-xs text-gray-400">{subtitle}</span>
          </div>
        </div>
        {icon}
      </div>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
          <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-pre-line max-w-xs shadow-lg">
            {tooltip}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status Badge ────────────────────────────────────────────
function StatusBadge({ status }) {
  const styles = {
    PAID: 'bg-green-100 text-green-700',
    PARTIALLY_PAID: 'bg-blue-100 text-blue-700',
    UNPAID: 'bg-yellow-100 text-yellow-700',
    CANCELLED: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status?.replace('_', ' ')}
    </span>
  )
}

// ─── Aging Bar ───────────────────────────────────────────────
function AgingBar({ label, count, maxCount, color, alert, active, onClick }) {
  const pct = maxCount > 0 ? Math.max((count / maxCount) * 100, 4) : 0
  return (
    <div
      className={`flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${active ? 'bg-gray-100 ring-1 ring-gray-300' : 'hover:bg-gray-50'}`}
      onClick={onClick}
    >
      <div className="w-24 text-sm text-gray-500 shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-bold w-8 text-right ${alert && count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {count}
      </span>
    </div>
  )
}

// ─── Revenue Bar ─────────────────────────────────────────────
function RevenueBar({ label, value, maxValue }) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 text-xs text-gray-400 shrink-0 text-right">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 w-20 text-right">{formatCurrency(value)}</span>
    </div>
  )
}

// ─── Treemap Colors & Cell ───────────────────────────────────
const TREEMAP_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#a855f7', '#d946ef', '#10b981', '#0ea5e9'
]

function TreemapCell(props) {
  const { x, y, width, height, name, size, index } = props
  if (width < 4 || height < 4) return null
  const color = TREEMAP_COLORS[(props.parentIndex ?? index) % TREEMAP_COLORS.length]
  const showLabel = width > 45 && height > 28
  const showSize = width > 35 && height > 42
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={5} fill={color} opacity={0.85} stroke="#fff" strokeWidth={2} />
      {showLabel && (
        <text x={x + width / 2} y={y + height / 2 - (showSize ? 7 : 0)} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={width < 75 ? 10 : 12} fontWeight={600}>
          {width < 65 && name?.length > 7 ? name.slice(0, 6) + '\u2026' : name}
        </text>
      )}
      {showSize && (
        <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.85)" fontSize={11} fontWeight={500}>
          {size}
        </text>
      )}
    </g>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState(null)
  const [valuation, setValuation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [agingFilter, setAgingFilter] = useState(null)
  const [filteredTop10, setFilteredTop10] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [filteredAging, setFilteredAging] = useState(null)
  const [currency, setCurrency] = useState('GHS')
  const [xRate, setXRate] = useState(1) // GHS per USD
  const [categoryData, setCategoryData] = useState(null)
  const [conversionData, setConversionData] = useState(null)
  const [conversionRange, setConversionRange] = useState(12)

  useEffect(() => {
    async function fetchData() {
      try {
        const [metricsRes, valRes, rateRes, catRes, convRes] = await Promise.allSettled([
          axios.get('/api/v1/dashboard/metrics'),
          axios.get('/api/v1/reports/inventory-valuation'),
          axios.get('/api/v1/exchange-rates/latest?base=USD&quote=GHS'),
          axios.get('/api/v1/dashboard/category-breakdown'),
          axios.get('/api/v1/dashboard/conversion-efficiency?months=0')
        ])
        if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value.data.data)
        if (valRes.status === 'fulfilled') setValuation(valRes.value.data.data)
        if (rateRes.status === 'fulfilled') setXRate((rateRes.value.data.data.rate || 1) + 1.0)
        if (catRes.status === 'fulfilled') setCategoryData(catRes.value.data.data)
        if (convRes.status === 'fulfilled') setConversionData(convRes.value.data.data)
        if (metricsRes.status === 'rejected') {
          setError(metricsRes.reason?.response?.data?.error?.message || 'Failed to load metrics')
        }
      } catch (err) {
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.full_name?.split(' ')[0] || 'there'
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        {error}
      </div>
    )
  }

  const agingData = filteredAging || metrics?.aging_stock || {}
  const agingMax = Math.max(agingData.under_1y || 0, agingData['1_to_2y'] || 0, agingData.over_2y || 0, 1)

  const AGING_BUCKETS = [
    { key: 'under_1y', label: '< 1 year', color: 'bg-green-500' },
    { key: '1_to_2y', label: '1-2 years', color: 'bg-yellow-500' },
    { key: 'over_2y', label: '> 2 years', color: 'bg-red-500', alert: true },
  ]

  async function handleAgingClick(key) {
    const next = agingFilter === key ? null : key
    setAgingFilter(next)
    const params = new URLSearchParams()
    if (next) params.set('aging', next)
    if (categoryFilter) params.set('category', categoryFilter)
    const qs = params.toString()
    try {
      const [metricsRes, catRes] = await Promise.all([
        axios.get(`/api/v1/dashboard/metrics${qs ? '?' + qs : ''}`),
        axios.get(`/api/v1/dashboard/category-breakdown${next ? '?aging=' + next : ''}`)
      ])
      setFilteredTop10(metricsRes.data.data.top_by_quantity)
      setCategoryData(catRes.data.data)
      if (categoryFilter) setFilteredAging(metricsRes.data.data.aging_stock)
    } catch {
      setFilteredTop10(null)
    }
    if (!next && !categoryFilter) {
      setFilteredTop10(null)
      setFilteredAging(null)
      try {
        const catRes = await axios.get('/api/v1/dashboard/category-breakdown')
        setCategoryData(catRes.data.data)
      } catch {}
    }
  }

  async function handleCategoryClick(catName) {
    const next = categoryFilter === catName ? null : catName
    setCategoryFilter(next)
    if (next) {
      try {
        const params = new URLSearchParams({ category: next })
        if (agingFilter) params.set('aging', agingFilter)
        const metricsRes = await axios.get(`/api/v1/dashboard/metrics?${params}`)
        setFilteredTop10(metricsRes.data.data.top_by_quantity)
        setFilteredAging(metricsRes.data.data.aging_stock)
      } catch { setFilteredTop10(null); setFilteredAging(null) }
    } else {
      setFilteredAging(null)
      // Refetch with just aging filter if active
      if (agingFilter) {
        try {
          const metricsRes = await axios.get(`/api/v1/dashboard/metrics?aging=${agingFilter}`)
          setFilteredTop10(metricsRes.data.data.top_by_quantity)
        } catch { setFilteredTop10(null) }
      } else {
        setFilteredTop10(null)
      }
    }
  }

  const top10Data = filteredTop10 ?? metrics?.top_by_quantity
  const activeFilters = [
    agingFilter && AGING_BUCKETS.find(b => b.key === agingFilter)?.label,
    categoryFilter
  ].filter(Boolean)
  const top10Label = activeFilters.length > 0 ? `Top 10 Items — ${activeFilters.join(' / ')}` : 'Top 10 Items by Quantity'

  // Shorthand: format any GHS amount in the active display currency (for non-sales values)
  const fc = (amount) => formatCurrency(amount, currency, xRate)
  // Format sales amount using server-computed USD (historical rates)
  const fSales = (ghsAmount, usdAmount) => {
    if (currency === 'USD' && usdAmount != null) return formatAmount(usdAmount, 'USD')
    return formatAmount(ghsAmount, 'GHS')
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Greeting + Currency Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{greeting}, {firstName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{todayStr}</p>
        </div>
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
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <MetricCard
          title="Today's Revenue"
          value={fSales(metrics?.today_sales?.total_amount, metrics?.today_sales?.total_amount_usd)}
          subtitle={`${metrics?.today_sales?.transaction_count || 0} transactions`}
          icon={MetricIcons.revenue}
          tooltip={currency === 'USD' ? 'USD values use historical exchange rates from transaction dates' : undefined}
          onClick={() => navigate('/sales/invoices?date=today')}
        />
        <MetricCard
          title="Total Inventory"
          value={metrics?.inventory_on_hand?.total_units || 0}
          subtitle={valuation ? `Valued: ${fc(valuation.total_valuation)}${valuation.adjustment !== 0 ? ` (${valuation.adjustment > 0 ? '+' : ''}${fc(valuation.adjustment)} adj.)` : ''}` : `${metrics?.inventory_on_hand?.ready_for_sale || 0} ready for sale`}
          icon={MetricIcons.inventory}
          onClick={() => navigate('/inventory')}
        />
        {/* Consolidated MTD + YoY card */}
        <div
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all duration-200 cursor-pointer relative group"
          onClick={() => navigate('/sales/invoices?date=current-month')}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 mb-1">MTD Sales</p>
              <p className="text-2xl font-bold text-gray-900">{fSales(metrics?.mtd_sales?.current, metrics?.mtd_sales?.current_usd)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{metrics?.mtd_sales?.transaction_count || 0} transactions · Day 1–{new Date().getDate()}</p>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">vs Last Month</p>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const pct = currency === 'USD' ? metrics?.mtd_sales?.percent_change_usd : metrics?.mtd_sales?.percent_change
                      if (pct == null) return null
                      return (
                        <span className={`inline-flex items-center text-xs font-semibold ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={pct >= 0 ? '' : 'rotate-180'}>
                            <path d="M6 9V3M3 5l3-3 3 3" />
                          </svg>
                          {Math.abs(pct)}%
                        </span>
                      )
                    })()}
                    <span className="text-xs text-gray-400 truncate">{fSales(metrics?.mtd_sales?.previous, metrics?.mtd_sales?.previous_usd)}</span>
                  </div>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">vs Last Year</p>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const pct = currency === 'USD' ? metrics?.yoy_sales?.percent_change_usd : metrics?.yoy_sales?.percent_change
                      if (pct == null) return null
                      return (
                        <span className={`inline-flex items-center text-xs font-semibold ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={pct >= 0 ? '' : 'rotate-180'}>
                            <path d="M6 9V3M3 5l3-3 3 3" />
                          </svg>
                          {Math.abs(pct)}%
                        </span>
                      )
                    })()}
                    <span className="text-xs text-gray-400 truncate">{fSales(metrics?.yoy_sales?.previous, metrics?.yoy_sales?.previous_usd)}</span>
                  </div>
                </div>
              </div>
            </div>
            {MetricIcons.revenue}
          </div>
          {currency === 'USD' && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
              <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                USD values use historical exchange rates from transaction dates
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Sales + Aging Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Recent Sales — wider */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Recent Sales</h2>
            <Link to="/sales/invoices" className="text-xs text-primary-600 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
          {metrics?.recent_invoices && metrics.recent_invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recent_invoices.slice(0, 5).map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 pr-3">
                        <Link to={`/sales/invoices/${inv.id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-gray-700">{inv.customer_name || 'Walk-in'}</td>
                      <td className="py-2.5 pr-3 text-right font-medium text-gray-900">{fc(inv.total_amount)}</td>
                      <td className="py-2.5"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No recent invoices</p>
          )}
        </div>

        {/* Aging Stock Donut */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-900">
              Aging Stock
              {categoryFilter && <span className="ml-2 text-xs font-normal text-gray-500">— {categoryFilter}</span>}
            </h2>
            {categoryFilter && (
              <button onClick={() => handleCategoryClick(categoryFilter)} className="text-xs text-gray-500 hover:text-gray-700">
                Clear
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">Click a segment to filter charts below</p>
          {(() => {
            const DONUT_COLORS = { under_1y: '#22c55e', '1_to_2y': '#eab308', over_2y: '#ef4444' }
            const donutData = AGING_BUCKETS.map(b => ({ key: b.key, name: b.label, value: agingData[b.key] || 0 })).filter(d => d.value > 0)
            const totalAging = donutData.reduce((s, d) => s + d.value, 0)
            if (totalAging === 0) return <p className="text-sm text-gray-400 text-center py-8">No aging data</p>
            return (
              <div className="flex flex-col items-center">
                <div className="relative">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        stroke="none"
                        cursor="pointer"
                        onClick={(_, idx) => handleAgingClick(donutData[idx].key)}
                      >
                        {donutData.map((d, i) => (
                          <Cell
                            key={d.key}
                            fill={DONUT_COLORS[d.key]}
                            opacity={agingFilter && agingFilter !== d.key ? 0.3 : 1}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">{totalAging}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">items</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 mt-3">
                  {AGING_BUCKETS.map(b => {
                    const count = agingData[b.key] || 0
                    if (count === 0) return null
                    return (
                      <button
                        key={b.key}
                        onClick={() => handleAgingClick(b.key)}
                        className={`flex items-center gap-1.5 text-xs transition-opacity ${agingFilter && agingFilter !== b.key ? 'opacity-40' : ''}`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[b.key] }} />
                        <span className="text-gray-600">{b.label}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Category Treemap + Top 10 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Category Treemap */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Inventory by Category
                {agingFilter && <span className="ml-2 text-xs font-normal text-gray-500">— {AGING_BUCKETS.find(b => b.key === agingFilter)?.label}</span>}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Click a category to filter aging stock &amp; top 10</p>
            </div>
            {(agingFilter || categoryFilter) && (
              <button onClick={() => {
                if (agingFilter) handleAgingClick(agingFilter)
                if (categoryFilter) handleCategoryClick(categoryFilter)
              }} className="text-xs text-gray-500 hover:text-gray-700">
                Clear filters
              </button>
            )}
          </div>
          {categoryData && categoryData.length > 0 ? (() => {
            const flatData = []
            categoryData.forEach((cat, catIdx) => {
              (cat.children || []).forEach(child => {
                flatData.push({ name: child.name, size: child.size, category: cat.name, parentIndex: catIdx })
              })
            })
            return (
              <>
                <ResponsiveContainer width="100%" height={320}>
                  <Treemap
                    data={flatData}
                    dataKey="size"
                    aspectRatio={4 / 3}
                    stroke="#fff"
                    content={<TreemapCell />}
                  >
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.[0]) return null
                        const d = payload[0].payload
                        return (
                          <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                            <p className="font-semibold">{d.category} &rsaquo; {d.name}</p>
                            <p className="mt-0.5">{d.size} units</p>
                          </div>
                        )
                      }}
                    />
                  </Treemap>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-gray-100">
                  {categoryData.map((cat, i) => {
                    const total = cat.children.reduce((s, c) => s + c.size, 0)
                    const isActive = categoryFilter === cat.name
                    return (
                      <button
                        key={cat.name}
                        onClick={() => handleCategoryClick(cat.name)}
                        className={`flex items-center gap-1.5 text-xs transition-opacity ${categoryFilter && !isActive ? 'opacity-40' : ''}`}
                      >
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: TREEMAP_COLORS[i % TREEMAP_COLORS.length] }} />
                        <span className={`${isActive ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>{cat.name}</span>
                        <span className="font-semibold text-gray-900">{total}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )
          })() : (
            <p className="text-sm text-gray-400 py-8 text-center">No category data</p>
          )}
        </div>

        {/* Top 10 by Quantity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">{top10Label}</h2>
            {(agingFilter || categoryFilter) && (
              <button onClick={() => { setAgingFilter(null); setCategoryFilter(null); setFilteredTop10(null); setFilteredAging(null)
                // Restore unfiltered category data
                axios.get('/api/v1/dashboard/category-breakdown').then(r => setCategoryData(r.data.data)).catch(() => {})
              }} className="text-xs text-gray-500 hover:text-gray-700">
                Clear filters
              </button>
            )}
          </div>
          {top10Data && top10Data.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(top10Data.length * 36, 180)}>
              <BarChart
                layout="vertical"
                data={top10Data.map((item, idx) => ({
                  key: idx,
                  name: [item.make, item.model].filter(Boolean).join(' ') || item.asset_tag || 'Unknown',
                  searchTerm: item.model || item.make || '',
                  quantity: Number(item.quantity)
                }))}
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                barCategoryGap="20%"
                style={{ cursor: 'pointer' }}
                onClick={(state) => {
                  const term = state?.activePayload?.[0]?.payload?.searchTerm
                  if (term) navigate(`/inventory?search=${encodeURIComponent(term)}`)
                }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="quantity" fill="rgba(99,102,241,0.2)" stroke="#6366f1" strokeWidth={1.5} radius={[0, 4, 4, 0]} className="cursor-pointer" barSize={22}>
                  <LabelList dataKey="quantity" position="right" style={{ fontSize: 11, fill: '#6366f1', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">{(agingFilter || categoryFilter) ? 'No items matching filters' : 'No inventory data'}</p>
          )}
        </div>
      </div>

      {/* Inventory Conversion Efficiency */}
      {conversionData?.months?.length > 0 && (() => {
        const allMonths = conversionData.months
        const displayMonths = conversionRange === 0 ? allMonths : allMonths.slice(-conversionRange)
        return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Inventory Conversion Efficiency</h2>
              <p className="text-xs text-gray-400 mt-0.5">Monthly revenue relative to inventory value held (ratio)</p>
            </div>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {[
                { label: '12M', value: 12 },
                { label: '24M', value: 24 },
                { label: 'All', value: 0 }
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setConversionRange(opt.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${conversionRange === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={displayMonths.map(m => ({
              ...m,
              label: new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            }))} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
              <ReferenceLine y={0.5} stroke="#22c55e" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: '0.5 benchmark', position: 'right', fontSize: 10, fill: '#22c55e' }} />
              <Tooltip
                content={({ payload }) => {
                  if (!payload?.[0]) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 shadow-lg">
                      <p className="font-semibold mb-1">{new Date(d.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                      <p>Revenue: GHS {Number(d.revenue).toLocaleString()}</p>
                      <p>Avg Inventory: GHS {Number(d.avg_inventory).toLocaleString()}</p>
                      <p className="mt-1 font-semibold">Conversion Ratio: {d.ratio.toFixed(2)}</p>
                      <p className="text-gray-400 mt-0.5">{d.invoice_count} invoices</p>
                    </div>
                  )
                }}
              />
              <Line
                type="monotone"
                dataKey="ratio"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
            <span>Current inventory value: GHS {Number(conversionData.current_inventory_value).toLocaleString()}</span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t-2 border-dashed border-green-500 inline-block" />
              0.5 = healthy benchmark
            </span>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
