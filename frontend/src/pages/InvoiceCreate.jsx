import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import debounce from 'lodash/debounce';

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

export default function InvoiceCreate() {
  const { id: editId } = useParams(); // Get invoice ID if editing
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!editId); // Start loading if editing
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isEditMode = !!editId;

  // Invoice state
  const [invoice, setInvoice] = useState(null);
  const [currency, setCurrency] = useState('GHS');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Customer state
  const [customer, setCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);

  // New customer form
  const [newCustomer, setNewCustomer] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    phone_raw: '',
    email: ''
  });

  // Inventory state
  const [items, setItems] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetResults, setAssetResults] = useState([]);
  const [searchingAssets, setSearchingAssets] = useState(false);

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price_amount), 0);
  const totalCost = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost_amount), 0);
  const totalProfit = subtotal - totalCost;

  // Load existing invoice data when editing
  useEffect(() => {
    if (editId) {
      loadInvoice(editId);
    }
  }, [editId]);

  const loadInvoice = async (invoiceId) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/v1/invoices/${invoiceId}`);
      const invoiceData = response.data.data.invoice;

      // Only allow editing invoices that are not fully paid or cancelled
      if (['PAID', 'CANCELLED'].includes(invoiceData.status)) {
        setError('Cannot edit paid or cancelled invoices');
        setLoading(false);
        return;
      }

      // Populate form with existing data
      setInvoice(invoiceData);
      setCurrency(invoiceData.currency || 'GHS');
      setInvoiceDate(invoiceData.invoice_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
      setNotes(invoiceData.notes || '');
      setCustomer(invoiceData.customer || null);
      setItems(invoiceData.items || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  // Debounced customer search
  const searchCustomers = useCallback(
    debounce(async (search) => {
      if (!search || search.length < 2) {
        setCustomerResults([]);
        return;
      }

      try {
        setSearchingCustomers(true);
        const response = await axios.get('/api/v1/customers', {
          params: { search, limit: 10 }
        });
        setCustomerResults(response.data.data.customers);
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        setSearchingCustomers(false);
      }
    }, 300),
    []
  );

  // Debounced asset search
  const searchAssets = useCallback(
    debounce(async (search) => {
      if (!search || search.length < 2) {
        setAssetResults([]);
        return;
      }

      try {
        setSearchingAssets(true);
        const params = { search, limit: 15 };
        // Exclude current invoice's reservations so the frontend can do its own
        // local subtraction without double-counting.
        if (invoice?.id) {
          params.excludeInvoiceId = invoice.id;
        }
        const response = await axios.get('/api/v1/invoices/available-assets', {
          params
        });
        // Count how many of each asset are already on the invoice
        const usedQtyByAssetId = {};
        items.forEach(i => {
          usedQtyByAssetId[i.asset_id] = (usedQtyByAssetId[i.asset_id] || 0) + i.quantity;
        });
        // Only hide assets whose remaining available qty is 0
        const available = response.data.data.assets.filter(a => {
          const totalAvailable = a.available_quantity != null ? Number(a.available_quantity) : ((a.quantity || 1));
          const usedOnInvoice = usedQtyByAssetId[a.id] || 0;
          return (totalAvailable - usedOnInvoice) > 0;
        });
        setAssetResults(available);
      } catch (err) {
        console.error('Asset search error:', err);
      } finally {
        setSearchingAssets(false);
      }
    }, 300),
    [items, invoice]
  );

  useEffect(() => {
    searchCustomers(customerSearch);
  }, [customerSearch]);

  useEffect(() => {
    searchAssets(assetSearch);
  }, [assetSearch]);

  const handleSelectCustomer = (cust) => {
    setCustomer(cust);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.first_name && !newCustomer.company_name) {
      setError('Please enter first name or company name');
      return;
    }

    try {
      setSaving(true);
      const response = await axios.post('/api/v1/customers', newCustomer);
      const created = response.data.data.customer;
      setCustomer(created);
      setShowCustomerForm(false);
      setNewCustomer({
        first_name: '',
        last_name: '',
        company_name: '',
        phone_raw: '',
        email: ''
      });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async (asset) => {
    // Create invoice if not exists
    let invoiceId = invoice?.id;

    if (!invoiceId) {
      try {
        setSaving(true);
        const response = await axios.post('/api/v1/invoices', {
          customer_id: customer?.id,
          invoice_date: invoiceDate,
          currency,
          notes
        });
        setInvoice(response.data.data.invoice);
        invoiceId = response.data.data.invoice.id;
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to create invoice');
        setSaving(false);
        return;
      }
    }

    // Add item to invoice
    try {
      const response = await axios.post(`/api/v1/invoices/${invoiceId}/items`, {
        asset_id: asset.id,
        unit_price: asset.price_amount || 0,
        quantity: 1
      });

      // Update local items list - either add new or update existing quantity
      const returnedItem = response.data.data.item;
      setItems(prev => {
        const existingIndex = prev.findIndex(i => i.asset_id === returnedItem.asset_id);
        if (existingIndex >= 0) {
          // Update existing item's quantity
          const updated = [...prev];
          updated[existingIndex] = returnedItem;
          return updated;
        }
        return [...prev, returnedItem];
      });
      setAssetSearch('');
      setAssetResults([]);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!invoice?.id) return;

    try {
      setSaving(true);
      await axios.delete(`/api/v1/invoices/${invoice.id}/items/${itemId}`);
      setItems(prev => prev.filter(i => i.id !== itemId));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to remove item');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateInvoice = async () => {
    if (!invoice?.id) return;

    try {
      setSaving(true);
      await axios.patch(`/api/v1/invoices/${invoice.id}`, {
        customer_id: customer?.id,
        invoice_date: invoiceDate,
        currency,
        notes
      });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (!invoice?.id) {
      setError('Please add items to the invoice first');
      return;
    }

    if (!customer) {
      setError('Please select a customer before saving');
      return;
    }

    if (items.length === 0) {
      setError('Please add at least one item to the invoice');
      return;
    }

    try {
      setSaving(true);
      // Update invoice with customer and notes
      await handleUpdateInvoice();
      // Navigate to invoice detail (invoice is always UNPAID)
      navigate(`/sales/invoices/${invoice.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  // Loading state for edit mode
  if (loading && isEditMode) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading invoice...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/sales/invoices" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
          &larr; Back to Invoices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {invoice ? `${isEditMode ? 'Edit' : ''} Invoice ${invoice.invoice_number}` : 'New Invoice'}
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Customer</h2>

            {customer ? (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">{customer.displayName || customer.first_name || customer.company_name}</div>
                  {customer.phone_e164 && <div className="text-sm text-gray-500">{customer.phone_e164}</div>}
                  {customer.email && <div className="text-sm text-gray-500">{customer.email}</div>}
                </div>
                <button
                  onClick={() => setCustomer(null)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name, phone, or email..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {searchingCustomers && (
                    <div className="absolute right-3 top-2.5 text-gray-400">Searching...</div>
                  )}

                  {/* Search Results */}
                  {customerResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {customerResults.map((cust) => (
                        <button
                          key={cust.id}
                          onClick={() => handleSelectCustomer(cust)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                        >
                          <div className="font-medium">{cust.displayName}</div>
                          <div className="text-sm text-gray-500">
                            {cust.phone_e164 || cust.email || 'No contact info'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Create New Customer */}
                {!showCustomerForm ? (
                  <button
                    onClick={() => setShowCustomerForm(true)}
                    className="text-sm text-primary-600 hover:text-primary-800"
                  >
                    + Create new customer
                  </button>
                ) : (
                  <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={newCustomer.first_name}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, first_name: e.target.value }))}
                        placeholder="First Name"
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                      <input
                        type="text"
                        value={newCustomer.last_name}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, last_name: e.target.value }))}
                        placeholder="Last Name"
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      value={newCustomer.company_name}
                      onChange={(e) => setNewCustomer(prev => ({ ...prev, company_name: e.target.value }))}
                      placeholder="Company Name (optional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <input
                      type="text"
                      value={newCustomer.phone_raw}
                      onChange={(e) => setNewCustomer(prev => ({ ...prev, phone_raw: e.target.value }))}
                      placeholder="Phone Number *"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <input
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Email (optional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateCustomer}
                        disabled={saving}
                        className="btn btn-primary text-sm"
                      >
                        {saving ? 'Creating...' : 'Create Customer'}
                      </button>
                      <button
                        onClick={() => setShowCustomerForm(false)}
                        className="btn btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add Items */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Items</h2>

            {/* Search Inventory */}
            <div className="relative mb-4">
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Search inventory by asset tag, serial, make/model..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {searchingAssets && (
                <div className="absolute right-3 top-2.5 text-gray-400">Searching...</div>
              )}

              {/* Search Results */}
              {assetResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto">
                  {assetResults.map((asset) => {
                    const totalAvailable = asset.available_quantity != null ? Number(asset.available_quantity) : (asset.quantity || 1);
                    const usedOnInvoice = items.filter(i => i.asset_id === asset.id).reduce((sum, i) => sum + i.quantity, 0);
                    const remainingForInvoice = totalAvailable - usedOnInvoice;
                    return (
                      <button
                        key={asset.id}
                        onClick={() => handleAddItem(asset)}
                        disabled={saving}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{asset.make} {asset.model}</div>
                            <div className="text-sm text-gray-500">
                              {asset.asset_tag}
                              {asset.serial_number && ` • S/N: ${asset.serial_number}`}
                            </div>
                            <div className="text-xs text-gray-400">
                              {asset.condition} • {asset.category}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-green-600">
                              {formatCurrency(asset.price_amount, asset.price_currency)}
                            </div>
                            <div className="text-xs text-gray-400">
                              Cost: {formatCurrency(asset.cost_amount, asset.cost_currency)}
                            </div>
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                              {remainingForInvoice} of {totalAvailable} available
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Items List */}
            {items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Search and add inventory items above
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {items.map((item) => (
                  <div key={item.id} className="py-3 flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium">{item.description}</div>
                      <div className="text-sm text-gray-500">
                        Qty: {item.quantity} × {formatCurrency(item.unit_price_amount, currency)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatCurrency(item.line_total_amount, currency)}</div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={saving}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Invoice Details */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Details</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="GHS">GHS (Ghana Cedi)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Internal notes..."
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Items</span>
                <span>{items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">{formatCurrency(subtotal, currency)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleSaveInvoice}
              disabled={saving || items.length === 0 || !customer}
              className="w-full btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save Invoice'}
            </button>
            <p className="text-xs text-gray-500 text-center">
              Invoice will be saved as Unpaid. Use "Receive Payment" to record payments.
            </p>
            <Link
              to="/sales/invoices"
              className="block w-full text-center py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
