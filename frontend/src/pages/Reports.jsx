import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  { id: 'reconciliation', label: 'Reconciliation', icon: '🏦', reportKey: 'reconciliation' },
]

const PERIODS = [
  { id: 'week', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
]

const COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316']

const CHART_THEME = {
  grid: { stroke: '#f0f0f0', strokeDasharray: '' },
  axis: { stroke: '#9ca3af', fontSize: 12, tickLine: false },
  tooltip: {
    contentStyle: { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '10px 14px', fontSize: '13px' },
    cursor: { fill: 'rgba(124,58,237,0.04)' },
  },
  colors: { primary: '#7c3aed', secondary: '#3b82f6', success: '#10b981', warning: '#f59e0b', danger: '#ef4444' },
}

// SVG tab icons
function TabIcon({ id, className = 'w-4 h-4' }) {
  const icons = {
    'my-performance': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    'sales': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    'margins': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    'products': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 1 12 1s5 3 7.5 3a2.5 2.5 0 0 1 0 5H18"/><path d="M8 9h8l-1 12H9L8 9z"/></svg>,
    'customers': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    'staff': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    'inventory': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    'reconciliation': <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  }
  return icons[id] || null
}

// Metric icon component with colored background
const METRIC_ICONS = {
  '💰': { color: '#7c3aed', path: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  '📈': { color: '#10b981', path: 'M23 6l-9.5 9.5-5-5L1 18' },
  '🧾': { color: '#3b82f6', path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  '📅': { color: '#f59e0b', path: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18' },
  '📊': { color: '#7c3aed', path: 'M18 20V10 M12 20V4 M6 20v-6' },
  '🏷️': { color: '#ef4444', path: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01' },
  '👥': { color: '#3b82f6', path: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87' },
  '🎯': { color: '#ef4444', path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
  '🆕': { color: '#10b981', path: 'M12 5v14 M5 12h14' },
  '🔄': { color: '#f59e0b', path: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15' },
  '✅': { color: '#10b981', path: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3' },
  '💵': { color: '#10b981', path: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  '⏳': { color: '#f59e0b', path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2' },
}
function MetricIcon({ emoji }) {
  const cfg = METRIC_ICONS[emoji]
  if (!cfg) return <span className="text-2xl">{emoji}</span>
  return (
    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg.color + '14' }}>
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={cfg.path} />
      </svg>
    </div>
  )
}

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
          {title}
          {info && <InfoTooltip text={info} />}
        </span>
        <MetricIcon emoji={icon} />
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
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_THEME.colors.primary} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_THEME.colors.primary} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_THEME.colors.success} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_THEME.colors.success} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_THEME.grid.stroke} strokeDasharray={CHART_THEME.grid.strokeDasharray} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
            <YAxis tickFormatter={(v) => `₵${(v/1000).toFixed(0)}k`} stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
            <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} cursor={CHART_THEME.tooltip.cursor}
              formatter={(value) => [formatCurrency(value)]}
              labelFormatter={(d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            />
            <Legend />
            <Area type="monotone" dataKey="revenue" stroke={CHART_THEME.colors.primary} fill="url(#gradRevenue)" strokeWidth={2.5} name="Revenue" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
            <Area type="monotone" dataKey="profit" stroke={CHART_THEME.colors.success} fill="url(#gradProfit)" strokeWidth={2.5} name="Profit" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
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
            <CartesianGrid stroke={CHART_THEME.grid.stroke} strokeDasharray={CHART_THEME.grid.strokeDasharray} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
            <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
            <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} cursor={CHART_THEME.tooltip.cursor}
              formatter={(value, name) => [name === 'avg_margin' ? formatPercent(value) : formatCurrency(value), name === 'avg_margin' ? 'Avg Margin' : 'Profit']}
              labelFormatter={(d) => new Date(d).toLocaleDateString()}
            />
            <Legend />
            <Line type="monotone" dataKey="avg_margin" stroke={CHART_THEME.colors.primary} strokeWidth={2.5} name="Avg Margin %" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
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
                innerRadius={70} outerRadius={110}
                paddingAngle={3}
                dataKey="value"
                label={renderDonutLabel}
                onClick={(entry) => setCategoryFilter(prev => prev === entry.asset_type ? null : entry.asset_type)}
                cursor="pointer"
                cornerRadius={4}
              >
                {donutData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={COLORS[i % COLORS.length]}
                    opacity={categoryFilter && categoryFilter !== entry.asset_type ? 0.3 : 1}
                    stroke={categoryFilter === entry.asset_type ? '#1d4ed8' : '#fff'}
                    strokeWidth={categoryFilter === entry.asset_type ? 3 : 2}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} formatter={(value, name) => [`${value} units`, name]} />
              <Legend />
              {/* Center label */}
              <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" className="text-2xl font-bold" fill="#111827" fontSize={28} fontWeight="bold">
                {donutData.reduce((s, d) => s + d.value, 0)}
              </text>
              <text x="50%" y="56%" textAnchor="middle" dominantBaseline="central" fill="#6b7280" fontSize={12}>
                units sold
              </text>
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
                cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                paddingAngle={3} cornerRadius={4}
                dataKey="value" label={({ name, value }) => `${name}: ${value}`}
              >
                <Cell fill={CHART_THEME.colors.secondary} />
                <Cell fill={CHART_THEME.colors.success} />
              </Pie>
              <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} />
              <Legend />
              <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" fill="#111827" fontSize={24} fontWeight="bold">
                {period_customers.new_customers + period_customers.returning_customers}
              </text>
              <text x="50%" y="56%" textAnchor="middle" dominantBaseline="central" fill="#6b7280" fontSize={11}>
                customers
              </text>
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
            <BarChart data={staff} barCategoryGap="20%">
              <CartesianGrid stroke={CHART_THEME.grid.stroke} strokeDasharray={CHART_THEME.grid.strokeDasharray} vertical={false} />
              <XAxis dataKey="name" stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
              <YAxis tickFormatter={(v) => `₵${(v/1000).toFixed(0)}k`} stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
              <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} cursor={CHART_THEME.tooltip.cursor} formatter={(value) => [formatCurrency(value)]} />
              <Legend />
              <Bar dataKey="total_revenue" fill={CHART_THEME.colors.primary} name="Revenue" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total_profit" fill={CHART_THEME.colors.success} name="Profit" radius={[4, 4, 0, 0]} />
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
function InventoryTab({ agingData, lowStockData, conditionValuation, loadingAging, loadingLowStock, loadingCondVal }) {
  const loading = loadingAging || loadingLowStock

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Condition Valuation Breakdown */}
      {conditionValuation && !loadingCondVal && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Valuation by Condition</h3>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="p-3 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-500">Total Valuation</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(conditionValuation.total_valuation)}</div>
            </div>
            <div className="p-3 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-500">At Selling Price</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(conditionValuation.total_at_selling_price)}</div>
            </div>
            <div className={`p-3 rounded-lg border ${conditionValuation.adjustment < 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              <div className="text-sm text-gray-500">Adjustment</div>
              <div className={`text-xl font-bold ${conditionValuation.adjustment < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {conditionValuation.adjustment > 0 ? '+' : ''}{formatCurrency(conditionValuation.adjustment)}
              </div>
            </div>
          </div>
          {conditionValuation.by_condition?.length > 0 && (
            <div className="space-y-2">
              {conditionValuation.by_condition.map((item) => {
                const maxVal = Math.max(...conditionValuation.by_condition.map(c => c.count), 1)
                const pct = Math.max((item.count / maxVal) * 100, 4)
                return (
                  <div key={item.condition} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-gray-600 shrink-0 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      {item.condition}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: item.color }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-10 text-right">{item.count}</span>
                    <span className="text-sm text-gray-500 w-28 text-right">{formatCurrency(item.valuation)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Aging Buckets */}
      {agingData && (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Aging</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={agingData.aging_buckets} barCategoryGap="20%">
                <CartesianGrid stroke={CHART_THEME.grid.stroke} strokeDasharray={CHART_THEME.grid.strokeDasharray} vertical={false} />
                <XAxis dataKey="age_bucket" stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
                <YAxis stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
                <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} cursor={CHART_THEME.tooltip.cursor} formatter={(value, name) => [name.includes('value') ? formatCurrency(value) : value]} />
                <Legend />
                <Bar dataKey="total_units" fill={CHART_THEME.colors.primary} name="Units" radius={[4, 4, 0, 0]} />
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
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
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

  const summary = {
    total_invoices: data.invoiceCount || data.summary?.total_invoices || 0,
    total_revenue: data.totalRevenue || data.summary?.total_revenue || 0,
    total_collected: data.totalCollected || data.summary?.total_collected || 0,
    avg_ticket: data.avgTicket || data.summary?.avg_ticket || 0,
  }
  const status_breakdown = data.statusBreakdown || data.status_breakdown || []
  const recent_invoices = (data.recentInvoices || data.recent_invoices || []).map(inv => ({
    ...inv,
    customer_name: inv.customer?.displayName || inv.customer_name || 'Walk-in'
  }))

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

// ─── Reconciliation Tab ──────────────────────────────────────
const METHOD_COLORS = { Cash: '#10b981', MoMo: '#f59e0b', Card: '#3b82f6', ACH: '#8b5cf6', Other: '#6b7280' }
const METHOD_KEY_MAP = { cash: 'Cash', momo: 'MoMo', card: 'Card', ach: 'ACH', other: 'Other' }

function ReconciliationTab({ data, loading }) {
  const [showPrior, setShowPrior] = useState(false)
  // Bar filter state: { type: 'date'|'method', date?, method? }
  const [barFilter, setBarFilter] = useState(null)
  const [filteredPayments, setFilteredPayments] = useState([])
  const [loadingFiltered, setLoadingFiltered] = useState(false)

  // Fetch filtered payments when barFilter changes
  useEffect(() => {
    if (!barFilter || !data) {
      setFilteredPayments([])
      return
    }
    let cancelled = false
    async function fetchFiltered() {
      setLoadingFiltered(true)
      try {
        const params = {
          includeVoided: 'false',
          transactionType: 'PAYMENT',
          limit: 100,
          sortBy: 'payment_date',
          sortOrder: 'DESC',
        }
        if (barFilter.date) {
          params.dateFrom = barFilter.date
          params.dateTo = barFilter.date
        } else if (data.period) {
          params.dateFrom = data.period.startDate
          params.dateTo = data.period.endDate
        }
        if (barFilter.method) {
          params.paymentMethod = barFilter.method
        }
        const res = await axios.get('/api/v1/payments', { params })
        if (!cancelled && res.data.success) {
          setFilteredPayments(res.data.data.transactions || [])
        }
      } catch (err) {
        console.error('Failed to fetch filtered payments:', err)
        if (!cancelled) setFilteredPayments([])
      } finally {
        if (!cancelled) setLoadingFiltered(false)
      }
    }
    fetchFiltered()
    return () => { cancelled = true }
  }, [barFilter, data])

  const handleBarClick = (chartData, method) => {
    if (!chartData || !chartData.activePayload) return
    const date = chartData.activePayload[0]?.payload?.date
    if (!date) return
    const methodName = method ? METHOD_KEY_MAP[method] || method : null
    setBarFilter(prev => {
      if (prev && prev.date === date && prev.method === methodName) return null
      return { type: 'date', date, method: methodName }
    })
  }

  const handleMethodClick = (method) => {
    setBarFilter(prev => {
      if (prev && prev.type === 'method' && prev.method === method) return null
      return { type: 'method', date: null, method }
    })
  }

  const clearFilter = () => setBarFilter(null)

  if (loading) return <LoadingSpinner />
  if (!data) return <EmptyState message="No reconciliation data available" />

  const { summary, by_method, daily_collections, prior_period_collections, current_period_collections, outstanding_invoices } = data

  const totalOutstandingSum = outstanding_invoices.reduce((sum, inv) => sum + inv.balance_due, 0)

  // Build filter label
  const filterLabel = barFilter
    ? barFilter.date && barFilter.method
      ? `${new Date(barFilter.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - ${barFilter.method}`
      : barFilter.date
        ? new Date(barFilter.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : barFilter.method
    : null

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Invoiced"
          value={formatCurrency(summary.total_invoiced)}
          subtitle={`${summary.invoice_count} invoices`}
          icon="🧾"
          info="Sum of all invoice totals created during this period (excluding cancelled)."
        />
        <MetricCard
          title="Total Collected"
          value={formatCurrency(summary.total_collected)}
          subtitle={`${summary.payment_count} payments`}
          icon="💵"
          info="Sum of all payments received during this period, regardless of when the invoice was created."
        />
        <MetricCard
          title="Outstanding Balance"
          value={formatCurrency(summary.total_outstanding)}
          icon="⏳"
          info="Total balance due across all unpaid/partially paid invoices as of right now."
        />
        <MetricCard
          title="Collection Rate"
          value={`${summary.collection_rate}%`}
          subtitle={summary.collection_rate >= 80 ? 'Healthy' : summary.collection_rate >= 50 ? 'Needs attention' : 'Critical'}
          icon="📊"
          info="Percentage of invoiced amount that has been collected. Formula: (Collected / Invoiced) * 100."
          trend={summary.collection_rate >= 80 ? 'On track' : null}
          trendUp={summary.collection_rate >= 80}
        />
      </div>

      {/* Daily Collections Stacked Bar Chart */}
      {daily_collections.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Daily Collections by Method</h3>
            <span className="text-xs text-gray-400">Click a bar to filter invoices below</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={daily_collections} className="cursor-pointer" barCategoryGap="15%">
              <CartesianGrid stroke={CHART_THEME.grid.stroke} strokeDasharray={CHART_THEME.grid.strokeDasharray} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
              <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} stroke={CHART_THEME.axis.stroke} fontSize={CHART_THEME.axis.fontSize} tickLine={CHART_THEME.axis.tickLine} axisLine={false} />
              <Tooltip contentStyle={CHART_THEME.tooltip.contentStyle} cursor={CHART_THEME.tooltip.cursor}
                formatter={(value, name) => [formatCurrency(value), name.charAt(0).toUpperCase() + name.slice(1)]}
                labelFormatter={(d) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              />
              <Legend />
              <Bar dataKey="cash" stackId="a" fill={METHOD_COLORS.Cash} name="Cash" cursor="pointer" radius={[0, 0, 0, 0]} onClick={(payload, _idx, e) => { handleBarClick({ activePayload: [{ payload }] }, 'cash') }} />
              <Bar dataKey="momo" stackId="a" fill={METHOD_COLORS.MoMo} name="MoMo" cursor="pointer" onClick={(payload, _idx, e) => { handleBarClick({ activePayload: [{ payload }] }, 'momo') }} />
              <Bar dataKey="card" stackId="a" fill={METHOD_COLORS.Card} name="Card" cursor="pointer" onClick={(payload, _idx, e) => { handleBarClick({ activePayload: [{ payload }] }, 'card') }} />
              <Bar dataKey="ach" stackId="a" fill={METHOD_COLORS.ACH} name="ACH" cursor="pointer" onClick={(payload, _idx, e) => { handleBarClick({ activePayload: [{ payload }] }, 'ach') }} />
              <Bar dataKey="other" stackId="a" fill={METHOD_COLORS.Other} name="Other" cursor="pointer" radius={[4, 4, 0, 0]} onClick={(payload, _idx, e) => { handleBarClick({ activePayload: [{ payload }] }, 'other') }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment Method Breakdown */}
      {by_method.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Payment Method Breakdown</h3>
            <span className="text-xs text-gray-400">Click a method to filter invoices below</span>
          </div>
          <div className="space-y-3">
            {by_method.map((m) => {
              const isActive = barFilter?.type === 'method' && barFilter?.method === m.method
              return (
                <div
                  key={m.method}
                  className={`flex items-center gap-3 cursor-pointer rounded-lg px-2 py-1 transition-colors ${isActive ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-gray-50'}`}
                  onClick={() => handleMethodClick(m.method)}
                >
                  <div className="w-20 text-sm font-medium text-gray-700 shrink-0">{m.method}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${m.percent_of_total}%`,
                        backgroundColor: METHOD_COLORS[m.method] || METHOD_COLORS.Other,
                        minWidth: m.percent_of_total > 0 ? '2rem' : '0'
                      }}
                    />
                  </div>
                  <div className="w-32 text-right text-sm shrink-0">
                    <span className="font-bold">{formatCurrency(m.amount)}</span>
                    <span className="text-gray-500 ml-1">({m.count})</span>
                  </div>
                  <div className="w-14 text-right text-sm text-gray-500 shrink-0">{m.percent_of_total}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtered Invoices (shown when a bar is clicked) */}
      {barFilter && (
        <div className="bg-white rounded-lg shadow-sm border-2 border-blue-300 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Invoices
              <span className="ml-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {filterLabel}
              </span>
              {!loadingFiltered && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
                  {' '}totalling {formatCurrency(filteredPayments.reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0))}
                </span>
              )}
            </h3>
            <button
              onClick={clearFilter}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 transition-colors"
            >
              Clear filter &times;
            </button>
          </div>
          {loadingFiltered ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredPayments.length === 0 ? (
            <p className="text-center text-gray-500 py-6">No payments found for this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Payment Date</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Invoice #</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Customer</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Method</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Amount</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Reference</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Received By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 hover:bg-blue-50">
                      <td className="py-2 px-3">{new Date(tx.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="py-2 px-3 font-medium">
                        {tx.invoiceId ? (
                          <a href={`/sales/invoices/${tx.invoiceId}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                            {tx.invoiceNumber}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-3">{tx.customerName || 'Walk-in'}</td>
                      <td className="py-2 px-3">
                        <span
                          className="px-2 py-0.5 text-xs rounded-full font-medium"
                          style={{
                            backgroundColor: (METHOD_COLORS[tx.payment_method] || METHOD_COLORS.Other) + '20',
                            color: METHOD_COLORS[tx.payment_method] || METHOD_COLORS.Other
                          }}
                        >
                          {tx.paymentMethodDisplay || tx.payment_method || '—'}
                        </span>
                      </td>
                      <td className="text-right py-2 px-3 font-medium text-green-600">{formatCurrency(tx.amount)}</td>
                      <td className="py-2 px-3 text-gray-500 max-w-[120px] truncate" title={tx.reference_number}>{tx.reference_number || '—'}</td>
                      <td className="py-2 px-3 text-gray-500">{tx.receivedBy?.full_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reconciliation Checklist */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reconciliation Checklist</h3>
        <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm space-y-1">
          {by_method.map((m) => (
            <div key={m.method} className="flex justify-between">
              <span className="text-green-600">&#10003; {m.method}:</span>
              <span>{formatCurrency(m.amount)}  ({m.count} transactions)</span>
            </div>
          ))}
          <div className="border-t border-gray-300 my-2" />
          <div className="flex justify-between font-bold">
            <span>Total:</span>
            <span>{formatCurrency(summary.total_collected)}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Compare these totals against your MoMo statement, bank statement, POS terminal report, and cash count.</p>
      </div>

      {/* Prior Period Collections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-5">
          <h4 className="text-sm font-medium text-blue-700 mb-1">Prior Period Collections</h4>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(prior_period_collections.amount)}</div>
          <p className="text-sm text-gray-500 mt-1">
            from {prior_period_collections.count} payment{prior_period_collections.count !== 1 ? 's' : ''} on invoices created before this period
          </p>
          {prior_period_collections.invoices.length > 0 && (
            <button
              onClick={() => setShowPrior(!showPrior)}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {showPrior ? 'Hide details' : 'Show details'}
            </button>
          )}
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-green-200 p-5">
          <h4 className="text-sm font-medium text-green-700 mb-1">Current Period Collections</h4>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(current_period_collections.amount)}</div>
          <p className="text-sm text-gray-500 mt-1">
            from {current_period_collections.count} payment{current_period_collections.count !== 1 ? 's' : ''} on invoices created this period
          </p>
        </div>
      </div>

      {/* Prior Period Details Table */}
      {showPrior && prior_period_collections.invoices.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-5">
          <h3 className="text-lg font-semibold text-blue-700 mb-4">Prior Period Payment Details</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Invoice #</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Invoice Date</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Amount</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Method</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Payment Date</th>
                </tr>
              </thead>
              <tbody>
                {prior_period_collections.invoices.map((p, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-blue-50">
                    <td className="py-2 px-3 font-medium">{p.invoice_number}</td>
                    <td className="py-2 px-3">{new Date(p.invoice_date).toLocaleDateString()}</td>
                    <td className="py-2 px-3">{p.customer_name}</td>
                    <td className="text-right py-2 px-3 font-medium">{formatCurrency(p.payment_amount)}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium" style={{ backgroundColor: (METHOD_COLORS[p.payment_method] || METHOD_COLORS.Other) + '20', color: METHOD_COLORS[p.payment_method] || METHOD_COLORS.Other }}>
                        {p.payment_method}
                      </span>
                    </td>
                    <td className="py-2 px-3">{new Date(p.payment_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Outstanding Invoices */}
      {outstanding_invoices.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Outstanding Invoices</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Invoice #</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Date</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Total</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Paid</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Balance</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Days</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {outstanding_invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      inv.days_outstanding > 60 ? 'bg-red-50' : inv.days_outstanding > 30 ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-medium">{inv.invoice_number}</td>
                    <td className="py-2 px-3">{new Date(inv.invoice_date).toLocaleDateString()}</td>
                    <td className="py-2 px-3">{inv.customer_name}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(inv.total_amount)}</td>
                    <td className="text-right py-2 px-3 text-green-600">{formatCurrency(inv.amount_paid)}</td>
                    <td className="text-right py-2 px-3 font-bold text-red-600">{formatCurrency(inv.balance_due)}</td>
                    <td className={`text-right py-2 px-3 font-medium ${
                      inv.days_outstanding > 60 ? 'text-red-600' : inv.days_outstanding > 30 ? 'text-yellow-600' : 'text-gray-900'
                    }`}>
                      {inv.days_outstanding}d
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        inv.status === 'PARTIALLY_PAID' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={5} className="py-2 px-3 font-bold text-right">Total Outstanding:</td>
                  <td className="text-right py-2 px-3 font-bold text-red-600">{formatCurrency(totalOutstandingSum)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Error Boundary ───────────────────────────────────────────
class ReportErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('Report tab crash:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 font-medium">Something went wrong loading this report.</p>
          <p className="text-red-500 text-sm mt-1">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main Reports Page ────────────────────────────────────────
export default function Reports() {
  const { permissions, loading: permissionsLoading } = usePermissions()
  const TABS = useMemo(() => {
    const accessibleReports = permissions?.accessibleReports || []
    return ALL_TABS.filter(tab => accessibleReports.includes(tab.reportKey))
  }, [permissions])

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
  const [conditionValuation, setConditionValuation] = useState(null)
  const [reconData, setReconData] = useState(null)

  // Loading states
  const [loadingMyPerf, setLoadingMyPerf] = useState(false)
  const [loadingSales, setLoadingSales] = useState(false)
  const [loadingMargins, setLoadingMargins] = useState(false)
  const [loadingTopSellers, setLoadingTopSellers] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [loadingAging, setLoadingAging] = useState(false)
  const [loadingLowStock, setLoadingLowStock] = useState(false)
  const [loadingCondVal, setLoadingCondVal] = useState(false)
  const [loadingRecon, setLoadingRecon] = useState(false)

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
  }, [TABS, activeTab])

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
        fetchReport('inventory-valuation', setConditionValuation, setLoadingCondVal)
        break
      case 'reconciliation':
        fetchReport('reconciliation', setReconData, setLoadingRecon)
        break
    }
  }, [activeTab, period, customStart, customEnd, fetchReport])

  if (permissionsLoading) {
    return <LoadingSpinner />
  }

  if (TABS.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports</h1>
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No reports available for your role.</p>
          <p className="text-sm mt-2">Contact an administrator if you believe this is an error.</p>
        </div>
      </div>
    )
  }

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
                  ? 'bg-violet-600 text-white'
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <TabIcon id={tab.id} className="w-4 h-4" />
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
      <ReportErrorBoundary key={activeTab}>
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
            conditionValuation={conditionValuation}
            loadingAging={loadingAging}
            loadingLowStock={loadingLowStock}
            loadingCondVal={loadingCondVal}
          />
        )}
        {activeTab === 'reconciliation' && <ReconciliationTab data={reconData} loading={loadingRecon} />}
      </ReportErrorBoundary>
    </div>
  )
}
