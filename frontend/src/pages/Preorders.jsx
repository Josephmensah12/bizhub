import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const STATUSES = ['Deposit Paid', 'Purchased', 'Shipped', 'Arrived', 'Completed', 'Cancelled'];
const PAYMENT_METHODS = ['Cash', 'MoMo', 'Bank Transfer', 'Card', 'Other'];

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '—';
  return `GHS ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function StatusBadge({ status }) {
  const colors = {
    'Deposit Paid': 'bg-gray-100 text-gray-800',
    'Purchased': 'bg-yellow-100 text-yellow-800',
    'Shipped': 'bg-blue-100 text-blue-800',
    'Arrived': 'bg-green-100 text-green-800',
    'Completed': 'bg-emerald-100 text-emerald-800',
    'Cancelled': 'bg-red-100 text-red-800',
  };
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default function Preorders() {
  const [preorders, setPreorders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  const [form, setForm] = useState({
    customer_id: null,
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    item_description: '',
    quantity: 1,
    selling_price: '',
    deposit_amount: '100',
    deposit_payment_method: 'Cash',
    notes: '',
  });

  const fetchPreorders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await axios.get('/api/v1/preorders', { params });
      setPreorders(res.data.data.preorders || []);
    } catch (err) {
      setError('Failed to load preorders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/preorders/summary');
      setSummary(res.data.data);
    } catch (err) {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchPreorders();
    fetchSummary();
  }, [fetchPreorders, fetchSummary]);

  // Customer search debounce
  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const res = await axios.get('/api/v1/customers', { params: { search: customerSearch, limit: 5 } });
        setCustomerResults(res.data.data?.customers || []);
      } catch (e) {
        setCustomerResults([]);
      } finally {
        setSearchingCustomers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const selectCustomer = (c) => {
    setForm(f => ({
      ...f,
      customer_id: c.id,
      customer_name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      customer_phone: c.phone_raw || '',
      customer_email: c.email || '',
    }));
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await axios.post('/api/v1/preorders', {
        ...form,
        selling_price: parseFloat(form.selling_price),
        deposit_amount: parseFloat(form.deposit_amount),
        quantity: parseInt(form.quantity) || 1,
      });
      setShowForm(false);
      setForm({
        customer_id: null, customer_name: '', customer_phone: '', customer_email: '',
        item_description: '', quantity: 1, selling_price: '', deposit_amount: '100',
        deposit_payment_method: 'Cash', notes: '',
      });
      fetchPreorders();
      fetchSummary();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create preorder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Preorders</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium transition-colors"
        >
          {showForm ? 'Cancel' : 'New Preorder'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Active Preorders</div>
            <div className="text-2xl font-bold text-gray-900">{summary.total_active}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Deposits Collected</div>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.total_deposits_collected)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Balance Outstanding</div>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(summary.total_balance_outstanding)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Arriving This Week</div>
            <div className="text-2xl font-bold text-blue-600">{summary.arriving_this_week}</div>
          </div>
        </div>
      )}

      {/* New Preorder Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Preorder</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search existing customer..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {customerResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {customerResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <span className="font-medium">{c.first_name} {c.last_name}</span>
                        <span className="text-gray-500 ml-2">{c.phone_raw}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {form.customer_id && (
                <div className="mt-1 text-xs text-green-600">
                  Linked to customer #{form.customer_id}: {form.customer_name}
                  <button type="button" onClick={() => setForm(f => ({ ...f, customer_id: null }))} className="ml-2 text-gray-400 hover:text-gray-600">&times;</button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                <input
                  type="text" required
                  value={form.customer_name}
                  onChange={(e) => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="text" required
                  value={form.customer_phone}
                  onChange={(e) => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="0244000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => setForm(f => ({ ...f, customer_email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Description *</label>
              <textarea
                required rows={2}
                value={form.item_description}
                onChange={(e) => setForm(f => ({ ...f, item_description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="HP EliteBook 840 G6, i5, 16GB, 512GB SSD"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                <input
                  type="number" min="1"
                  value={form.quantity}
                  onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (GHS) *</label>
                <input
                  type="number" step="0.01" required
                  value={form.selling_price}
                  onChange={(e) => setForm(f => ({ ...f, selling_price: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deposit (GHS) *</label>
                <input
                  type="number" step="0.01" required
                  value={form.deposit_amount}
                  onChange={(e) => setForm(f => ({ ...f, deposit_amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={form.deposit_payment_method}
                  onChange={(e) => setForm(f => ({ ...f, deposit_payment_method: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Balance</label>
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-medium text-red-600">
                  {form.selling_price ? formatCurrency((parseFloat(form.selling_price) || 0) - (parseFloat(form.deposit_amount) || 0)) : '—'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium transition-colors"
              >
                {saving ? 'Creating...' : 'Create Preorder'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search by code, name, item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
          </div>
        ) : preorders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No preorders found</p>
            <p className="text-sm mt-1">Click "New Preorder" to create one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Tracking Code</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Customer</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Item</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Deposit</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Total</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Balance</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Est. Arrival</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {preorders.map((po) => (
                  <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <Link to={`/preorders/${po.id}`} className="text-violet-600 hover:text-violet-800 font-medium hover:underline">
                        {po.tracking_code}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{po.customer_name}</div>
                      <div className="text-xs text-gray-500">{po.customer_phone}</div>
                    </td>
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="truncate text-gray-700" title={po.item_description}>{po.item_description}</div>
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={po.status} /></td>
                    <td className="py-3 px-4 text-right text-green-600 font-medium">{formatCurrency(po.deposit_amount)}</td>
                    <td className="py-3 px-4 text-right font-medium">{formatCurrency(po.selling_price)}</td>
                    <td className="py-3 px-4 text-right text-red-600 font-medium">{formatCurrency(po.balance_due)}</td>
                    <td className="py-3 px-4 text-gray-500">{po.estimated_arrival_date || '—'}</td>
                    <td className="py-3 px-4">
                      <Link to={`/preorders/${po.id}`} className="text-sm text-gray-500 hover:text-gray-700">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
