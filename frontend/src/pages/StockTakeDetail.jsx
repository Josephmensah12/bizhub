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

// ---------------------------------------------------------------------------
// Toast notification system
// ---------------------------------------------------------------------------

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-start gap-2 animate-slide-in ${
            t.type === 'success' ? 'bg-green-600 text-white' :
            t.type === 'error' ? 'bg-red-600 text-white' :
            t.type === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-600 text-white'
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="text-white/70 hover:text-white ml-2 shrink-0">&times;</button>
        </div>
      ))}
    </div>
  )
}

let toastId = 0

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
  const [countMethodFilter, setCountMethodFilter] = useState('all')
  const [itemSearch, setItemSearch] = useState('')
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  // Serial scan input state
  const [serialInput, setSerialInput] = useState('')
  const [scanProcessing, setScanProcessing] = useState(false)
  const serialInputRef = useRef(null)

  // Expanded rows (for viewing scanned serials)
  const [expandedItems, setExpandedItems] = useState({})
  const [itemScans, setItemScans] = useState({})

  // Batch state
  const [batches, setBatches] = useState([])
  const [activeBatch, setActiveBatch] = useState(null)
  const [expandedBatches, setExpandedBatches] = useState({})
  const [batchScans, setBatchScans] = useState({})
  const [closingBatch, setClosingBatch] = useState(false)

  // Camera scanner state
  const [scannerOpen, setScannerOpen] = useState(false)
  const scannerRef = useRef(null)
  const html5QrcodeRef = useRef(null)
  const lastScanRef = useRef({ code: null, time: 0 })

  // Toast notifications
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((type, message) => {
    const tid = ++toastId
    setToasts(prev => [...prev, { id: tid, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), 4000)
  }, [])

  const dismissToast = useCallback((tid) => {
    setToasts(prev => prev.filter(t => t.id !== tid))
  }, [])

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
      if (countMethodFilter !== 'all') params.countMethod = countMethodFilter
      if (itemSearch) params.search = itemSearch

      const res = await axios.get(`/api/v1/stock-takes/${id}/items`, { params })
      setItems(res.data.data.items)
      setPagination(res.data.data.pagination)
    } catch (err) {
      console.error('Failed to load items', err)
    } finally {
      setItemsLoading(false)
    }
  }, [id, itemFilter, countMethodFilter, itemSearch])

  // Fetch batches
  const fetchBatches = useCallback(async () => {
    try {
      const res = await axios.get(`/api/v1/stock-takes/${id}/batches`)
      const batchList = res.data.data.batches
      setBatches(batchList)
      setActiveBatch(batchList.find(b => b.status === 'active') || null)
    } catch (err) {
      console.error('Failed to load batches', err)
    }
  }, [id])

  useEffect(() => { fetchStockTake() }, [fetchStockTake])
  useEffect(() => {
    if (stockTake && stockTake.status !== 'draft') {
      fetchItems()
      fetchBatches()
    }
  }, [stockTake?.status, fetchItems, fetchBatches])

  // Keep serial input focused when in counting mode
  const isCounting = stockTake && ['in_progress', 'under_review'].includes(stockTake.status)
  useEffect(() => {
    if (isCounting && serialInputRef.current && !scannerOpen) {
      serialInputRef.current.focus()
    }
  }, [isCounting, items, scannerOpen])

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
      fetchBatches()
      addToast('success', `Stock take started with ${res.data.message}`)
    } catch (err) {
      addToast('error', err.response?.data?.error?.message || 'Failed to start')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!window.confirm('Submit for review? All items must be counted.')) return
    setActionLoading(true)
    try {
      await axios.post(`/api/v1/stock-takes/${id}/submit-review`)
      addToast('success', 'Submitted for review')
      navigate('/stock-takes')
    } catch (err) {
      addToast('error', err.response?.data?.error?.message || 'Failed to submit')
    } finally {
      setActionLoading(false)
    }
  }

  const handleFinalize = async () => {
    if (!window.confirm('Finalize and apply inventory adjustments? This cannot be undone.')) return
    setActionLoading(true)
    try {
      const res = await axios.post(`/api/v1/stock-takes/${id}/finalize`)
      addToast('success', res.data.message || 'Stock take finalized')
      navigate('/stock-takes')
    } catch (err) {
      addToast('error', err.response?.data?.error?.message || 'Failed to finalize')
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
      addToast('warning', 'Stock take cancelled')
    } catch (err) {
      addToast('error', err.response?.data?.error?.message || 'Failed to cancel')
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
      addToast('error', 'Failed to export CSV')
    }
  }

  // ---------------------------------------------------------------------------
  // Count updates (non-serialized items)
  // ---------------------------------------------------------------------------

  const updateItemCount = async (itemId, counted_quantity) => {
    try {
      const res = await axios.put(`/api/v1/stock-takes/${id}/items/${itemId}`, { counted_quantity })
      setItems(prev => prev.map(i => i.id === itemId ? { ...res.data.data.item, scan_count: i.scan_count } : i))
      fetchStockTake()
    } catch (err) {
      console.error('Failed to update count', err)
    }
  }

  const updateItemResolution = async (itemId, resolution, resolution_notes) => {
    try {
      const payload = { resolution }
      if (resolution_notes !== undefined) payload.resolution_notes = resolution_notes
      const res = await axios.put(`/api/v1/stock-takes/${id}/items/${itemId}`, payload)
      setItems(prev => prev.map(i => i.id === itemId ? { ...res.data.data.item, scan_count: i.scan_count } : i))
    } catch (err) {
      console.error('Failed to update resolution', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Serial scanning (keyboard input)
  // ---------------------------------------------------------------------------

  const handleSerialScan = async (serial) => {
    if (!serial.trim() || scanProcessing) return
    setScanProcessing(true)
    try {
      const res = await axios.post(`/api/v1/stock-takes/${id}/scans`, { serial_number: serial.trim() })

      if (res.data.data.non_serialized) {
        // Non-serialized asset found — highlight it
        addToast('info', res.data.message)
        const item = res.data.data.item
        const el = document.getElementById(`item-row-${item.id}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-blue-500')
          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 3000)
        }
      } else {
        const { scan, item, batch, new_batch_created } = res.data.data
        const batchNum = scan.batch_number || batch?.batch_number
        addToast('success', `Scanned: ${scan.unit?.serial_number || serial} -> ${item.asset?.make} ${item.asset?.model} (${item.scan_count}/${item.expected_quantity})`)

        if (new_batch_created) {
          addToast('info', `Batch #${batchNum - 1} full (20/20). Batch #${batchNum} started.`)
        }

        // If this item is expanded, refresh its scans
        if (expandedItems[item.id]) {
          fetchItemScans(item.id)
        }

        // Refresh items, progress, and batches from server
        await fetchItems()
        fetchStockTake()
        fetchBatches()

        // Scroll to item after refresh
        setTimeout(() => {
          const el = document.getElementById(`item-row-${item.id}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-green-500')
            setTimeout(() => el.classList.remove('ring-2', 'ring-green-500'), 2000)
          }
        }, 100)
      }
    } catch (err) {
      const errCode = err.response?.data?.error?.code
      const errMsg = err.response?.data?.error?.message
      if (errCode === 'DUPLICATE_SCAN') {
        addToast('warning', errMsg)
      } else if (errCode === 'SERIAL_NOT_FOUND') {
        addToast('error', `Not found: ${serial}`)
      } else if (errCode === 'QUANTITY_ONLY') {
        addToast('warning', errMsg)
      } else {
        addToast('error', errMsg || `Scan failed: ${serial}`)
      }
    } finally {
      setScanProcessing(false)
      setSerialInput('')
      serialInputRef.current?.focus()
    }
  }

  const handleSerialKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSerialScan(serialInput)
    }
  }

  // ---------------------------------------------------------------------------
  // Expand/collapse scanned serials (per item)
  // ---------------------------------------------------------------------------

  const fetchItemScans = async (itemId) => {
    try {
      const res = await axios.get(`/api/v1/stock-takes/${id}/items/${itemId}/scans`)
      // API now returns { units, scans, total_units, scanned_count }
      setItemScans(prev => ({ ...prev, [itemId]: res.data.data }))
    } catch (err) {
      console.error('Failed to load scans', err)
    }
  }

  const toggleExpand = (itemId) => {
    setExpandedItems(prev => {
      const next = { ...prev }
      if (next[itemId]) {
        delete next[itemId]
      } else {
        next[itemId] = true
        fetchItemScans(itemId)
      }
      return next
    })
  }

  const handleRemoveScan = async (scanId, itemId) => {
    try {
      await axios.delete(`/api/v1/stock-takes/${id}/scans/${scanId}`)
      addToast('info', 'Scan removed')

      // Re-fetch the item's unit/scan data
      fetchItemScans(itemId)

      // Refresh items, progress, and batches from server
      await fetchItems()
      fetchStockTake()
      fetchBatches()
    } catch (err) {
      addToast('error', 'Failed to remove scan')
    }
  }

  const handleUpdateUnitNote = async (itemId, unitId, { reason, notes } = {}) => {
    try {
      await axios.put(`/api/v1/stock-takes/${id}/items/${itemId}/unit-notes/${unitId}`, { reason, notes })
      setItemScans(prev => {
        const data = prev[itemId]
        if (!data) return prev
        return {
          ...prev,
          [itemId]: {
            ...data,
            units: data.units.map(u => u.id === unitId ? { ...u, reason: reason || '', notes: notes || '' } : u)
          }
        }
      })
    } catch (err) {
      addToast('error', 'Failed to save note')
    }
  }

  // ---------------------------------------------------------------------------
  // Batch operations
  // ---------------------------------------------------------------------------

  const handleCloseBatch = async () => {
    if (!activeBatch) return
    if (activeBatch.scanned_count === 0) {
      addToast('warning', 'Cannot close an empty batch. Scan at least one serial first.')
      return
    }
    setClosingBatch(true)
    try {
      const res = await axios.post(`/api/v1/stock-takes/${id}/batches/${activeBatch.id}/close`)
      addToast('success', res.data.message)
      fetchBatches()
    } catch (err) {
      addToast('error', err.response?.data?.error?.message || 'Failed to close batch')
    } finally {
      setClosingBatch(false)
      serialInputRef.current?.focus()
    }
  }

  const fetchBatchScans = async (batchId) => {
    try {
      const res = await axios.get(`/api/v1/stock-takes/${id}/batches/${batchId}/scans`)
      setBatchScans(prev => ({ ...prev, [batchId]: res.data.data.scans }))
    } catch (err) {
      console.error('Failed to load batch scans', err)
    }
  }

  const toggleBatchExpand = (batchId) => {
    setExpandedBatches(prev => {
      const next = { ...prev }
      if (next[batchId]) {
        delete next[batchId]
      } else {
        next[batchId] = true
        fetchBatchScans(batchId)
      }
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Camera scanner
  // ---------------------------------------------------------------------------

  const openScanner = async () => {
    setScannerOpen(true)
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode('scanner-reader')
        html5QrcodeRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          onCameraScanSuccess,
          () => {}
        )
      } catch (err) {
        console.error('Scanner start error:', err)
        addToast('error', 'Camera access denied or not available')
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
    // Re-focus serial input
    setTimeout(() => serialInputRef.current?.focus(), 100)
  }

  const onCameraScanSuccess = async (decodedText) => {
    const now = Date.now()
    if (decodedText === lastScanRef.current.code && now - lastScanRef.current.time < 3000) return
    lastScanRef.current = { code: decodedText, time: now }

    if (navigator.vibrate) navigator.vibrate(100)

    // Use the same scan API
    handleSerialScan(decodedText)
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

  const totalScans = items.reduce((sum, i) => sum + (i.scan_count || 0), 0)

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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
                Camera
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

      {/* Serial scan input bar with batch indicator */}
      {isCounting && (
        <div className="card bg-indigo-50 border border-indigo-200">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <input
              ref={serialInputRef}
              type="text"
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
              onKeyDown={handleSerialKeyDown}
              placeholder="Scan or type serial number..."
              className="flex-1 px-4 py-2.5 text-sm border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              autoFocus
              disabled={scanProcessing}
            />
            <button
              onClick={() => handleSerialScan(serialInput)}
              disabled={!serialInput.trim() || scanProcessing}
              className="px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 shrink-0"
            >
              {scanProcessing ? 'Scanning...' : 'Add'}
            </button>
          </div>
          {/* Batch progress indicator */}
          {activeBatch && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-indigo-700 font-medium">Batch #{activeBatch.batch_number}</span>
                  <span className="text-indigo-600">{activeBatch.scanned_count}/{activeBatch.target_size}</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-indigo-600 transition-all"
                    style={{ width: `${Math.min(100, (activeBatch.scanned_count / activeBatch.target_size) * 100)}%` }}
                  ></div>
                </div>
              </div>
              <button
                onClick={handleCloseBatch}
                disabled={closingBatch || activeBatch.scanned_count === 0}
                className="px-3 py-1.5 text-xs bg-white border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-100 disabled:opacity-50 shrink-0"
              >
                {closingBatch ? 'Closing...' : 'Finish Batch'}
              </button>
            </div>
          )}
          <p className="text-xs text-indigo-600 mt-2">Scan barcode or type serial number and press Enter. Batches auto-close at 20 scans.</p>
        </div>
      )}

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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-gray-900">{progress.total_items}</div>
            <div className="text-sm text-gray-500">Total Products</div>
            {(progress.serial_items > 0 || progress.quantity_items > 0) && (
              <div className="text-xs text-gray-400 mt-1">
                {progress.serial_items || 0} serial / {progress.quantity_items || 0} qty
              </div>
            )}
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-indigo-600">{totalScans}</div>
            <div className="text-sm text-gray-500">Serials Scanned</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-blue-600">{progress.counted}</div>
            <div className="text-sm text-gray-500">Products Counted</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">{progress.matched}</div>
            <div className="text-sm text-gray-500">Matched</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-red-600">{progress.discrepancies}</div>
            <div className="text-sm text-gray-500">Discrepancies</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-orange-600">
              {items.filter(i => i.count_method === 'quantity' && i.counted_quantity != null).length}
              <span className="text-sm font-normal text-gray-400">/{progress.quantity_items || 0}</span>
            </div>
            <div className="text-sm text-gray-500">Qty Items Counted</div>
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

      {/* Batch Panel */}
      {batches.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Scan Batches</h3>
            <span className="text-sm text-gray-500">{batches.length} batch{batches.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="space-y-2">
            {batches.map(batch => (
              <BatchRow
                key={batch.id}
                batch={batch}
                isExpanded={!!expandedBatches[batch.id]}
                onToggleExpand={() => toggleBatchExpand(batch.id)}
                scans={batchScans[batch.id] || []}
                isCounting={isCounting}
                onRemoveScan={handleRemoveScan}
              />
            ))}
          </div>
        </div>
      )}

      {/* Items table */}
      {stockTake.status !== 'draft' && (
        <div className="card">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Items</h3>
            <div className="flex gap-1">
              {[
                { key: 'all', label: 'All' },
                { key: 'serial', label: 'Serial' },
                { key: 'quantity', label: 'Quantity' }
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setCountMethodFilter(f.key)}
                  className={`px-3 py-1 text-xs rounded-full ${countMethodFilter === f.key ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
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
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Asset Tag</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
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
                      isEditable={isCounting}
                      showResolution={stockTake.status === 'under_review'}
                      onUpdateCount={updateItemCount}
                      onUpdateResolution={updateItemResolution}
                      isExpanded={!!expandedItems[item.id]}
                      onToggleExpand={() => toggleExpand(item.id)}
                      scanData={itemScans[item.id] || null}
                      onRemoveScan={handleRemoveScan}
                      onUpdateUnitNote={handleUpdateUnitNote}
                      isCounting={isCounting}
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

      {/* Camera Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col">
          <div className="flex justify-between items-center p-4 bg-black text-white">
            <h3 className="text-lg font-semibold">Barcode Scanner</h3>
            <button onClick={closeScanner} className="text-white text-2xl leading-none">&times;</button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div id="scanner-reader" ref={scannerRef} className="w-full max-w-md"></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BatchRow sub-component
// ---------------------------------------------------------------------------

function BatchRow({ batch, isExpanded, onToggleExpand, scans, isCounting, onRemoveScan }) {
  const isActive = batch.status === 'active'

  return (
    <div className={`border rounded-lg ${isActive ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
      {/* Batch header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{isExpanded ? '-' : '+'}</span>
          <span className="text-sm font-medium text-gray-900">Batch #{batch.batch_number}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {isActive ? 'Active' : 'Closed'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{batch.scanned_count}/{batch.target_size} scans</span>
          {batch.started_at && (
            <span className="text-xs">{new Date(batch.started_at).toLocaleTimeString()}</span>
          )}
          {batch.closed_at && (
            <span className="text-xs text-gray-400">Closed {new Date(batch.closed_at).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Batch progress bar */}
      <div className="px-4 pb-2">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${isActive ? 'bg-indigo-500' : 'bg-gray-400'}`}
            style={{ width: `${Math.min(100, (batch.scanned_count / batch.target_size) * 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Expanded scan list */}
      {isExpanded && (
        <div className="border-t border-gray-200 px-4 py-3">
          {scans.length === 0 ? (
            <div className="text-xs text-gray-400 py-2">Loading scans...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left py-1 pr-3">#</th>
                  <th className="text-left py-1 pr-3">Serial Number</th>
                  <th className="text-left py-1 pr-3">Product</th>
                  <th className="text-left py-1 pr-3">CPU</th>
                  <th className="text-left py-1 pr-3">RAM</th>
                  <th className="text-left py-1 pr-3">Storage</th>
                  <th className="text-left py-1 pr-3">Time</th>
                  {isCounting && <th className="text-center py-1">Remove</th>}
                </tr>
              </thead>
              <tbody>
                {scans.map((scan, idx) => (
                  <tr key={scan.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-3 text-gray-400">{idx + 1}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-700">{scan.serial_number}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{scan.asset?.make} {scan.asset?.model}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{scan.unit?.cpu || '-'}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{scan.unit?.memory ? `${Math.round(scan.unit.memory / 1024)}GB` : '-'}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{scan.unit?.storage ? `${scan.unit.storage}GB` : '-'}</td>
                    <td className="py-1.5 pr-3 text-gray-400">{new Date(scan.scanned_at).toLocaleTimeString()}</td>
                    {isCounting && (
                      <td className="py-1.5 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveScan(scan.id, scan.stock_take_item_id) }}
                          className="text-red-400 hover:text-red-600"
                          title="Remove scan"
                        >
                          &times;
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// UnitNoteInput — inline note editor for individual serial numbers
// ---------------------------------------------------------------------------

function UnitNoteInput({ initialValue, onSave }) {
  const [value, setValue] = useState(initialValue)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setValue(initialValue) }, [initialValue])

  const handleBlur = () => {
    if (value !== initialValue) {
      onSave(value)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
        placeholder="Add note..."
        className={`text-xs px-2 py-1 border rounded-md w-36 ${saved ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// UnscannedReasonInput — reason dropdown + notes for unscanned serial numbers
// ---------------------------------------------------------------------------

const UNSCANNED_REASONS = [
  { value: '', label: 'Select reason...' },
  { value: 'sold_not_invoiced', label: 'Sold (not invoiced)' },
  { value: 'in_repair', label: 'In repair' },
  { value: 'on_loan', label: 'On loan' },
  { value: 'lost_stolen', label: 'Lost / Stolen' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'relocated', label: 'Relocated' },
  { value: 'other', label: 'Other' },
]

function UnscannedReasonInput({ initialReason, initialNotes, onSave }) {
  const [reason, setReason] = useState(initialReason || '')
  const [notes, setNotes] = useState(initialNotes || '')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setReason(initialReason || ''); setNotes(initialNotes || '') }, [initialReason, initialNotes])

  const save = (newReason, newNotes) => {
    onSave({ reason: newReason, notes: newNotes })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className={`flex items-center gap-1.5 ${saved ? 'ring-1 ring-green-400 rounded-md' : ''}`}>
      <select
        value={reason}
        onChange={(e) => { setReason(e.target.value); save(e.target.value, notes) }}
        className={`text-xs px-1.5 py-1 border rounded-md ${!reason ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-300'}`}
      >
        {UNSCANNED_REASONS.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => { if (notes !== (initialNotes || '')) save(reason, notes) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
        placeholder="Details..."
        className="text-xs px-2 py-1 border border-gray-300 rounded-md w-28"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ItemRow sub-component with expandable serial scans
// ---------------------------------------------------------------------------

function ItemRow({ item, blindCount, isEditable, showResolution, onUpdateCount, onUpdateResolution, isExpanded, onToggleExpand, scanData, onRemoveScan, onUpdateUnitNote, isCounting }) {
  const [countInput, setCountInput] = useState(item.counted_quantity != null ? String(item.counted_quantity) : '')
  const [resolutionNotes, setResolutionNotes] = useState(item.resolution_notes || '')
  const asset = item.asset || {}
  const isSerial = item.count_method === 'serial'
  const scanCount = item.scan_count || 0
  const units = scanData?.units || []
  const totalUnits = scanData?.total_units || 0

  // Sync countInput when item updates externally (from scan)
  useEffect(() => {
    if (item.counted_quantity != null) {
      setCountInput(String(item.counted_quantity))
    }
  }, [item.counted_quantity])

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

  // Determine column count for expanded row
  let colSpan = 8 // expand btn + tag + item + category + counted + variance + status
  if (!blindCount) colSpan++
  if (showResolution || isCounting) colSpan++

  return (
    <>
      <tr id={`item-row-${item.id}`} className={`${varianceColor} transition-colors`}>
        {/* Expand button for serial items — shows all units */}
        <td className="px-2 py-2 text-center">
          {isSerial ? (
            <button
              onClick={onToggleExpand}
              className="w-6 h-6 flex items-center justify-center rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-sm font-bold"
              title={isExpanded ? 'Collapse units' : `View serial numbers (${scanCount} scanned)`}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse serial list' : 'Expand serial list'}
            >
              {isExpanded ? '\u2212' : '+'}
            </button>
          ) : null}
        </td>
        <td className="px-3 py-2 font-mono text-xs text-gray-700">{asset.asset_tag}</td>
        <td className="px-3 py-2 text-gray-900">
          {asset.make} {asset.model}
          <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isSerial ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'
          }`}>
            {isSerial ? 'SERIAL' : 'QTY'}
          </span>
        </td>
        <td className="px-3 py-2 text-gray-500 text-xs">{asset.category}</td>
        {!blindCount && (
          <td className="px-3 py-2 text-center text-gray-700">{item.expected_quantity}</td>
        )}
        <td className="px-3 py-2 text-center">
          {isEditable ? (
            isSerial ? (
              <span className="text-sm font-medium text-indigo-700" title="Derived from scans">
                {scanCount}
              </span>
            ) : !isSerial && item.expected_quantity <= 1 ? (
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

      {/* Expanded unit rows — shows ALL serial numbers with scan status */}
      {isExpanded && (
        <tr>
          <td colSpan={colSpan} className="px-0 py-0">
            <div className="bg-gray-50 border-t border-b border-gray-200 px-8 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase">
                  Serial Numbers ({totalUnits})
                </span>
                {scanCount > 0 && (
                  <span className="text-xs text-green-600 font-medium">
                    {scanCount} scanned
                  </span>
                )}
              </div>
              {!scanData ? (
                <div className="text-xs text-gray-400">Loading...</div>
              ) : units.length === 0 ? (
                <div className="text-xs text-gray-400">No units found for this product</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-center py-1 pr-3 w-8">Status</th>
                      <th className="text-left py-1 pr-4">Serial Number</th>
                      <th className="text-left py-1 pr-4">CPU</th>
                      <th className="text-left py-1 pr-4">RAM</th>
                      <th className="text-left py-1 pr-4">Storage</th>
                      <th className="text-left py-1 pr-4">Unit Status</th>
                      <th className="text-left py-1 pr-4">Scanned By</th>
                      <th className="text-left py-1 pr-4">Time</th>
                      {(showResolution || isCounting) && <th className="text-left py-1 pr-4">Reason / Notes</th>}
                      {isCounting && <th className="text-center py-1">Remove</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(unit => {
                      const scan = unit.scanned ? (scanData?.scans || []).find(s => s.asset_unit_id === unit.id) : null
                      return (
                        <tr key={unit.id} className={`border-t border-gray-100 ${unit.scanned ? 'bg-green-50' : ''}`}>
                          <td className="py-1.5 pr-3 text-center">
                            {unit.scanned ? (
                              <span className="inline-block w-5 h-5 rounded-full bg-green-500 text-white text-[10px] leading-5 text-center" title="Scanned">&#10003;</span>
                            ) : (
                              <span className="inline-block w-5 h-5 rounded-full bg-gray-200 text-gray-400 text-[10px] leading-5 text-center" title="Not scanned">&ndash;</span>
                            )}
                          </td>
                          <td className={`py-1.5 pr-4 font-mono ${unit.scanned ? 'text-green-700 font-medium' : 'text-gray-500'}`}>{unit.serial_number}</td>
                          <td className="py-1.5 pr-4 text-gray-500">{unit.cpu || unit.cpu_model || '-'}</td>
                          <td className="py-1.5 pr-4 text-gray-500">{unit.memory ? `${Math.round(unit.memory / 1024)}GB` : '-'}</td>
                          <td className="py-1.5 pr-4 text-gray-500">{unit.storage ? `${unit.storage}GB` : '-'}</td>
                          <td className="py-1.5 pr-4">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              unit.status === 'Available' ? 'bg-green-100 text-green-700' :
                              unit.status === 'Reserved' ? 'bg-yellow-100 text-yellow-700' :
                              unit.status === 'Sold' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {unit.status}
                            </span>
                          </td>
                          <td className="py-1.5 pr-4 text-gray-500">{unit.scanned_by || '-'}</td>
                          <td className="py-1.5 pr-4 text-gray-400">{unit.scanned_at ? new Date(unit.scanned_at).toLocaleTimeString() : '-'}</td>
                          {(showResolution || isCounting) && (
                            <td className="py-1.5 pr-4">
                              {!unit.scanned ? (
                                <UnscannedReasonInput
                                  initialReason={unit.reason || ''}
                                  initialNotes={unit.notes || ''}
                                  onSave={({ reason, notes }) => onUpdateUnitNote(item.id, unit.id, { reason, notes })}
                                />
                              ) : (
                                <UnitNoteInput
                                  initialValue={unit.notes || ''}
                                  onSave={(notes) => onUpdateUnitNote(item.id, unit.id, { notes })}
                                />
                              )}
                            </td>
                          )}
                          {isCounting && (
                            <td className="py-1.5 text-center">
                              {unit.scanned && scan ? (
                                <button
                                  onClick={() => onRemoveScan(scan.id, item.id)}
                                  className="text-red-400 hover:text-red-600"
                                  title="Remove scan"
                                >
                                  &times;
                                </button>
                              ) : null}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
