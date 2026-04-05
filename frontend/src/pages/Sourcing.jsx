import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316']
const STATUS_COLORS = { ordered: 'bg-blue-100 text-blue-700', in_transit: 'bg-yellow-100 text-yellow-700', arrived: 'bg-green-100 text-green-700', partially_sold: 'bg-purple-100 text-purple-700', fully_sold: 'bg-gray-100 text-gray-700', cancelled: 'bg-red-100 text-red-700' }
const MARGIN_COLOR = v => v >= 20 ? 'text-green-600' : v >= 10 ? 'text-yellow-600' : 'text-red-600'
const fmt = v => v != null ? `GHS ${Math.round(Number(v)).toLocaleString()}` : '—'
const fmtUsd = v => v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'
const fmtPct = v => v != null ? `${Number(v).toFixed(1)}%` : '—'

export default function Sourcing() {
  const [tab, setTab] = useState('batches')
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedBatch, setExpandedBatch] = useState(null)
  const [batchDetail, setBatchDetail] = useState(null)
  const [scorecard, setScorecard] = useState([])
  const [modelData, setModelData] = useState([])
  const [warrantySummary, setWarrantySummary] = useState([])

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/v1/sourcing', { params: { limit: 50 } })
      setBatches(res.data.data.batches || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  const fetchBatchDetail = async (id) => {
    if (expandedBatch === id) { setExpandedBatch(null); return }
    try {
      const res = await axios.get(`/api/v1/sourcing/${id}`)
      setBatchDetail(res.data.data.batch)
      setExpandedBatch(id)
    } catch (err) { console.error(err) }
  }

  const fetchScorecard = async () => {
    try {
      const res = await axios.get('/api/v1/sourcing/reports/supplier-scorecard')
      setScorecard(res.data.data || [])
    } catch {}
  }

  const fetchModelData = async () => {
    try {
      const res = await axios.get('/api/v1/sourcing/reports/model-profitability')
      setModelData(res.data.data || [])
    } catch {}
  }

  const fetchWarrantySummary = async () => {
    try {
      const res = await axios.get('/api/v1/sourcing/reports/warranty-summary')
      setWarrantySummary(res.data.data || [])
    } catch {}
  }

  useEffect(() => { fetchBatches() }, [fetchBatches])
  useEffect(() => {
    if (tab === 'scorecard') fetchScorecard()
    if (tab === 'models') fetchModelData()
    if (tab === 'warranty') fetchWarrantySummary()
  }, [tab])

  const tabs = [
    { id: 'batches', label: 'Sourcing Batches' },
    { id: 'scorecard', label: 'Supplier Scorecard' },
    { id: 'models', label: 'Model Profitability' },
    { id: 'warranty', label: 'Warranty' },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" /></div>

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phone Sourcing</h1>
          <p className="text-sm text-gray-500 mt-1">Track batches, margins, and supplier performance</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batches Tab */}
      {tab === 'batches' && (
        <div className="space-y-3">
          {batches.length === 0 && <p className="text-center text-gray-400 py-12">No sourcing batches yet</p>}
          {batches.map(b => (
            <div key={b.id} className="bg-white rounded-xl border overflow-hidden">
              <button onClick={() => fetchBatchDetail(b.id)} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-600'}`}>{b.status}</span>
                    <span className="font-semibold text-gray-900">{b.batch_reference}</span>
                    <span className="text-sm text-gray-500">{b.supplier_name}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-500">{b.total_units} units</span>
                    <span className="text-gray-700 font-medium">{fmtUsd(b.total_cost_usd)}</span>
                    {b.projected_margin_percent != null && (
                      <span className={`font-semibold ${MARGIN_COLOR(b.projected_margin_percent)}`}>
                        Proj: {fmtPct(b.projected_margin_percent)}
                      </span>
                    )}
                    {b.actual_margin_percent != null && (
                      <span className={`font-semibold ${MARGIN_COLOR(b.actual_margin_percent)}`}>
                        Actual: {fmtPct(b.actual_margin_percent)}
                      </span>
                    )}
                    <span className="text-gray-400">{new Date(b.order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {expandedBatch === b.id && batchDetail && (
                <div className="border-t px-4 pb-4">
                  {/* Summary row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-3">
                    <div><p className="text-[10px] text-gray-400 uppercase">Total Cost</p><p className="font-semibold">{fmtUsd(batchDetail.total_cost_usd)}</p></div>
                    <div><p className="text-[10px] text-gray-400 uppercase">Landed Cost</p><p className="font-semibold">{fmt(batchDetail.total_landed_cost_ghs)}</p></div>
                    <div><p className="text-[10px] text-gray-400 uppercase">Revenue</p><p className="font-semibold">{fmt(batchDetail.total_revenue_ghs)}</p></div>
                    <div><p className="text-[10px] text-gray-400 uppercase">Profit</p><p className={`font-semibold ${(batchDetail.total_profit_ghs || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(batchDetail.total_profit_ghs)}</p></div>
                    <div><p className="text-[10px] text-gray-400 uppercase">FX Rate</p><p className="font-semibold">{batchDetail.fx_rate_at_purchase || '—'}</p></div>
                  </div>

                  {/* Units table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="text-left py-2 px-2">Serial / IMEI</th>
                          <th className="text-left py-2 px-2">Model</th>
                          <th className="text-left py-2 px-2">Color</th>
                          <th className="text-left py-2 px-2">Grade</th>
                          <th className="text-right py-2 px-2">Storage</th>
                          <th className="text-right py-2 px-2">BH%</th>
                          <th className="text-right py-2 px-2">Landed</th>
                          <th className="text-right py-2 px-2">Projected</th>
                          <th className="text-right py-2 px-2">Actual</th>
                          <th className="text-right py-2 px-2">Margin</th>
                          <th className="text-right py-2 px-2">Variance</th>
                          <th className="text-center py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(batchDetail.units || []).map(u => {
                          const variance = u.margin_variance_percent
                          const varColor = variance > 5 ? 'text-green-600' : variance > -5 ? 'text-yellow-600' : 'text-red-600'
                          return (
                            <tr key={u.id} className="hover:bg-gray-50">
                              <td className="py-2 px-2 font-mono text-gray-700">{u.serial_number || u.imei || '—'}</td>
                              <td className="py-2 px-2">{u.asset?.make} {u.asset?.model}</td>
                              <td className="py-2 px-2 text-gray-500">{u.phone_color || '—'}</td>
                              <td className="py-2 px-2">{u.supplier_grade || '—'}</td>
                              <td className="py-2 px-2 text-right">{u.storage ? `${u.storage}GB` : '—'}</td>
                              <td className="py-2 px-2 text-right">{u.battery_health_percent != null ? `${u.battery_health_percent}%` : '—'}</td>
                              <td className="py-2 px-2 text-right">{fmt(u.landed_cost_ghs)}</td>
                              <td className="py-2 px-2 text-right">{fmt(u.projected_sell_price_ghs)}</td>
                              <td className="py-2 px-2 text-right font-medium">{fmt(u.actual_sell_price_ghs)}</td>
                              <td className={`py-2 px-2 text-right font-semibold ${MARGIN_COLOR(u.actual_margin_percent)}`}>{fmtPct(u.actual_margin_percent)}</td>
                              <td className={`py-2 px-2 text-right font-medium ${variance != null ? varColor : 'text-gray-400'}`}>
                                {variance != null ? `${variance > 0 ? '+' : ''}${fmtPct(variance)}` : '—'}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${u.status === 'Sold' ? 'bg-green-100 text-green-700' : u.status === 'Available' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{u.status}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Supplier Scorecard Tab */}
      {tab === 'scorecard' && (
        <div className="space-y-6">
          {scorecard.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Avg Actual Margin by Supplier</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={scorecard} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => `${v}%`} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="supplier_name" fontSize={11} tickLine={false} axisLine={false} width={80} />
                    <Tooltip formatter={v => [`${Number(v).toFixed(1)}%`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="avg_actual_margin" radius={[0, 4, 4, 0]}>
                      {scorecard.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Supplier Comparison</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-gray-500">
                    <th className="text-left py-2">Supplier</th><th className="text-right py-2">Units</th><th className="text-right py-2">Sold</th>
                    <th className="text-right py-2">Proj %</th><th className="text-right py-2">Actual %</th><th className="text-right py-2">Avg BH</th><th className="text-right py-2">Days</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {scorecard.map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 font-medium">{s.supplier_name}</td>
                        <td className="py-2 text-right">{s.total_units}</td>
                        <td className="py-2 text-right">{s.units_sold}</td>
                        <td className="py-2 text-right">{fmtPct(s.avg_projected_margin)}</td>
                        <td className={`py-2 text-right font-semibold ${MARGIN_COLOR(s.avg_actual_margin)}`}>{fmtPct(s.avg_actual_margin)}</td>
                        <td className="py-2 text-right">{s.avg_battery_health || '—'}%</td>
                        <td className="py-2 text-right">{s.avg_days_to_sell || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {scorecard.length === 0 && <p className="text-center text-gray-400 py-12">No supplier data yet</p>}
        </div>
      )}

      {/* Model Profitability Tab */}
      {tab === 'models' && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Model Profitability</h3>
          {modelData.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b text-gray-500">
                <th className="text-left py-2 px-2">Model</th><th className="text-right py-2 px-2">Storage</th><th className="text-right py-2 px-2">Units</th>
                <th className="text-right py-2 px-2">Sold</th><th className="text-right py-2 px-2">Avg Cost</th><th className="text-right py-2 px-2">Avg Landed</th>
                <th className="text-right py-2 px-2">Avg Sell</th><th className="text-right py-2 px-2">Margin</th><th className="text-right py-2 px-2">Days</th><th className="text-right py-2 px-2">BH%</th>
              </tr></thead>
              <tbody className="divide-y">
                {modelData.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 px-2 font-medium">{m.model}</td>
                    <td className="py-2 px-2 text-right">{m.storage ? `${m.storage}GB` : '—'}</td>
                    <td className="py-2 px-2 text-right">{m.total_units}</td>
                    <td className="py-2 px-2 text-right">{m.units_sold}</td>
                    <td className="py-2 px-2 text-right">{fmtUsd(m.avg_purchase_usd)}</td>
                    <td className="py-2 px-2 text-right">{fmt(m.avg_landed_ghs)}</td>
                    <td className="py-2 px-2 text-right">{fmt(m.avg_actual_sell_ghs)}</td>
                    <td className={`py-2 px-2 text-right font-semibold ${MARGIN_COLOR(m.avg_margin)}`}>{fmtPct(m.avg_margin)}</td>
                    <td className="py-2 px-2 text-right">{m.avg_days_to_sell || '—'}</td>
                    <td className="py-2 px-2 text-right">{m.avg_bh || '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-center text-gray-400 py-8">No model data yet</p>}
        </div>
      )}

      {/* Warranty Tab */}
      {tab === 'warranty' && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Warranty Summary by Supplier</h3>
          {warrantySummary.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b text-gray-500">
                <th className="text-left py-2 px-2">Supplier</th><th className="text-right py-2 px-2">Claims</th><th className="text-right py-2 px-2">Refunded</th>
                <th className="text-right py-2 px-2">Replaced</th><th className="text-right py-2 px-2">Denied</th><th className="text-right py-2 px-2">Pending</th>
                <th className="text-right py-2 px-2">Total Refunds</th><th className="text-right py-2 px-2">Claim Rate</th>
              </tr></thead>
              <tbody className="divide-y">
                {warrantySummary.map((w, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 px-2 font-medium">{w.supplier_name}</td>
                    <td className="py-2 px-2 text-right">{w.total_claims}</td>
                    <td className="py-2 px-2 text-right text-green-600">{w.claims_refunded}</td>
                    <td className="py-2 px-2 text-right">{w.claims_replaced}</td>
                    <td className="py-2 px-2 text-right text-red-600">{w.claims_denied}</td>
                    <td className="py-2 px-2 text-right text-yellow-600">{w.claims_pending}</td>
                    <td className="py-2 px-2 text-right font-medium">{fmtUsd(w.total_refunds_usd)}</td>
                    <td className={`py-2 px-2 text-right font-semibold ${(w.claim_rate_percent || 0) > 5 ? 'text-red-600' : 'text-green-600'}`}>{fmtPct(w.claim_rate_percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-center text-gray-400 py-8">No warranty data yet</p>}
        </div>
      )}
    </div>
  )
}
