import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function formatCurrency(amount) {
  if (amount == null) return 'GHS 0'
  return `GHS ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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
function MetricCard({ title, value, subtitle, icon, trend, trendUp }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all duration-200">
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

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState(null)
  const [valuation, setValuation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [agingFilter, setAgingFilter] = useState(null)
  const [filteredTop10, setFilteredTop10] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [metricsRes, valRes] = await Promise.allSettled([
          axios.get('/api/v1/dashboard/metrics'),
          axios.get('/api/v1/reports/inventory-valuation')
        ])
        if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value.data.data)
        if (valRes.status === 'fulfilled') setValuation(valRes.value.data.data)
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

  const agingData = metrics?.aging_stock || {}
  const agingMax = Math.max(agingData.under_1y || 0, agingData['1_to_2y'] || 0, agingData.over_2y || 0, 1)

  const AGING_BUCKETS = [
    { key: 'under_1y', label: '< 1 year', color: 'bg-green-500' },
    { key: '1_to_2y', label: '1-2 years', color: 'bg-yellow-500' },
    { key: 'over_2y', label: '> 2 years', color: 'bg-red-500', alert: true },
  ]

  async function handleAgingClick(key) {
    const next = agingFilter === key ? null : key
    setAgingFilter(next)
    if (next) {
      try {
        const res = await axios.get(`/api/v1/dashboard/metrics?aging=${next}`)
        setFilteredTop10(res.data.data.top_by_quantity)
      } catch { setFilteredTop10(null) }
    } else {
      setFilteredTop10(null)
    }
  }

  const top10Data = filteredTop10 ?? metrics?.top_by_quantity
  const top10Label = agingFilter ? `Top 10 Items — ${AGING_BUCKETS.find(b => b.key === agingFilter)?.label}` : 'Top 10 Items by Quantity'

  return (
    <div className="max-w-7xl mx-auto">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {firstName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{todayStr}</p>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <MetricCard
          title="Today's Revenue"
          value={formatCurrency(metrics?.today_sales?.total_amount)}
          subtitle={`${metrics?.today_sales?.transaction_count || 0} transactions`}
          icon={MetricIcons.revenue}
        />
        <MetricCard
          title="Total Inventory"
          value={metrics?.inventory_on_hand?.total_units || 0}
          subtitle={valuation ? `Valued: ${formatCurrency(valuation.total_valuation)}${valuation.adjustment !== 0 ? ` (${valuation.adjustment > 0 ? '+' : ''}${formatCurrency(valuation.adjustment)} adj.)` : ''}` : `${metrics?.inventory_on_hand?.ready_for_sale || 0} ready for sale`}
          icon={MetricIcons.inventory}
        />
        <MetricCard
          title="MTD Sales"
          value={formatCurrency(metrics?.mtd_sales?.current)}
          subtitle={`vs ${formatCurrency(metrics?.mtd_sales?.previous)} last month`}
          icon={MetricIcons.revenue}
          trend={metrics?.mtd_sales?.percent_change != null ? `${Math.abs(metrics.mtd_sales.percent_change)}%` : null}
          trendUp={metrics?.mtd_sales?.percent_change >= 0}
        />
        <MetricCard
          title="Active Preorders"
          value={metrics?.preorders_summary?.total_active || 0}
          subtitle={`${metrics?.preorders_summary?.overdue || 0} overdue`}
          icon={MetricIcons.preorders}
        />
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
                      <td className="py-2.5 pr-3 text-right font-medium text-gray-900">{formatCurrency(inv.total_amount)}</td>
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

        {/* Aging Stock */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Aging Stock</h2>
          <p className="text-xs text-gray-400 mb-4">Click a bucket to filter Top 10</p>
          <div className="space-y-2">
            {AGING_BUCKETS.map(b => (
              <AgingBar key={b.key} label={b.label} count={agingData[b.key] || 0} maxCount={agingMax} color={b.color} alert={b.alert} active={agingFilter === b.key} onClick={() => handleAgingClick(b.key)} />
            ))}
          </div>
        </div>
      </div>

      {/* Top 10 by Quantity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{top10Label}</h2>
          {agingFilter && (
            <button onClick={() => { setAgingFilter(null); setFilteredTop10(null) }} className="text-xs text-gray-500 hover:text-gray-700">
              Clear filter
            </button>
          )}
        </div>
        {top10Data && top10Data.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(top10Data.length * 40, 200)}>
            <BarChart
              layout="vertical"
              data={top10Data.map(item => ({
                id: item.id,
                name: [item.make, item.model].filter(Boolean).join(' ') || item.asset_tag || `#${item.id}`,
                quantity: Number(item.quantity)
              }))}
              margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={(state) => {
                if (state?.activePayload?.[0]?.payload?.id) {
                  navigate(`/inventory/${state.activePayload[0].payload.id}`)
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 13 }} />
              <Tooltip />
              <Bar dataKey="quantity" fill="#6366f1" radius={[0, 4, 4, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">{agingFilter ? 'No items in this age range' : 'No inventory data'}</p>
        )}
      </div>
    </div>
  )
}
