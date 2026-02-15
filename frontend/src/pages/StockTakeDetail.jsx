import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  finalized: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
}
const STATUS_LABELS = {
  draft: 'Draft',
  in_progress: 'In Progress',
  under_review: 'Under Review',
  finalized: 'Finalized',
  cancelled: 'Cancelled'
}

const RESOLUTION_OPTIONS = [
  { value: '', label: 'Select resolution...' },
  { value: 'sold_not_invoiced', label: 'Sold (not invoiced)' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost_stolen', label: 'Lost / Stolen' },
  { value: 'found_extra', label: 'Found Extra' },
  { value: 'miscount', label: 'Miscount (no adjustment)' },
  { value: 'other', label: 'Other' }
]

export default function StockTakeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdminManager = ['Admin', 'Manager'].includes(user?.role)

  // Stock take state
  const [stockTake, setStockTake] = useState(null)
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Items state
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemFilter, setItemFilter] = useState('all')
  const [itemSearch, setItemSearch] = useState('')
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanLog, setScanLog] = useState([])
  const scannerRef = useRef(null)
  const html5QrcodeRef = useRef(null)
  const lastScanRef = useRef({ code: null, time: 0 })

  // Fetch stock take
  const fetchStockTake = useCallback(async () => {
    try {
      const res = await axios.get(`/api/v1/stock-takes/${id}`)
      setStockTake(res.data.data.stockTake)
      setProgress(res.data.data.stockTake.progress)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load stock take')
    } finally {
      setLoading(false)
    }
  }, [id])

  // Fetch items
  const fetchItems = useCallback(async (page = 1) => {
    setItemsLoading(true)
    try {
      const params = { page, limit: 100 }
      if (itemFilter === 'pending') params.status = 'pending'
      else if (itemFilter === 'counted') params.status = 'counted'
      else if (itemFilter === 'variance') params.hasVariance = 'true'
      if (itemSearch) params.search = itemSearch

      const res = await axios.get(`/api/v1/stock-takes/${id}/items`, { params })
      setItems(res.data.data.items)
      setPagination(res.data.data.pagination)
    } catch (err) {
      console.error('Failed to load items', err)
    } finally {
      setItemsLoading(false)
    }
  }, [id, itemFilter, itemSearch])

  useEffect(() => { fetchStockTake() }, [fetchStockTake])
  useEffect(() => {
    if (stockTake && stockTake.status !== 'draft') fetchItems()
  }, [stockTake?.status, fetchItems])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleStart = async () => {
    if (!window.confirm('Start counting? This will snapshot current inventory quantities.')) return
    setActionLoading(true)
    try {
      const res = await axios.post(`/api/v1/stock-takes/${id}/start`)
      setStockTake(res.data.data.stockTake)
      setProgress(res.data.data.progress)
      fetchItems()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to start')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!window.confirm('Submit for review? All items must be counted.')) return
    setActionLoading(true)
    try {
      const res = await axios.post(`/api/v1/stock-takes/${id}/submit-review`)
      setStockTake(res.data.data.stockTake)
      fetchStockTake()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to submit')
    } finally {
      setActionLoading(false)
    }
  }

  const handleFinalize = async () => {
    if (!window.confirm('Finalize and apply inventory adjustments? This cannot be undone.')) return
    setActionLoading(true)
    try {
      const res = await axios.post(`/api/v1/stock-takes/${id}/finalize`)
      setStockTake(res.data.data.stockTake)
      setProgress(res.data.data.summary)
      alert(res.data.message)
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to finalize')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel this stock take?')) return
    setActionLoading(true)
    try {
      const res = await axios.post(`/api/v1/stock-takes/${id}/cancel`)
      setStockTake(res.data.data.stockTake)
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to cancel')
    } finally {
      setActionLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      const res = await axios.get(`/api/v1/stock-takes/${id}/export`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `stock-take-${stockTake.reference}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to export CSV')
    }
  }

  // ---------------------------------------------------------------------------
  // Count updates
  // ---------------------------------------------------------------------------

  const updateItemCount = async (itemId, counted_quantity) => {
    try {
      const res = await axios.put(`/api/v1/stock-takes/${id}/items/${itemId}`, { counted_quantity })
      setItems(prev => prev.map(i => i.id === itemId ? res.data.data.item : i))
      fetchStockTake() // refresh progress
    } catch (err) {
      console.error('Failed to update count', err)
    }
  }

  const updateItemResolution = async (itemId, resolution, resolution_notes) => {
    try {
      const payload = { resolution }
      if (resolution_notes !== undefined) payload.resolution_notes = resolution_notes
      const res = await axios.put(`/api/v1/stock-takes/${id}/items/${itemId}`, payload)
      setItems(prev => prev.map(i => i.id === itemId ? res.data.data.item : i))
    } catch (err) {
      console.error('Failed to update resolution', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Scanner
  // ---------------------------------------------------------------------------

  const openScanner = async () => {
    setScannerOpen(true)
    // Delay to allow DOM to render
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode('scanner-reader')
        html5QrcodeRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          onScanSuccess,
          () => {} // ignore scan failures (continuous)
        )
      } catch (err) {
        console.error('Scanner start error:', err)
        addScanLog('error', 'Camera access denied or not available')
      }
    }, 300)
  }

  const closeScanner = async () => {
    try {
      if (html5QrcodeRef.current?.isScanning) {
        await html5QrcodeRef.current.stop()
      }
      html5QrcodeRef.current = null
    } catch (err) {
      console.error('Scanner stop error:', err)
    }
    setScannerOpen(false)
  }

  const addScanLog = (type, text, itemData = null) => {
    setScanLog(prev => [{ type, text, time: new Date(), itemData }, ...prev].slice(0, 10))
  }

  const onScanSuccess = async (decodedText) => {
    // Debounce: skip duplicate scan within 3 seconds
    const now = Date.now()
    if (decodedText === lastScanRef.current.code && now - lastScanRef.current.time < 3000) {
      return
    }
    lastScanRef.current = { code: decodedText, time: now }

    // Vibrate if supported
    if (navigator.vibrate) navigator.vibrate(100)

    try {
      const res = await axios.get(`/api/v1/stock-takes/${id}/lookup`, { params: { code: decodedText } })
      const item = res.data.data.item
      const asset = item.asset

      if (item.counted_quantity != null) {
        // Already counted
        addScanLog('warning', `Already counted: ${asset.asset_tag} - ${asset.make} ${asset.model}`, item)
        return
      }

      // Auto-mark serialized items (expected qty = 1)
      if (item.expected_quantity <= 1) {
        await updateItemCount(item.id, 1)
        addScanLog('success', `Found: ${asset.asset_tag} - ${asset.make} ${asset.model}`, item)
      } else {
        // Bulk item — add to log, user needs to enter count manually
        addScanLog('info', `Bulk: ${asset.asset_tag} - ${asset.make} ${asset.model} (qty: ${item.expected_quantity})`, item)
        // Scroll to item in list
        const el = document.getElementById(`item-row-${item.id}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-blue-500')
          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 3000)
        }
      }
    } catch (err) {
      addScanLog('error', `Not found: ${decodedText}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div><p className="mt-4 text-gray-600">Loading...</p></div></div>
  }

  if (error || !stockTake) {
    return <div className="p-4 bg-red-100 text-red-700 rounded">{error || 'Stock take not found'}</div>
  }

  const progressPct = progress && progress.total_items > 0
    ? Math.round((progress.counted / progress.total_items) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <button onClick={() => navigate('/stock-takes')} className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block">&larr; Back to Stock Takes</button>
          <h1 className="text-2xl font-bold text-gray-900">{stockTake.name || stockTake.reference}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">{stockTake.reference}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[stockTake.status]}`}>
              {STATUS_LABELS[stockTake.status]}
            </span>
            <span className="text-sm text-gray-500 capitalize">Scope: {stockTake.scope}</span>
            {stockTake.blind_count && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Blind</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {stockTake.status === 'draft' && (
            <button onClick={handleStart} disabled={actionLoading} className="btn btn-primary disabled:opacity-50">
              {actionLoading ? 'Starting...' : 'Start Count'}
            </button>
          )}
          {stockTake.status === 'in_progress' && (
            <>
              <button onClick={openScanner} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                Scan
              </button>
              <button onClick={handleSubmitReview} disabled={actionLoading} className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50">
                Submit for Review
              </button>
            </>
          )}
          {stockTake.status === 'under_review' && isAdminManager && (
            <button onClick={handleFinalize} disabled={actionLoading} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
              Finalize & Adjust
            </button>
          )}
          {!['finalized', 'cancelled'].includes(stockTake.status) && (
            <button onClick={handleCancel} disabled={actionLoading} className="px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50">
              Cancel
            </button>
          )}
          {stockTake.status !== 'draft' && (
            <button onClick={handleExport} className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress && progress.total_items > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Counting Progress</span>
            <span className="text-sm text-gray-500">{progressPct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${progressPct === 100 ? 'bg-green-500' : 'bg-primary-600'}`}
              style={{ width: `${progressPct}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      {progress && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-gray-900">{progress.total_items}</div>
            <div className="text-sm text-gray-500">Total Items</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-blue-600">{progress.counted}</div>
            <div className="text-sm text-gray-500">Counted</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">{progress.matched}</div>
            <div className="text-sm text-gray-500">Matched</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-red-600">{progress.discrepancies}</div>
            <div className="text-sm text-gray-500">Discrepancies</div>
          </div>
        </div>
      )}

      {/* Notes */}
      {stockTake.notes && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Notes</h3>
          <p className="text-sm text-gray-600">{stockTake.notes}</p>
        </div>
      )}

      {/* Finalized summary */}
      {stockTake.status === 'finalized' && stockTake.summary && (
        <div className="card bg-green-50 border border-green-200">
          <h3 className="text-sm font-semibold text-green-800 mb-2">Finalized Summary</h3>
          <p className="text-sm text-green-700">
            {stockTake.summary.adjustments_made} inventory adjustments applied.
            Finalized by {stockTake.finalizer?.full_name || 'Unknown'} on {new Date(stockTake.finalized_at).toLocaleString()}.
          </p>
        </div>
      )}

      {/* Items table */}
      {stockTake.status !== 'draft' && (
        <div className="card">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Items</h3>
            <div className="flex gap-1 ml-auto">
              {[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'counted', label: 'Counted' },
                { key: 'variance', label: 'Has Variance' }
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setItemFilter(f.key)}
                  className={`px-3 py-1 text-xs rounded-full ${itemFilter === f.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchItems()}
              placeholder="Search asset tag, make, model..."
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md w-60"
            />
            <button onClick={() => fetchItems()} className="text-sm text-primary-600 hover:text-primary-800">Search</button>
          </div>

          {itemsLoading ? (
            <div className="text-center py-6 text-gray-500">Loading items...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-6 text-gray-500">No items found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Asset Tag</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Serial #</th>
                    {!stockTake.blind_count && (
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Expected</th>
                    )}
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Counted</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Variance</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    {stockTake.status === 'under_review' && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Resolution</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      blindCount={stockTake.blind_count}
                      isEditable={['in_progress', 'under_review'].includes(stockTake.status)}
                      showResolution={stockTake.status === 'under_review'}
                      onUpdateCount={updateItemCount}
                      onUpdateResolution={updateItemResolution}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => fetchItems(p)}
                  className={`px-3 py-1 text-sm rounded ${p === pagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col">
          <div className="flex justify-between items-center p-4 bg-black text-white">
            <h3 className="text-lg font-semibold">Barcode Scanner</h3>
            <button onClick={closeScanner} className="text-white text-2xl leading-none">&times;</button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div id="scanner-reader" ref={scannerRef} className="w-full max-w-md"></div>
          </div>
          {/* Scan log */}
          <div className="bg-gray-900 text-white p-4 max-h-48 overflow-y-auto">
            <h4 className="text-xs uppercase text-gray-400 mb-2">Scan Log</h4>
            {scanLog.length === 0 ? (
              <p className="text-sm text-gray-500">Scan a barcode to begin...</p>
            ) : (
              <div className="space-y-1">
                {scanLog.map((entry, i) => (
                  <div
                    key={i}
                    className={`text-sm px-2 py-1 rounded ${
                      entry.type === 'success' ? 'bg-green-900 text-green-200' :
                      entry.type === 'warning' ? 'bg-yellow-900 text-yellow-200' :
                      entry.type === 'error' ? 'bg-red-900 text-red-200' :
                      'bg-blue-900 text-blue-200'
                    }`}
                  >
                    <span className="text-xs text-gray-400 mr-2">{entry.time.toLocaleTimeString()}</span>
                    {entry.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ItemRow sub-component
// ---------------------------------------------------------------------------

function ItemRow({ item, blindCount, isEditable, showResolution, onUpdateCount, onUpdateResolution }) {
  const [countInput, setCountInput] = useState(item.counted_quantity != null ? String(item.counted_quantity) : '')
  const [resolutionNotes, setResolutionNotes] = useState(item.resolution_notes || '')
  const asset = item.asset || {}
  const isSerialized = item.expected_quantity <= 1

  const varianceColor = item.variance == null ? '' :
    item.variance === 0 ? 'bg-green-50' :
    item.variance < 0 ? 'bg-red-50' :
    'bg-yellow-50'

  const handleCountBlur = () => {
    const val = parseInt(countInput)
    if (isNaN(val) || val < 0) return
    if (val !== item.counted_quantity) {
      onUpdateCount(item.id, val)
    }
  }

  const handleCountKey = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    }
  }

  const handleCheckFound = (e) => {
    onUpdateCount(item.id, e.target.checked ? 1 : 0)
    setCountInput(e.target.checked ? '1' : '0')
  }

  return (
    <tr id={`item-row-${item.id}`} className={`${varianceColor} transition-colors`}>
      <td className="px-3 py-2 font-mono text-xs text-gray-700">{asset.asset_tag}</td>
      <td className="px-3 py-2 text-gray-900">{asset.make} {asset.model}</td>
      <td className="px-3 py-2 text-gray-500 text-xs">{asset.category}</td>
      <td className="px-3 py-2 text-gray-500 text-xs font-mono">{asset.serial_number || '-'}</td>
      {!blindCount && (
        <td className="px-3 py-2 text-center text-gray-700">{item.expected_quantity}</td>
      )}
      <td className="px-3 py-2 text-center">
        {isEditable ? (
          isSerialized ? (
            <input
              type="checkbox"
              checked={item.counted_quantity === 1}
              onChange={handleCheckFound}
              className="rounded border-gray-300 text-primary-600"
              title="Physically found"
            />
          ) : (
            <input
              type="number"
              min="0"
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              onBlur={handleCountBlur}
              onKeyDown={handleCountKey}
              className="w-16 px-2 py-1 text-center text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          )
        ) : (
          <span>{item.counted_quantity != null ? item.counted_quantity : '-'}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        {item.variance != null ? (
          <span className={`font-medium ${item.variance === 0 ? 'text-green-600' : item.variance < 0 ? 'text-red-600' : 'text-yellow-600'}`}>
            {item.variance > 0 ? '+' : ''}{item.variance}
          </span>
        ) : '-'}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`px-2 py-0.5 rounded-full text-xs ${
          item.status === 'pending' ? 'bg-gray-100 text-gray-600' :
          item.status === 'counted' ? 'bg-blue-100 text-blue-700' :
          item.status === 'verified' ? 'bg-green-100 text-green-700' :
          item.status === 'adjusted' ? 'bg-purple-100 text-purple-700' : ''
        }`}>
          {item.status}
        </span>
      </td>
      {showResolution && item.variance != null && item.variance !== 0 && (
        <td className="px-3 py-2">
          <div className="flex flex-col gap-1">
            <select
              value={item.resolution || ''}
              onChange={(e) => onUpdateResolution(item.id, e.target.value || null)}
              className="text-xs px-2 py-1 border border-gray-300 rounded-md"
            >
              {RESOLUTION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {item.resolution && item.resolution !== 'match' && (
              <input
                type="text"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                onBlur={() => {
                  if (resolutionNotes !== (item.resolution_notes || '')) {
                    onUpdateResolution(item.id, item.resolution, resolutionNotes)
                  }
                }}
                placeholder="Notes..."
                className="text-xs px-2 py-1 border border-gray-300 rounded-md"
              />
            )}
          </div>
        </td>
      )}
      {showResolution && (item.variance == null || item.variance === 0) && (
        <td className="px-3 py-2 text-xs text-gray-400">-</td>
      )}
    </tr>
  )
}
