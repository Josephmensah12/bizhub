import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart, Cell
} from 'recharts'

function fmt(v) {
  if (v == null) return '—'
  return `GHS ${Math.round(Number(v)).toLocaleString()}`
}
function fmtK(v) {
  return `₵${(v / 1000).toFixed(0)}k`
}

const PRIORITY_STYLES = {
  high: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', icon: '!' },
  medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', icon: '~' },
  low: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', icon: 'i' },
}

const COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316']

export default function Forecast() {
  const [data, setData] = useState(null)
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [snapshotting, setSnapshotting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      axios.get('/api/v1/reports/forecast'),
      axios.get('/api/v1/reports/forecast/history').catch(() => ({ data: { data: null } })),
    ]).then(([forecastRes, historyRes]) => {
      setData(forecastRes.data.data)
      setHistory(historyRes.data.data)
    }).catch(err => setError(err.response?.data?.error?.message || 'Failed to load forecast'))
      .finally(() => setLoading(false))
  }, [])

  const takeSnapshot = async () => {
    setSnapshotting(true)
    try {
      await axios.post('/api/v1/reports/forecast/snapshot')
      const res = await axios.get('/api/v1/reports/forecast/history')
      setHistory(res.data.data)
    } catch {}
    setSnapshotting(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
    </div>
  )
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>
  if (!data) return <div className="text-center py-12 text-gray-400">No forecast data</div>

  const { forecast_month, models, ensemble, context, same_month_history, trend_chart, recommendations } = data

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Forecast</h1>
          <p className="text-sm text-gray-500 mt-1">Predictive analysis for {forecast_month}</p>
        </div>
        <button onClick={takeSnapshot} disabled={snapshotting}
          className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {snapshotting ? 'Saving...' : 'Save Snapshot'}
        </button>
      </div>

      {/* Headline Forecast */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-6 mb-6 text-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2">
            <p className="text-violet-200 text-sm font-medium uppercase tracking-wider">Ensemble Forecast — {forecast_month}</p>
            <p className="text-4xl font-bold mt-2">{fmt(ensemble.forecast)}</p>
            <p className="text-violet-200 text-sm mt-2">
              95% Confidence: {fmt(ensemble.ci_low)} — {fmt(ensemble.ci_high)}
            </p>
          </div>
          <div>
            <p className="text-violet-200 text-xs uppercase tracking-wider">Forecast Net Income</p>
            <p className="text-2xl font-bold mt-1">{fmt(context.forecast_net_income)}</p>
            <p className="text-violet-200 text-xs mt-1">After avg expenses of {fmt(context.avg_monthly_expense)}</p>
          </div>
          <div>
            <p className="text-violet-200 text-xs uppercase tracking-wider">Seasonal Index</p>
            <p className="text-2xl font-bold mt-1">{context.seasonal_index.toFixed(2)}x</p>
            <p className="text-violet-200 text-xs mt-1">
              {context.seasonal_index > 1 ? `${Math.round((context.seasonal_index - 1) * 100)}% above average` : `${Math.round((1 - context.seasonal_index) * 100)}% below average`}
            </p>
          </div>
        </div>
      </div>

      {/* Model Comparison Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {models.holt_winters && (
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Holt-Winters</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{fmt(models.holt_winters.forecast)}</p>
            <p className="text-xs text-gray-400 mt-1">RMSE: {fmt(models.holt_winters.rmse)}</p>
          </div>
        )}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Seasonal Decomposition</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(models.seasonal_decomposition.forecast)}</p>
          <p className="text-xs text-gray-400 mt-1">RMSE: {fmt(models.seasonal_decomposition.rmse)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">3-Month Moving Avg</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(models.moving_average.forecast)}</p>
          <p className="text-xs text-gray-400 mt-1">Based on last {models.moving_average.window} months</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Category Build-Up</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(models.category_buildup.forecast)}</p>
          <p className="text-xs text-gray-400 mt-1">Inventory-constrained</p>
        </div>
      </div>

      {/* Trend Chart + Historical Same-Month */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl border p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue Trend & Forecast</h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={trend_chart}>
              <defs>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtK} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                formatter={(v, name) => [v ? fmt(v) : '—', name]}
                labelFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              />
              <Legend />
              <Area type="monotone" dataKey="actual" stroke="#7c3aed" strokeWidth={2} fill="url(#actualGrad)" name="Actual" dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="sd_fitted" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5 3" name="Seasonal Model" dot={false} connectNulls />
              {trend_chart.some(d => d.ensemble) && (
                <Line type="monotone" dataKey="ensemble" stroke="#ef4444" strokeWidth={2.5} name="Forecast" dot={{ r: 6, fill: '#ef4444' }} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{forecast_month.split(' ')[0]} — Year over Year</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={same_month_history} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtK} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="year" fontSize={11} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [fmt(v)]} />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                {same_month_history.map((_, i) => (
                  <Cell key={i} fill={i === same_month_history.length - 1 ? '#ef4444' : '#7c3aed'}
                    opacity={i >= same_month_history.length - 3 ? 1 : 0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Forecast + Inventory */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Category-Level Forecast (Inventory Constrained)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-gray-500">Category</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Avg Units/Mo</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Available Stock</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Forecast Units</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500">Forecast Revenue</th>
                <th className="text-center py-2 px-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {models.category_buildup.categories.map((cat, i) => (
                <tr key={cat.asset_type} className="hover:bg-gray-50">
                  <td className="py-2.5 px-3 font-medium flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {cat.asset_type}
                  </td>
                  <td className="py-2.5 px-3 text-right">{cat.avg_monthly_units}</td>
                  <td className="py-2.5 px-3 text-right">{cat.available_stock || '—'}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{cat.forecast_units}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{fmt(cat.forecast_revenue)}</td>
                  <td className="py-2.5 px-3 text-center">
                    {cat.available_stock === 0 && cat.avg_monthly_units > 0 ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">OUT OF STOCK</span>
                    ) : cat.stock_constrained ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">LOW STOCK</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Tuning Insights */}
      {data.auto_tuning && (
        <div className="bg-white rounded-xl border p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Auto-Tuning Engine</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Optimized Parameters */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Holt-Winters Parameters</p>
              <div className="space-y-1.5">
                {data.auto_tuning.optimized_params && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Alpha (level)</span>
                      <span className="font-mono font-medium">{data.auto_tuning.optimized_params.alpha} <span className="text-gray-400">was {data.auto_tuning.default_params.alpha}</span></span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Beta (trend)</span>
                      <span className="font-mono font-medium">{data.auto_tuning.optimized_params.beta} <span className="text-gray-400">was {data.auto_tuning.default_params.beta}</span></span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Gamma (season)</span>
                      <span className="font-mono font-medium">{data.auto_tuning.optimized_params.gamma} <span className="text-gray-400">was {data.auto_tuning.default_params.gamma}</span></span>
                    </div>
                  </>
                )}
                {data.auto_tuning.improvement && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">RMSE improvement</span>
                      <span className={`font-semibold ${data.auto_tuning.improvement.pct_improvement > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        {data.auto_tuning.improvement.pct_improvement > 0 ? '+' : ''}{data.auto_tuning.improvement.pct_improvement}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Adaptive Weights */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Adaptive Ensemble Weights</p>
              <div className="space-y-2">
                {Object.entries(data.auto_tuning.adaptive_weights).map(([model, weight]) => (
                  <div key={model}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-600">{model === 'hw' ? 'Holt-Winters' : model === 'sd' ? 'Seasonal Decomp' : 'Category Build-Up'}</span>
                      <span className="font-semibold">{(weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${weight * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {data.auto_tuning.bias_corrections && (
                <div className="mt-3 pt-2 border-t">
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Bias Corrections Applied</p>
                  <div className="flex gap-3 text-xs">
                    {Object.entries(data.auto_tuning.bias_corrections).map(([m, v]) => (
                      <span key={m} className={v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-gray-400'}>
                        {m.toUpperCase()}: {v > 0 ? '+' : ''}{fmt(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cross-Validation + Outliers */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Walk-Forward Cross-Validation</p>
              <div className="space-y-1">
                {data.auto_tuning.cross_validation && Object.entries(data.auto_tuning.cross_validation).map(([model, m]) => (
                  <div key={model} className="flex justify-between text-xs">
                    <span className="text-gray-600">{model}</span>
                    <span className="text-gray-800">MAPE: {m.mape}% | Bias: {fmt(m.bias)}</span>
                  </div>
                ))}
              </div>
              {data.auto_tuning.outliers && data.auto_tuning.outliers.count > 0 && (
                <div className="mt-3 pt-2 border-t">
                  <p className="text-xs text-gray-600">
                    <span className="font-semibold text-yellow-600">{data.auto_tuning.outliers.count} outlier{data.auto_tuning.outliers.count > 1 ? 's' : ''}</span> detected and dampened
                  </p>
                </div>
              )}
              {data.auto_tuning.snapshot_learning && (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Learned from {data.auto_tuning.snapshot_learning.snapshotCount} past snapshots</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="bg-white rounded-xl border p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Methodology</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 leading-relaxed">
          <div>
            <p className="font-semibold text-gray-800 mb-1">Holt-Winters Additive Smoothing</p>
            <p>Triple exponential smoothing with 12-month seasonality. Captures level, trend, and seasonal patterns simultaneously. Parameters: alpha=0.3 (level), beta=0.05 (trend), gamma=0.3 (season). Best for data with both trend and repeating seasonal patterns.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Seasonal Decomposition + Linear Trend</p>
            <p>Decomposes the time series into seasonal indices (ratio of each month's average to overall average) and fits a linear trend on the deseasonalized data. The forecast multiplies the extrapolated trend by the target month's seasonal index.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Category Build-Up (Bottom-Up)</p>
            <p>Forecasts each product category independently using its average monthly units and selling price, then constrains by available inventory. Categories with zero stock are capped at zero. Summed to produce a supply-side revenue ceiling.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Ensemble (Weighted Blend)</p>
            <p>Combines all three models: Holt-Winters (35%), Seasonal Decomposition (35%), and Category Build-Up (30%). The statistical models capture demand patterns while the category model introduces supply-side reality. 95% confidence interval uses blended RMSE.</p>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Recommendations to Improve Sales</h3>
        <div className="space-y-3">
          {recommendations.map((rec, i) => {
            const style = PRIORITY_STYLES[rec.priority]
            return (
              <div key={i} className={`${style.bg} ${style.border} border rounded-xl p-4`}>
                <div className="flex items-start gap-3">
                  <span className={`${style.badge} text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 uppercase`}>
                    {rec.priority}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{rec.title}</p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">{rec.detail}</p>
                    {rec.impact > 0 && (
                      <p className="text-xs text-gray-500 mt-1.5">Estimated impact: <span className="font-semibold text-gray-700">{fmt(rec.impact)}</span></p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Forecast Accuracy Tracker */}
      {history && history.accuracy_chart && history.accuracy_chart.length > 0 && (
        <div className="bg-white rounded-xl border p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Forecast Accuracy Tracker</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={history.accuracy_chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtK} fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v, name) => [fmt(v), name]} />
                  <Legend />
                  <Bar dataKey="forecast" name="Forecast" fill="#7c3aed" opacity={0.6} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Accuracy by Month</p>
              <div className="space-y-2">
                {history.accuracy_chart.map(m => (
                  <div key={m.month} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{m.month}</span>
                    <span className={`text-sm font-semibold ${m.accuracy >= 80 ? 'text-green-600' : m.accuracy >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {m.accuracy.toFixed(1)}%
                    </span>
                  </div>
                ))}
                {history.accuracy_chart.length > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm font-medium text-gray-900">Average</span>
                    <span className="text-sm font-bold text-gray-900">
                      {(history.accuracy_chart.reduce((s, m) => s + m.accuracy, 0) / history.accuracy_chart.length).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot History */}
      {history && history.snapshots && history.snapshots.length > 0 && (
        <div className="bg-white rounded-xl border p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Snapshot History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Generated</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Target Month</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Forecast</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">CI Range</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Actual</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.snapshots.slice(0, 20).map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-500">{new Date(s.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="py-2 px-3 font-medium">{s.forecast_month}</td>
                    <td className="py-2 px-3 text-right">{fmt(s.ensemble_forecast)}</td>
                    <td className="py-2 px-3 text-right text-gray-500 text-xs">{fmt(s.ci_low)} — {fmt(s.ci_high)}</td>
                    <td className="py-2 px-3 text-right">{s.actual_revenue ? fmt(s.actual_revenue) : <span className="text-gray-400">pending</span>}</td>
                    <td className="py-2 px-3 text-right">
                      {s.accuracy_pct != null ? (
                        <span className={`font-semibold ${s.accuracy_pct >= 80 ? 'text-green-600' : s.accuracy_pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {s.accuracy_pct.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-xs text-gray-500 leading-relaxed">
        <p className="font-semibold text-gray-600 mb-1">Disclaimer</p>
        <p>This forecast is generated using statistical models applied to historical sales data and current inventory levels. It is intended as a planning tool, not a guarantee. Actual results may vary due to market conditions, supply disruptions, pricing changes, bulk orders, or other factors not captured in the model. The 95% confidence interval reflects model uncertainty based on historical residuals. Review and adjust assumptions regularly.</p>
      </div>
    </div>
  )
}
