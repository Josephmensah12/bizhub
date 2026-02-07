import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    try {
      const response = await axios.get('/api/v1/dashboard/metrics')
      setMetrics(response.data.data)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Today's Sales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <MetricCard
          title="Today's Sales"
          value={`GHS ${metrics?.today_sales?.total_amount?.toLocaleString() || '0'}`}
          subtitle={`${metrics?.today_sales?.transaction_count || 0} transactions`}
          icon="💰"
          color="green"
        />
        <MetricCard
          title="Inventory On Hand"
          value={metrics?.inventory_on_hand?.total_units || 0}
          subtitle={`${metrics?.inventory_on_hand?.ready_for_sale || 0} ready for sale`}
          icon="📦"
          color="blue"
        />
        <MetricCard
          title="Low Stock Alerts"
          value={metrics?.low_stock_alerts?.count || 0}
          subtitle="Items below threshold"
          icon="⚠️"
          color="yellow"
        />
        <MetricCard
          title="Active Preorders"
          value={metrics?.preorders_summary?.total_active || 0}
          subtitle={`${metrics?.preorders_summary?.overdue || 0} overdue`}
          icon="🛒"
          color="purple"
        />
      </div>

      {/* Needs Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Needs Attention</h2>
          <div className="space-y-2">
            <NeedsAttentionItem
              label="Diagnostics Pending"
              count={metrics?.needs_attention?.diagnostics_pending || 0}
            />
            <NeedsAttentionItem
              label="Wipe Pending"
              count={metrics?.needs_attention?.wipe_pending || 0}
            />
            <NeedsAttentionItem
              label="QC Pending"
              count={metrics?.needs_attention?.qc_pending || 0}
            />
            <NeedsAttentionItem
              label="Preorders SLA Breach"
              count={metrics?.needs_attention?.preorders_sla_breach || 0}
              alert={metrics?.needs_attention?.preorders_sla_breach > 0}
            />
            <NeedsAttentionItem
              label="Open Repairs"
              count={metrics?.needs_attention?.repairs_open || 0}
            />
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Lead Sources (This Month)</h2>
          <div className="space-y-2">
            {metrics?.lead_source_breakdown?.map((source) => (
              <div key={source.source} className="flex items-center justify-between">
                <span className="text-gray-700">{source.source}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${source.percentage}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-12 text-right">
                    {source.count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Aging Stock */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Aging Stock</h2>
        <div className="grid grid-cols-4 gap-4">
          <AgingBucket label="Under 30 days" count={metrics?.aging_stock?.['30_days'] || 0} />
          <AgingBucket label="30-60 days" count={metrics?.aging_stock?.['60_days'] || 0} />
          <AgingBucket label="60-90 days" count={metrics?.aging_stock?.['90_plus_days'] || 0} alert />
          <AgingBucket label="90+ days" count={3} alert />
        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, subtitle, icon, color }) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    purple: 'bg-purple-50 border-purple-200'
  }

  return (
    <div className={`card ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  )
}

function NeedsAttentionItem({ label, count, alert }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-700">{label}</span>
      <span
        className={`font-semibold ${alert && count > 0 ? 'text-red-600' : 'text-gray-900'}`}
      >
        {count}
      </span>
    </div>
  )
}

function AgingBucket({ label, count, alert }) {
  return (
    <div className="text-center">
      <div
        className={`text-2xl font-bold ${alert && count > 0 ? 'text-red-600' : 'text-gray-900'}`}
      >
        {count}
      </div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  )
}
