import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

/**
 * Format currency amount with symbol
 */
function formatCurrency(amount, currencyCode = 'GHS') {
  if (amount == null || isNaN(amount)) return '—';

  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${currencyCode} ${formatted}`;
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format date for input field (YYYY-MM-DD)
 */
function formatDateForInput(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Summary Card Component
 */
function SummaryCard({ title, value, count, icon, color = 'blue', onClick, active }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700'
  };

  const activeRing = {
    blue: 'ring-2 ring-blue-500 border-blue-500',
    green: 'ring-2 ring-green-500 border-green-500',
    red: 'ring-2 ring-red-500 border-red-500',
    gray: 'ring-2 ring-gray-500 border-gray-500'
  };

  return (
    <div
      className={`rounded-lg border p-4 ${colorClasses[color]} ${active ? activeRing[color] : ''} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-80">{title}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {count !== undefined && (
        <div className="text-xs mt-1 opacity-70">
          {count} transaction{count !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

/**
 * Multi-Select Dropdown Component
 */
function MultiSelectDropdown({ label, options, selected, onChange, onClear }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white cursor-pointer flex items-center justify-between min-h-[42px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="text-gray-400">All</span>
          ) : selected.length <= 2 ? (
            selected.map(val => (
              <span
                key={val}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
              >
                {val}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-700">
              {selected.length} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          {selected.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
          <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options</div>
            ) : (
              options.map(option => (
                <label
                  key={option}
                  className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggleOption(option)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700">{option}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Sort Header Component
 */
function SortHeader({ column, label, sortBy, sortOrder, onSort }) {
  const isActive = sortBy === column;

  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`${isActive ? 'text-blue-600' : 'text-gray-300'}`}>
          {isActive ? (sortOrder === 'ASC' ? '▲' : '▼') : '↕'}
        </span>
      </div>
    </th>
  );
}

/**
 * Transaction Type Badge
 */
function TransactionTypeBadge({ type }) {
  const styles = {
    PAYMENT: 'bg-green-100 text-green-800',
    REFUND: 'bg-red-100 text-red-800'
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[type] || 'bg-gray-100 text-gray-800'}`}>
      {type}
    </span>
  );
}

export default function Payments() {
  const [transactions, setTransactions] = useState([]);
  const [aggregates, setAggregates] = useState({
    totalPayments: 0,
    totalRefunds: 0,
    netCollected: 0,
    paymentCount: 0,
    refundCount: 0,
    transactionCount: 0
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });
  const [dateRange, setDateRange] = useState({
    from: null,
    to: null
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Available filter options
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [transactionTypes, setTransactionTypes] = useState([]);

  // Filters state
  const now = new Date();
  const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [filters, setFilters] = useState({
    dateFrom: formatDateForInput(defaultDateFrom),
    dateTo: formatDateForInput(defaultDateTo),
    transactionType: [],
    paymentMethod: [],
    search: '',
    includeVoided: false
  });

  // Sorting state
  const [sortBy, setSortBy] = useState('payment_date');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Fetch payment methods on mount
  useEffect(() => {
    async function fetchMethods() {
      try {
        const res = await axios.get('/api/v1/payments/methods');
        if (res.data.success) {
          setPaymentMethods(res.data.data.methods || []);
          setTransactionTypes(res.data.data.transactionTypes || []);
        }
      } catch (err) {
        console.error('Failed to fetch payment methods:', err);
      }
    }
    fetchMethods();
  }, []);

  // Fetch transactions when filters change
  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true);
      setError(null);

      try {
        const params = {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          page: pagination.page,
          limit: pagination.limit,
          sortBy,
          sortOrder,
          includeVoided: filters.includeVoided ? 'true' : 'false'
        };

        if (filters.transactionType.length > 0) {
          params.transactionType = filters.transactionType.join(',');
        }
        if (filters.paymentMethod.length > 0) {
          params.paymentMethod = filters.paymentMethod.join(',');
        }
        if (filters.search) {
          params.search = filters.search;
        }

        const res = await axios.get('/api/v1/payments', { params });

        if (res.data.success) {
          setTransactions(res.data.data.transactions || []);
          setAggregates(res.data.data.aggregates || {});
          setPagination(prev => ({
            ...prev,
            ...res.data.data.pagination
          }));
          setDateRange(res.data.data.dateRange || {});
        }
      } catch (err) {
        console.error('Failed to fetch transactions:', err);
        setError(err.response?.data?.error?.message || 'Failed to load payment transactions');
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();
  }, [filters.dateFrom, filters.dateTo, filters.transactionType, filters.paymentMethod, filters.search, filters.includeVoided, pagination.page, sortBy, sortOrder]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Quick date presets
  const setDatePreset = (preset) => {
    const now = new Date();
    let from, to;

    switch (preset) {
      case 'today':
        from = to = now;
        break;
      case 'yesterday':
        from = to = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'thisWeek':
        from = new Date(now);
        from.setDate(now.getDate() - now.getDay());
        to = now;
        break;
      case 'thisMonth':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'thisYear':
        from = new Date(now.getFullYear(), 0, 1);
        to = now;
        break;
      default:
        return;
    }

    setFilters(prev => ({
      ...prev,
      dateFrom: formatDateForInput(from),
      dateTo: formatDateForInput(to)
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-600 mt-1">
          View all payment transactions across invoices
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Total Payments"
          value={formatCurrency(aggregates.totalPayments, 'GHS')}
          count={aggregates.paymentCount}
          icon="💰"
          color="green"
          active={filters.transactionType.length === 1 && filters.transactionType[0] === 'PAYMENT'}
          onClick={() => {
            const isActive = filters.transactionType.length === 1 && filters.transactionType[0] === 'PAYMENT';
            handleFilterChange('transactionType', isActive ? [] : ['PAYMENT']);
          }}
        />
        <SummaryCard
          title="Total Refunds"
          value={formatCurrency(aggregates.totalRefunds, 'GHS')}
          count={aggregates.refundCount}
          icon="↩️"
          color="red"
          active={filters.transactionType.length === 1 && filters.transactionType[0] === 'REFUND'}
          onClick={() => {
            const isActive = filters.transactionType.length === 1 && filters.transactionType[0] === 'REFUND';
            handleFilterChange('transactionType', isActive ? [] : ['REFUND']);
          }}
        />
        <SummaryCard
          title="Net Collected"
          value={formatCurrency(aggregates.netCollected, 'GHS')}
          count={aggregates.transactionCount}
          icon="📊"
          color="blue"
          active={false}
          onClick={() => handleFilterChange('transactionType', [])}
        />
        <SummaryCard
          title="Date Range"
          value={dateRange.from ? `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}` : '—'}
          icon="📅"
          color="gray"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Date From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              max={formatDateForInput(new Date())}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={filters.dateTo}
              max={formatDateForInput(new Date())}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Transaction Type */}
          <MultiSelectDropdown
            label="Transaction Type"
            options={transactionTypes}
            selected={filters.transactionType}
            onChange={(val) => handleFilterChange('transactionType', val)}
            onClear={() => handleFilterChange('transactionType', [])}
          />

          {/* Payment Method */}
          <MultiSelectDropdown
            label="Payment Method"
            options={paymentMethods}
            selected={filters.paymentMethod}
            onChange={(val) => handleFilterChange('paymentMethod', val)}
            onClear={() => handleFilterChange('paymentMethod', [])}
          />

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Invoice # or customer..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Include Voided */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.includeVoided}
                onChange={(e) => handleFilterChange('includeVoided', e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Include Voided</span>
            </label>
          </div>
        </div>

        {/* Date Presets */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 self-center mr-2">Quick:</span>
          {[
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'thisWeek', label: 'This Week' },
            { key: 'thisMonth', label: 'This Month' },
            { key: 'lastMonth', label: 'Last Month' },
            { key: 'thisYear', label: 'This Year' }
          ].map(preset => (
            <button
              key={preset.key}
              onClick={() => setDatePreset(preset.key)}
              className="px-3 py-1 text-xs font-medium rounded-full border border-gray-300 hover:bg-gray-100 text-gray-700"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
          {error}
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No transactions found for the selected filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortHeader
                      column="payment_date"
                      label="Date"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortHeader
                      column="transaction_type"
                      label="Type"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <SortHeader
                      column="payment_method"
                      label="Method"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortHeader
                      column="amount"
                      label="Amount"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Received By
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map(tx => (
                    <tr
                      key={tx.id}
                      className={`hover:bg-gray-50 ${tx.voided_at ? 'bg-red-50 opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatDate(tx.payment_date)}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <TransactionTypeBadge type={tx.transaction_type} />
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {tx.invoiceId ? (
                          <Link
                            to={`/sales/invoices/${tx.invoiceId}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {tx.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {tx.customerId ? (
                          <Link
                            to={`/customers/${tx.customerId}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {tx.customerName}
                          </Link>
                        ) : (
                          <span className="text-gray-400">{tx.customerName || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {tx.paymentMethodDisplay || tx.payment_method || '—'}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${tx.transaction_type === 'REFUND' ? 'text-red-600' : 'text-green-600'}`}>
                        {tx.transaction_type === 'REFUND' ? '-' : ''}
                        {formatCurrency(tx.amount, tx.invoice?.currency || 'GHS')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap max-w-[150px] truncate" title={tx.reference_number}>
                        {tx.reference_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {tx.receivedBy?.full_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {tx.voided_at ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800" title={`Voided by ${tx.voidedBy?.full_name || 'Unknown'}`}>
                            VOIDED
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} transactions
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 text-sm font-medium rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-700">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1 text-sm font-medium rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
