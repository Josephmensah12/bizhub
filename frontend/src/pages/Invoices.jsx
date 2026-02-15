import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Format currency for display
 */
function formatCurrency(amount, currency = 'GHS') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return { date: '—', time: '' };
  const d = new Date(dateString);
  return {
    date: d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
    time: d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  };
}

/**
 * Get date range for preset
 */
function getDateRange(preset) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (preset) {
    case 'today':
      const today = new Date(year, month, now.getDate());
      return { from: today, to: today };
    case 'current-month':
      return {
        from: new Date(year, month, 1),
        to: new Date(year, month + 1, 0)
      };
    case 'last-month':
      return {
        from: new Date(year, month - 1, 1),
        to: new Date(year, month, 0)
      };
    case 'ytd':
      return {
        from: new Date(year, 0, 1),
        to: now
      };
    default:
      return {
        from: new Date(year, month, 1),
        to: new Date(year, month + 1, 0)
      };
  }
}

/**
 * Status badge component
 */
function StatusBadge({ status }) {
  const colors = {
    'UNPAID': 'bg-yellow-100 text-yellow-800',
    'PARTIALLY_PAID': 'bg-blue-100 text-blue-800',
    'PAID': 'bg-green-100 text-green-800',
    'CANCELLED': 'bg-red-100 text-red-800'
  };

  const labels = {
    'UNPAID': 'Unpaid',
    'PARTIALLY_PAID': 'Partial',
    'PAID': 'Paid',
    'CANCELLED': 'Cancelled'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {labels[status] || status}
    </span>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const { permissions } = usePermissions();
  const canSeeCost = permissions?.canSeeCost ?? false;
  const canSeeProfit = permissions?.canSeeProfit ?? false;
  const [invoices, setInvoices] = useState([]);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    marginPercent: 0,
    invoiceCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Show/hide profit metrics
  const [showProfit, setShowProfit] = useState(false);

  // Filters
  const [datePreset, setDatePreset] = useState('current-month');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Fetch invoices when filters change
  useEffect(() => {
    fetchInvoices();
  }, [datePreset, customDateFrom, customDateTo, statusFilter, pagination.page]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate date range
      let dateFrom, dateTo;
      if (datePreset === 'custom' && customDateFrom && customDateTo) {
        dateFrom = customDateFrom;
        dateTo = customDateTo;
      } else {
        const range = getDateRange(datePreset);
        dateFrom = range.from.toISOString().split('T')[0];
        dateTo = range.to.toISOString().split('T')[0];
      }

      const params = {
        dateFrom,
        dateTo,
        page: pagination.page,
        limit: pagination.limit,
        sortBy: 'invoice_date',
        sortOrder: 'DESC'
      };

      if (statusFilter.length > 0) {
        params.status = statusFilter.join(',');
      }

      const response = await axios.get('/api/v1/invoices', { params });
      const data = response.data.data;

      setInvoices(data.invoices);
      setMetrics(data.metrics);
      setPagination(prev => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages
      }));
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleDatePresetChange = (preset) => {
    setDatePreset(preset);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <Link to="/sales/invoices/new" className="btn btn-primary">
          + Create Invoice
        </Link>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        {/* Total Revenue - Always visible */}
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(metrics.totalRevenue)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {metrics.invoiceCount} invoice{metrics.invoiceCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Net Total - Excludes cancelled invoices */}
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">Net Total</div>
          <div className="text-2xl font-bold text-emerald-600">
            {formatCurrency(metrics.netTotal)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {metrics.netCount || 0} active invoice{(metrics.netCount || 0) !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Total Collected */}
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">Collected</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(metrics.totalCollected)}
          </div>
        </div>

        {/* Total Outstanding */}
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">Outstanding</div>
          <div className={`text-2xl font-bold ${metrics.totalOutstanding > 0 ? 'text-red-600' : 'text-gray-600'}`}>
            {formatCurrency(metrics.totalOutstanding)}
          </div>
        </div>

        {/* Total Profit - Only visible to roles that can see cost */}
        {canSeeCost && (
          <div className="card">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-500">Profit</span>
              <button
                onClick={() => setShowProfit(!showProfit)}
                className="text-gray-400 hover:text-gray-600"
                title={showProfit ? 'Hide profit details' : 'Show profit details'}
              >
                {showProfit ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <div className={`text-2xl font-bold ${metrics.totalProfit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
              {showProfit ? formatCurrency(metrics.totalProfit) : '******'}
            </div>
          </div>
        )}

        {/* Margin % - Only visible to Admin (canSeeProfit) */}
        {canSeeProfit && (
          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Margin</div>
            <div className={`text-2xl font-bold ${metrics.marginPercent >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
              {showProfit ? `${metrics.marginPercent?.toFixed(1) || 0}%` : '******'}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Date Preset */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleDatePresetChange('today')}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  datePreset === 'today' ? 'bg-primary-100 border-primary-500 text-primary-700' : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => handleDatePresetChange('current-month')}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  datePreset === 'current-month' ? 'bg-primary-100 border-primary-500 text-primary-700' : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => handleDatePresetChange('last-month')}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  datePreset === 'last-month' ? 'bg-primary-100 border-primary-500 text-primary-700' : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                Last Month
              </button>
              <button
                onClick={() => handleDatePresetChange('ytd')}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  datePreset === 'ytd' ? 'bg-primary-100 border-primary-500 text-primary-700' : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                YTD
              </button>
              <button
                onClick={() => handleDatePresetChange('custom')}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  datePreset === 'custom' ? 'bg-primary-100 border-primary-500 text-primary-700' : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Custom Date Range */}
          {datePreset === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                <input
                  type="date"
                  value={customDateFrom}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="date"
                  value={customDateTo}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </>
          )}

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <div className="flex gap-2">
              {[
                { value: 'UNPAID', label: 'Unpaid' },
                { value: 'PARTIALLY_PAID', label: 'Partial' },
                { value: 'PAID', label: 'Paid' },
                { value: 'CANCELLED', label: 'Cancelled' }
              ].map(opt => {
                const active = statusFilter.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setStatusFilter(prev =>
                        active ? prev.filter(s => s !== opt.value) : [...prev, opt.value]
                      );
                      setPagination(prev => ({ ...prev, page: 1 }));
                    }}
                    className={`px-3 py-1.5 text-sm rounded-md border ${
                      active
                        ? 'bg-primary-100 border-primary-500 text-primary-700'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Invoices Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No invoices found for the selected period.
            <div className="mt-4">
              <Link to="/sales/invoices/new" className="btn btn-primary">
                Create First Invoice
              </Link>
            </div>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/sales/invoices/${invoice.id}`)}
                  >
                    <td className="px-4 py-4 text-sm font-medium text-blue-600">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      <div>{formatDate(invoice.invoice_date).date}</div>
                      <div className="text-xs text-gray-400">{formatDate(invoice.updated_at).time}</div>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {invoice.customer?.displayName || (
                        <span className="text-gray-400 italic">No customer</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-right font-medium">
                      {formatCurrency(invoice.total_amount, invoice.currency)}
                    </td>
                    <td className={`px-4 py-4 text-sm text-right font-medium ${
                      invoice.balance_due > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {formatCurrency(invoice.balance_due, invoice.currency)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <div className="text-sm text-gray-700">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} invoices
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-700">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
