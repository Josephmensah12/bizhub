import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { usePermissions } from '../hooks/usePermissions'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'

const ALL_TABS = [
  { id: 'my-performance', label: 'My Performance', icon: '🎯', reportKey: 'my-performance' },
  { id: 'sales', label: 'Sales Overview', icon: '📊', reportKey: 'sales' },
  { id: 'margins', label: 'Margins', icon: '💰', reportKey: 'margins' },
  { id: 'products', label: 'Top Sellers', icon: '🏆', reportKey: 'products' },
  { id: 'customers', label: 'Customers', icon: '👥', reportKey: 'customers' },
  { id: 'staff', label: 'Staff', icon: '👤', reportKey: 'staff' },
  { id: 'inventory', label: 'Inventory', icon: '📦', reportKey: 'inventory' },
]

const PERIODS = [
  { id: 'week', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
]

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function formatCurrency(amount) {
  if (amount == null) return 'GHS 0'
  return `GHS ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatPercent(val) {
  if (val == null) return '0%'
  return `${Number(val).toFixed(1)}%`
}

// ─── Info Tooltip ─────────────────────────────────────────────
function InfoTooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(s => !s)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 text-[10px] font-bold leading-none cursor-help transition-colors"
        aria-label="More info"
      >
        i
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-white border-r border-b border-gray-200 rotate-45" />
        </div>
      )}
    </span>
  )
}

// ─── Metric Card ──────────────────────────────────────────────
function MetricCard({ title, value, subtitle, icon, trend, trendUp, info }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
          {title}
          {info && <InfoTooltip text={info} />}
        </span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="flex items-center mt-1">
        {trend && (
          <span className={`text-sm font-medium ${trendUp ? 'text-green-600' : 'text-red-600'} mr-2`}>
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
        {subtitle && <span className="text-sm text-gray-500">{subtitle}</span>}
      </div>
    </div>
  )
}

// ─── Sales Tab ────────────────────────────────────────────────
function SalesTab({ data, loading }) {
  if (loading) return <LoadingSpinner />
  if (!data) return <EmptyState message="No sales data available" />

  const { summary, daily_trend, status_breakdown } = data

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(summary.total_revenue)}
          subtitle={`${summary.total_invoices} invoices`}
          icon="💰"
          info="Sum of all invoice totals for the period. Formula: SUM(invoice total_amount) where status is not cancelled."
        />
        <MetricCard
          title="Total Profit"
          value={formatCurrency(summary.total_profit)}
          subtitle={`${formatPercent(summary.overall_margin_percent)} margin`}
          icon="📈"
          info="Revenue minus cost across all invoices. Formula: SUM(total_amount) - SUM(total_cost_amount)."
        />
        <MetricCard
          title="Avg Invoice"
          value={formatCurrency(summary.avg_invoice_value)}
          subtitle={`Max: ${formatCurrency(summary.max_invoice_value)}`}
          icon="🧾"
          info="Average value per invoice in the period. Formula: Total Revenue / Number of Invoices."
        />
        <MetricCard
          title="Daily Average"
          value={formatCurrency(daily_trend.length > 0 ? summary.total_revenue / daily_trend.length : 0)}
          subtitle={`${daily_trend.length > 0 ? (summary.total_invoices / daily_trend.length).toFixed(1) : 0} invoices/day`}
          icon="📅"
          info="Average revenue per active selling day. Formula: Total Revenue / Number of Days with Sales."
        />
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={daily_trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
            <YAxis tickFormatter={(v) => `₵${(v/1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value) => [formatCurrency(value)]}
              labelFormatter={(d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            />
            <Legend />
            <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} name="Revenue" />
            <Area type="monotone" dataKey="profit" stroke="#10b981" fill="#10b981" fillOpacity={0.15} name="Profit" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Sales Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">Date</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Invoices</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Revenue</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Cost</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Profit</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Margin</th>
              </tr>
            </thead>
            <tbody>
              {daily_trend.slice().reverse().map((day) => {
                const margin = day.revenue > 0 ? (day.profit / day.revenue * 100) : 0
                return (
                  <tr key={day.date} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                    <td className="text-right py-2 px-3">{day.invoice_count}</td>
                    <td className="text-right py-2 px-3 font-medium">{formatCurrency(day.revenue)}</td>
                    <td className="text-right py-2 px-3 text-gray-500">{formatCurrency(day.cost)}</td>
                    <td className={`text-right py-2 px-3 font-medium ${day.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(day.profit)}
                    </td>
                    <td className={`text-right py-2 px-3 ${margin >= 20 ? 'text-green-600' : margin >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {formatPercent(margin)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {status_breakdown.map((s) => (
            <div key={s.status} className="text-center p-3 rounded-lg bg-gray-50">
              <div className="text-2xl font-bold text-gray-900">{s.count}</div>
              <div className="text-sm text-gray-500">{s.status}</div>
              <div className="text-sm font-medium text-gray-700">{formatCurrency(s.total)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Margins Tab ──────────────────────────────────────────────
function MarginsTab({ data, loading }) {
  if (loading) return <LoadingSpinner />
  if (!data) return <EmptyState message="No margin data available" />

  const { overall, by_category, by_model, loss_makers, trend } = data

  return (
    <div className="space-y-6">
      {/* Overall Margin */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(overall.total_revenue)}
          icon="💰"
          info="Sum of all invoice totals in the period. Formula: SUM(invoice total_amount)."
        />
        <MetricCard
          title="Total Profit"
          value={formatCurrency(overall.total_profit)}
          icon="📈"
          info="Total revenue minus total cost. Formula: Total Revenue - Total Cost."
        />
        <MetricCard
          title="Avg Margin"
          value={formatPercent(overall.avg_margin)}
          subtitle={`Min: ${formatPercent(overall.min_margin)} / Max: ${formatPercent(overall.max_margin)}`}
          icon="📊"
          info="Average profit margin across invoices. Formula: AVG(Profit / Revenue * 100) per invoice."
        />
        <MetricCard
          title="Total Cost"
          value={formatCurrency(overall.total_cost)}
          icon="🏷️"
          info="Sum of cost prices for all items sold. Formula: SUM(invoice total_cost_amount)."
        />
      </div>

      {/* Margin Trend */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Margin Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
            <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} />
            <Tooltip
              formatter={(value, name) => [name === 'avg_margin' ? formatPercent(value) : formatCurrency(value), name === 'avg_margin' ? 'Avg Margin' : 'Profit']}
              labelFormatter={(d) => new Date(d).toLocaleDateString()}
            />
            <Legend />
            <Line type="monotone" dataKey="avg_margin" stroke="#3b82f6" strokeWidth={2} name="Avg Margin %" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Margin by Category */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Margin by Category</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">Category</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Type</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Revenue</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Cost</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Profit</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Margin</th>
              </tr>
            </thead>
            <tbody>
              {by_category.map((c, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{c.category}</td>
                  <td className="py-2 px-3">{c.asset_type}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(c.revenue)}</td>
                  <td className="text-right py-2 px-3 text-gray-500">{formatCurrency(c.cost)}</td>
                  <td className={`text-right py-2 px-3 font-medium ${c.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(c.profit)}
                  </td>
                  <td className={`text-right py-2 px-3 font-medium ${c.margin_percent >= 20 ? 'text-green-600' : c.margin_percent >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatPercent(c.margin_percent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Models by Margin */}
      {by_model && by_model.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Models by Margin</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">#</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Model</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Category</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Sold</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Revenue</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Cost</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Profit</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Margin</th>
                </tr>
              </thead>
              <tbody>
                {by_model.map((m, i) => (
                  <tr key={`${m.make}-${m.model}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                    <td className="py-2 px-3 font-medium">{m.make} {m.model}</td>
                    <td className="py-2 px-3 text-gray-500">{m.asset_type}</td>
                    <td className="text-right py-2 px-3">{m.total_sold}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(m.total_revenue)}</td>
                    <td className="text-right py-2 px-3 text-gray-500">{formatCurrency(m.total_cost)}</td>
                    <td className={`text-right py-2 px-3 font-medium ${m.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(m.total_profit)}
                    </td>
                    <td className={`text-right py-2 px-3 font-medium ${m.margin_percent >= 20 ? 'text-green-600' : m.margin_percent >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {formatPercent(m.margin_percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Loss Makers */}
      {loss_makers.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-5">
          <h3 className="text-lg font-semibold text-red-700 mb-4">⚠️ Negative Margin Invoices</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Invoice</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Date</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Revenue</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Cost</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Loss</th>
                </tr>
              </thead>
              <tbody>
                {loss_makers.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 hover:bg-red-50">
                    <td className="py-2 px-3 font-medium">{l.invoice_number}</td>
                    <td className="py-2 px-3">{new Date(l.invoice_date).toLocaleDateString()}</td>
                    <td className="py-2 px-3">{l.customer_name || 'Walk-in'}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(l.total_amount)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(l.total_cost_amount)}</td>
                    <td className="text-right py-2 px-3 font-medium text-red-600">{formatCurrency(l.total_profit_amount)}</td>
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

// ─── Donut label renderer ─────────────────────────────────────
function renderDonutLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, value }) {
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 24
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#374151" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={12}>
      {name} ({value})
    </text>
  )
}

// ─── Top Sellers Tab ──────────────────────────────────────────
function TopSellersTab({ data, loading }) {
  const [categoryFilter, setCategoryFilter] = useState(null)

  if (loading) return <LoadingSpinner />
  if (!data) return <EmptyState message="No sales data available" />

  const { by_quantity, by_revenue, by_category } = data

  // Build donut data: aggregate by asset_type for units sold
  const donutData = by_category.map(c => ({
    name: c.asset_type,
    value: c.total_sold,
    category: c.category,
    asset_type: c.asset_type,
  }))

  // Filter tables when a donut slice is clicked
  const filteredByQty = categoryFilter
    ? by_quantity.filter(item => item.asset_type === categoryFilter)
    : by_quantity
  const filteredByRev = categoryFilter
    ? by_revenue.filter(item => item.asset_type === categoryFilter)
    : by_revenue

  return (
    <div className="space-y-6">
      {/* Donut Chart — Sales Volume by Category */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Sales Volume by Category</h3>
          {categoryFilter && (
            <button
              onClick={() => setCategoryFilter(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              Filtered: {categoryFilter} &times;
            </button>
          )}
        </div>
        {donutData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={renderDonutLabel}
                onClick={(entry) => setCategoryFilter(prev => prev === entry.asset_type ? null : entry.asset_type)}
                cursor="pointer"
              >
                {donutData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={COLORS[i % COLORS.length]}
                    opacity={categoryFilter && categoryFilter !== entry.asset_type ? 0.3 : 1}
                    stroke={categoryFilter === entry.asset_type ? '#1d4ed8' : '#fff'}
                    strokeWidth={categoryFilter === entry.asset_type ? 3 : 1}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} units`, name]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">No category data</p>
        )}
      </div>

      {/* Top by Quantity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Top Sellers by Quantity{categoryFilter ? ` — ${categoryFilter}` : ''}
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">#</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Product</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Category</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Qty Sold</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Revenue</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Avg Price</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Margin</th>
              </tr>
            </thead>
            <tbody>
              {filteredByQty.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">No items in this category</td></tr>
              )}
              {filteredByQty.map((item, i) => (
                <tr key={`${item.make}-${item.model}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                  <td className="py-2 px-3 font-medium">{item.make} {item.model}</td>
                  <td className="py-2 px-3 text-gray-500">{item.asset_type}</td>
                  <td className="text-right py-2 px-3 font-bold">{item.total_sold}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(item.total_revenue)}</td>
                  <td className="text-right py-2 px-3 text-gray-500">{formatCurrency(item.avg_price)}</td>
                  <td className={`text-right py-2 px-3 ${item.margin_percent >= 20 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {formatPercent(item.margin_percent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top by Revenue */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Top Sellers by Revenue{categoryFilter ? ` — ${categoryFilter}` : ''}
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">#</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Product</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Revenue</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Profit</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Qty</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Margin</th>
              </tr>
            </thead>
            <tbody>
              {filteredByRev.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">No items in this category</td></tr>
              )}
              {filteredByRev.map((item, i) => (
                <tr key={`${item.make}-${item.model}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                  <td className="py-2 px-3 font-medium">{item.make} {item.model}</td>
                  <td className="text-right py-2 px-3 font-bold">{formatCurrency(item.total_revenue)}</td>
                  <td className={`text-right py-2 px-3 ${item.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(item.total_profit)}
                  </td>
                  <td className="text-right py-2 px-3">{item.total_sold}</td>
                  <td className={`text-right py-2 px-3 ${item.margin_percent >= 20 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {formatPercent(item.margin_percent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Customers Tab ────────────────────────────────────────────
function CustomersTab({ data, loading }) {
  if (loading) return <LoadingSpinner />
  if (!data) return <EmptyState message="No customer data available" />

  const { total_customers, period_customers, top_customers } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Customers"
          value={total_customers}
          icon="👥"
          info="Total number of customers in the system, regardless of period."
        />
        <MetricCard
          title="Active This Period"
          value={period_customers.total_unique}
          icon="🎯"
          info="Customers with at least one non-cancelled invoice in this period. Formula: COUNT(DISTINCT customer_id)."
        />
        <MetricCard
          title="New Customers"
          value={period_customers.new_customers}
          icon="🆕"
          info="Customers whose first-ever invoice falls within this period."
        />
        <MetricCard
          title="Returning"
          value={period_customers.returning_customers}
          icon="🔄"
          info="Customers who purchased before this period and also purchased during it."
        />
      </div>

      {/* New vs Returning Pie */}
      {(period_customers.new_customers > 0 || period_customers.returning_customers > 0) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">New vs Returning</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'New', value: period_customers.new_customers },
                  { name: 'Returning', value: period_customers.returning_customers },
                ]}
                cx="50%" cy="50%" outerRadius={80}
                dataKey="value" label={({ name, value }) => `${name}: ${value}`}
              >
                <Cell fill="#3b82f6" />
                <Cell fill="#10b981" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Customers */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Customers</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">#</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Customer</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Phone</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Orders</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Total Spent</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Avg Order</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Profit</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Last Purchase</th>
              </tr>
            </thead>
            <tbody>
              {top_customers.map((c, i) => (
                <tr key={c.customer_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                  <td className="py-2 px-3 font-medium">{c.name}</td>
                  <td className="py-2 px-3 text-gray-500">{c.phone || '—'}</td>
                  <td className="text-right py-2 px-3">{c.invoice_count}</td>
                  <td className="text-right py-2 px-3 font-bold">{formatCurrency(c.total_spent)}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(c.avg_order)}</td>
                  <td className="text-right py-2 px-3 text-green-600">{formatCurrency(c.total_profit)}</td>
                  <td className="py-2 px-3 text-gray-500">{c.last_purchase ? new Date(c.last_purchase).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Staff Tab ────────────────────────────────────────────────
function StaffTab({ data, loading }) {
  if (loading) return <LoadingSpinner />
  if (!data) return <EmptyState message="No staff data available" />

  const { staff } = data

  return (
    <div className="space-y-6">
      {/* Staff Bar Chart */}
      {staff.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Staff</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={staff}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => [formatCurrency(value)]} />
              <Legend />
              <Bar dataKey="total_revenue" fill="#3b82f6" name="Revenue" />
              <Bar dataKey="total_profit" fill="#10b981" name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Staff Performance</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">Name</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Role</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Invoices</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Revenue</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Profit</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Avg Ticket</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Margin</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Collection</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.user_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{s.name}</td>
                  <td className="py-2 px-3 text-gray-500">{s.role}</td>
                  <td className="text-right py-2 px-3">{s.invoice_count}</td>
                  <td className="text-right py-2 px-3 font-bold">{formatCurrency(s.total_revenue)}</td>
                  <td className="text-right py-2 px-3 text-green-600">{formatCurrency(s.total_profit)}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(s.avg_ticket)}</td>
                  <td className="text-right py-2 px-3">{formatPercent(s.margin_percent)}</td>
                  <td className={`text-right py-2 px-3 font-medium ${s.collection_rate >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {s.collection_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Inventory Tab ────────────────────────────────────────────
function InventoryTab({ agingData, lowStockData, loadingAging, loadingLowStock }) {
  const loading = loadingAging || loadingLowStock

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Aging Buckets */}
      {agingData && (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Aging</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={agingData.aging_buckets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="age_bucket" />
                <YAxis />
                <Tooltip formatter={(value, name) => [name.includes('value') ? formatCurrency(value) : value]} />
                <Legend />
                <Bar dataKey="total_units" fill="#3b82f6" name="Units" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Aging Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {agingData.aging_buckets.map((b, i) => (
              <div key={b.age_bucket} className={`p-4 rounded-lg border ${i === 3 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
                <div className="text-sm text-gray-500 mb-1">{b.age_bucket}</div>
                <div className="text-xl font-bold">{b.total_units} units</div>
                <div className="text-sm text-gray-500">Retail: {formatCurrency(b.total_retail_value)}</div>
                <div className="text-sm text-gray-500">Cost: {formatCurrency(b.total_cost_value)}</div>
              </div>
            ))}
          </div>

          {/* Oldest Items */}
          {agingData.oldest_items?.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-5">
              <h3 className="text-lg font-semibold text-orange-700 mb-4">🕐 Oldest Unsold Items</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Tag</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Product</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Days</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Qty</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Price</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingData.oldest_items.slice(0, 10).map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-orange-50">
                        <td className="py-2 px-3 font-mono text-xs">{item.asset_tag}</td>
                        <td className="py-2 px-3 font-medium">{item.make} {item.model}</td>
                        <td className={`text-right py-2 px-3 font-bold ${item.days_in_stock > 90 ? 'text-red-600' : item.days_in_stock > 60 ? 'text-orange-600' : 'text-gray-900'}`}>
                          {item.days_in_stock}d
                        </td>
                        <td className="text-right py-2 px-3">{item.quantity}</td>
                        <td className="text-right py-2 px-3">{formatCurrency(item.price_amount)}</td>
                        <td className="text-right py-2 px-3 text-gray-500">{formatCurrency(item.cost_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Low Stock & Restock Suggestions */}
      {lowStockData && (
        <>
          {lowStockData.low_stock_items?.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-yellow-200 p-5">
              <h3 className="text-lg font-semibold text-yellow-700 mb-4">⚠️ Low Stock Items</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Product</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Qty Left</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Sold (30d)</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockData.low_stock_items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-yellow-50">
                        <td className="py-2 px-3 font-medium">{item.make} {item.model}</td>
                        <td className={`text-right py-2 px-3 font-bold ${item.quantity <= 1 ? 'text-red-600' : 'text-yellow-600'}`}>
                          {item.quantity}
                        </td>
                        <td className="text-right py-2 px-3">{item.sold_last_30_days}</td>
                        <td className="text-right py-2 px-3">{formatCurrency(item.price_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {lowStockData.restock_suggestions?.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-5">
              <h3 className="text-lg font-semibold text-blue-700 mb-4">📦 Restock Suggestions (Out of Stock, High Demand)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Product</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Category</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-500">Sold (90d)</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500">Last Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockData.restock_suggestions.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-blue-50">
                        <td className="py-2 px-3 font-medium">{item.make} {item.model}</td>
                        <td className="py-2 px-3 text-gray-500">{item.asset_type}</td>
                        <td className="text-right py-2 px-3 font-bold text-blue-600">{item.total_sold}</td>
                        <td className="py-2 px-3 text-gray-500">{item.last_sold ? new Date(item.last_sold).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Shared Components ────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      <div className="text-center">
        <span className="text-4xl mb-2 block">📊</span>
        <p>{message}</p>
      </div>
    </div>
  )
}

// ─── My Performance Tab ──────────────────────────────────────
function MyPerformanceTab({ data, loading }) {
  if (loading) return <LoadingSpinner />
  if (!data) return <EmptyState message="No performance data available" />

  const { summary, status_breakdown, recent_invoices } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="My Invoices"
          value={summary.total_invoices}
          icon="🧾"
          info="Total invoices you created in this period."
        />
        <MetricCard
          title="My Revenue"
          value={formatCurrency(summary.total_revenue)}
          icon="💰"
          info="Sum of invoice totals for your invoices."
        />
        <MetricCard
          title="Collected"
          value={formatCurrency(summary.total_collected)}
          icon="✅"
          info="Total payments collected on your invoices."
        />
        <MetricCard
          title="Avg Ticket"
          value={formatCurrency(summary.avg_ticket)}
          icon="📊"
          info="Average invoice value. Revenue / Invoices."
        />
      </div>

      {/* Status Breakdown */}
      {status_breakdown && status_breakdown.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {status_breakdown.map((s) => (
              <div key={s.status} className="text-center p-3 rounded-lg bg-gray-50">
                <div className="text-2xl font-bold text-gray-900">{s.count}</div>
                <div className="text-sm text-gray-500">{s.status}</div>
                <div className="text-sm font-medium text-gray-700">{formatCurrency(s.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Invoices */}
      {recent_invoices && recent_invoices.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Invoices</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Invoice #</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Date</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Total</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent_invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium">{inv.invoice_number}</td>
                    <td className="py-2 px-3">{new Date(inv.invoice_date).toLocaleDateString()}</td>
                    <td className="py-2 px-3">{inv.customer_name || 'Walk-in'}</td>
                    <td className="text-right py-2 px-3 font-medium">{formatCurrency(inv.total_amount)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        inv.status === 'PAID' ? 'bg-green-100 text-green-800' :
                        inv.status === 'PARTIALLY_PAID' ? 'bg-blue-100 text-blue-800' :
                        inv.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {inv.status}
                      </span>
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

// ─── Main Reports Page ────────────────────────────────────────
export default function Reports() {
  const { permissions } = usePermissions()
  const accessibleReports = permissions?.accessibleReports || []
  const TABS = ALL_TABS.filter(tab => accessibleReports.includes(tab.reportKey))

  const [activeTab, setActiveTab] = useState('')
  const [period, setPeriod] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Data states
  const [myPerfData, setMyPerfData] = useState(null)
  const [salesData, setSalesData] = useState(null)
  const [marginsData, setMarginsData] = useState(null)
  const [topSellersData, setTopSellersData] = useState(null)
  const [customersData, setCustomersData] = useState(null)
  const [staffData, setStaffData] = useState(null)
  const [agingData, setAgingData] = useState(null)
  const [lowStockData, setLowStockData] = useState(null)

  // Loading states
  const [loadingMyPerf, setLoadingMyPerf] = useState(false)
  const [loadingSales, setLoadingSales] = useState(false)
  const [loadingMargins, setLoadingMargins] = useState(false)
  const [loadingTopSellers, setLoadingTopSellers] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [loadingAging, setLoadingAging] = useState(false)
  const [loadingLowStock, setLoadingLowStock] = useState(false)

  const [error, setError] = useState(null)

  const buildParams = useCallback(() => {
    const params = { period }
    if (period === 'custom') {
      if (customStart) params.startDate = customStart
      if (customEnd) params.endDate = customEnd
    }
    return params
  }, [period, customStart, customEnd])

  const fetchReport = useCallback(async (endpoint, setData, setLoading) => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`/api/v1/reports/${endpoint}`, { params: buildParams() })
      setData(response.data.data)
    } catch (err) {
      setError(err.response?.data?.error?.message || `Failed to load ${endpoint}`)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  // Set initial active tab from first available
  useEffect(() => {
    if (TABS.length > 0 && !activeTab) {
      setActiveTab(TABS[0].id)
    }
  }, [TABS.length])

  // Fetch data when tab or period changes
  useEffect(() => {
    if (!activeTab) return
    switch (activeTab) {
      case 'my-performance':
        fetchReport('my-performance', setMyPerfData, setLoadingMyPerf)
        break
      case 'sales':
        fetchReport('sales', setSalesData, setLoadingSales)
        break
      case 'margins':
        fetchReport('margin-analysis', setMarginsData, setLoadingMargins)
        break
      case 'products':
        fetchReport('top-sellers', setTopSellersData, setLoadingTopSellers)
        break
      case 'customers':
        fetchReport('customer-insights', setCustomersData, setLoadingCustomers)
        break
      case 'staff':
        fetchReport('staff-performance', setStaffData, setLoadingStaff)
        break
      case 'inventory':
        fetchReport('inventory-aging', setAgingData, setLoadingAging)
        fetchReport('low-stock', setLowStockData, setLoadingLowStock)
        break
    }
  }, [activeTab, period, customStart, customEnd, fetchReport])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

        {/* Period Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date inputs */}
      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 bg-white p-3 rounded-lg border border-gray-200">
          <label className="text-sm text-gray-500">From:</label>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <label className="text-sm text-gray-500">To:</label>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'my-performance' && <MyPerformanceTab data={myPerfData} loading={loadingMyPerf} />}
      {activeTab === 'sales' && <SalesTab data={salesData} loading={loadingSales} />}
      {activeTab === 'margins' && <MarginsTab data={marginsData} loading={loadingMargins} />}
      {activeTab === 'products' && <TopSellersTab data={topSellersData} loading={loadingTopSellers} />}
      {activeTab === 'customers' && <CustomersTab data={customersData} loading={loadingCustomers} />}
      {activeTab === 'staff' && <StaffTab data={staffData} loading={loadingStaff} />}
      {activeTab === 'inventory' && (
        <InventoryTab
          agingData={agingData}
          lowStockData={lowStockData}
          loadingAging={loadingAging}
          loadingLowStock={loadingLowStock}
        />
      )}
    </div>
  )
}
