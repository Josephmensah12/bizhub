import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import CustomerPickerModal from '../components/CustomerPickerModal';
import InventoryPickerModal from '../components/InventoryPickerModal';
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
 * Compute line-item discount amount
 */
function computeLineDiscount(preDiscountTotal, discountType, discountValue) {
  if (!discountType || discountType === 'none' || !discountValue) return 0;
  const dv = parseFloat(discountValue) || 0;
  if (discountType === 'percentage') {
    return Math.round(preDiscountTotal * (dv / 100) * 100) / 100;
  }
  if (discountType === 'fixed') {
    return Math.round(Math.min(dv, preDiscountTotal) * 100) / 100;
  }
  return 0;
}

/**
 * Inline Discount Editor for a line item
 */
function LineItemDiscountEditor({ item, currency, onUpdate, disabled }) {
  const discountType = item.discount_type || 'none';
  const discountValue = item.discount_value || 0;
  const preDiscountTotal = (item.quantity || 1) * (item.unit_price_amount || 0);
  const discountAmt = computeLineDiscount(preDiscountTotal, discountType, discountValue);
  const lineTotal = Math.max(0, preDiscountTotal - discountAmt);

  const handleTypeChange = (newType) => {
    onUpdate(item.id, {
      discount_type: newType,
      discount_value: newType === 'none' ? 0 : discountValue
    });
  };

  const handleValueChange = (val) => {
    onUpdate(item.id, { discount_value: val });
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={discountType}
        onChange={(e) => handleTypeChange(e.target.value)}
        disabled={disabled}
        className="px-1.5 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        style={{ width: '62px' }}
      >
        <option value="none">None</option>
        <option value="percentage">%</option>
        <option value="fixed">{currency}</option>
      </select>
      {discountType !== 'none' && (
        <input
          type="number"
          step="0.01"
          min="0"
          max={discountType === 'percentage' ? 100 : preDiscountTotal}
          value={discountValue || ''}
          onChange={(e) => handleValueChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          className="w-16 px-1.5 py-1 border border-gray-300 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      )}
      {discountAmt > 0 && (
        <span className="text-xs text-orange-600 whitespace-nowrap">
          -{formatCurrency(discountAmt, currency)}
        </span>
      )}
    </div>
  );
}

export default function InvoiceCreate() {
  const { id: editId } = useParams(); // Get invoice ID if editing
  const navigate = useNavigate();
  const { permissions } = usePermissions();
  const maxDiscountPercent = permissions?.maxDiscountPercent ?? null;
  const canSeeCost = permissions?.canSeeCost ?? false;
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
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
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
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);

  // Invoice-level discount state
  const [invoiceDiscountType, setInvoiceDiscountType] = useState('none');
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState('');

  // Calculate totals
  const preDiscountSubtotal = items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.unit_price_amount || 0)), 0);
  const lineDiscountsTotal = items.reduce((sum, item) => {
    const preDT = (item.quantity || 1) * (item.unit_price_amount || 0);
    return sum + computeLineDiscount(preDT, item.discount_type, item.discount_value);
  }, 0);
  const subtotalAfterLineDiscounts = Math.round((preDiscountSubtotal - lineDiscountsTotal) * 100) / 100;

  // Invoice-level discount
  const invoiceDiscountAmt = computeLineDiscount(subtotalAfterLineDiscounts, invoiceDiscountType, invoiceDiscountValue);
  const grandTotal = Math.max(0, Math.round((subtotalAfterLineDiscounts - invoiceDiscountAmt) * 100) / 100);
  const totalSavings = Math.round((lineDiscountsTotal + invoiceDiscountAmt) * 100) / 100;

  const totalCost = items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.unit_cost_amount || 0)), 0);

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
      setInvoiceDiscountType(invoiceData.discount_type || 'none');
      setInvoiceDiscountValue(invoiceData.discount_value || '');
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = (cust) => {
    setCustomer(cust);
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

  const ensureInvoiceExists = async () => {
    if (invoice?.id) return invoice.id;

    const response = await axios.post('/api/v1/invoices', {
      customer_id: customer?.id,
      invoice_date: invoiceDate,
      currency,
      notes
    });
    const created = response.data.data.invoice;
    setInvoice(created);
    return created.id;
  };

  const handleAddMultipleItems = async (assets) => {
    setSaving(true);
    setError(null);

    try {
      // Ensure invoice exists once, then reuse the ID for all items
      const invoiceId = await ensureInvoiceExists();

      for (const asset of assets) {
        try {
          const response = await axios.post(`/api/v1/invoices/${invoiceId}/items`, {
            asset_id: asset.id,
            unit_price: asset.price_amount || 0,
            quantity: asset._selectedQty || 1
          });

          const returnedItem = response.data.data.item;
          setItems(prev => {
            const existingIndex = prev.findIndex(i => i.asset_id === returnedItem.asset_id);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = returnedItem;
              return updated;
            }
            return [...prev, returnedItem];
          });
        } catch (err) {
          setError(err.response?.data?.error?.message || `Failed to add item: ${asset.make} ${asset.model}`);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async (asset) => {
    setSaving(true);
    setError(null);

    try {
      const invoiceId = await ensureInvoiceExists();

      const response = await axios.post(`/api/v1/invoices/${invoiceId}/items`, {
        asset_id: asset.id,
        unit_price: asset.price_amount || 0,
        quantity: asset._selectedQty || 1
      });

      const returnedItem = response.data.data.item;
      setItems(prev => {
        const existingIndex = prev.findIndex(i => i.asset_id === returnedItem.asset_id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = returnedItem;
          return updated;
        }
        return [...prev, returnedItem];
      });
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

  // Debounced server update for line-item discount
  const handleUpdateItemDiscount = useCallback(async (itemId, discountFields) => {
    // Update local state immediately for responsive UI
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, ...discountFields } : item
    ));

    // If invoice not saved yet, only update locally
    if (!invoice?.id) return;

    try {
      const response = await axios.patch(`/api/v1/invoices/${invoice.id}/items/${itemId}`, discountFields);
      const updatedItem = response.data.data.item;
      setItems(prev => prev.map(item =>
        item.id === updatedItem.id ? updatedItem : item
      ));
      // Merge updated invoice totals so revenue/margin reflect item discount changes
      if (response.data.data?.invoice) {
        setInvoice(prev => prev ? { ...prev, ...response.data.data.invoice } : response.data.data.invoice);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update item discount');
    }
  }, [invoice?.id]);

  // Update line-item quantity via PATCH
  const handleUpdateItemQuantity = useCallback(async (itemId, newQty) => {
    if (!invoice?.id || newQty < 1) return;

    // Capture old qty for revert
    let oldQty;
    setItems(prev => {
      const found = prev.find(i => i.id === itemId);
      oldQty = found?.quantity;
      return prev.map(item =>
        item.id === itemId ? { ...item, quantity: newQty } : item
      );
    });

    try {
      const response = await axios.patch(`/api/v1/invoices/${invoice.id}/items/${itemId}`, { quantity: newQty });
      const updatedItem = response.data.data.item;
      setItems(prev => prev.map(item =>
        item.id === updatedItem.id ? updatedItem : item
      ));
      if (response.data.data?.invoice) {
        setInvoice(prev => prev ? { ...prev, ...response.data.data.invoice } : response.data.data.invoice);
      }
      setError(null);
    } catch (err) {
      // Revert optimistic update on failure
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, quantity: oldQty } : item
      ));
      setError(err.response?.data?.error?.message || 'Failed to update quantity');
    }
  }, [invoice?.id]);

  // Save invoice-level discount to server (accepts overrides for immediate saves before state updates)
  const handleSaveInvoiceDiscount = useCallback(async (typeOverride, valueOverride) => {
    if (!invoice?.id) return;

    const type = typeOverride ?? invoiceDiscountType;
    const value = valueOverride ?? invoiceDiscountValue;

    try {
      const res = await axios.patch(`/api/v1/invoices/${invoice.id}/discount`, {
        discount_type: type,
        discount_value: parseFloat(value) || 0
      });
      // Merge updated invoice totals so revenue/margin reflect the discount
      if (res.data.data?.invoice) {
        setInvoice(prev => prev ? { ...prev, ...res.data.data.invoice } : res.data.data.invoice);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update invoice discount');
    }
  }, [invoice?.id, invoiceDiscountType, invoiceDiscountValue]);

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

      // Also save invoice-level discount
      const discRes = await axios.patch(`/api/v1/invoices/${invoice.id}/discount`, {
        discount_type: invoiceDiscountType,
        discount_value: parseFloat(invoiceDiscountValue) || 0
      });
      // Merge updated invoice totals so revenue/margin are current
      if (discRes.data.data?.invoice) {
        setInvoice(prev => prev ? { ...prev, ...discRes.data.data.invoice } : discRes.data.data.invoice);
      }

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
                <button
                  onClick={() => setShowCustomerPicker(true)}
                  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                >
                  + Add Customer
                </button>

                {/* Inline Create New Customer form */}
                {showCustomerForm && (
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

            <CustomerPickerModal
              open={showCustomerPicker}
              onClose={() => setShowCustomerPicker(false)}
              onSelect={handleSelectCustomer}
              onCreateNew={() => setShowCustomerForm(true)}
            />
          </div>

          {/* Add Items */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Items</h2>

            {/* Add Inventory Button */}
            <div className="mb-4">
              <button
                onClick={() => setShowInventoryPicker(true)}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              >
                + Add Inventory Items
              </button>
            </div>

            <InventoryPickerModal
              open={showInventoryPicker}
              onClose={() => setShowInventoryPicker(false)}
              onAddItems={handleAddMultipleItems}
              invoiceId={invoice?.id}
              existingItems={items}
            />

            {/* Items List */}
            {items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Search and add inventory items above
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {items.map((item) => {
                  const preDiscount = (item.quantity || 1) * (item.unit_price_amount || 0);
                  const discAmt = computeLineDiscount(preDiscount, item.discount_type, item.discount_value);
                  const lineTotal = Math.max(0, preDiscount - discAmt);
                  const hasDiscount = discAmt > 0;

                  return (
                    <div key={item.id} className="py-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium">{item.description}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            {item.quantity > 1 ? (
                              <>
                                <span>Qty:</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQuantity(item.id, item.quantity - 1)}
                                  disabled={saving}
                                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-sm font-medium disabled:opacity-50"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center font-medium text-gray-700">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQuantity(item.id, item.quantity + 1)}
                                  disabled={saving}
                                  className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-sm font-medium disabled:opacity-50"
                                >
                                  +
                                </button>
                                <span>× {formatCurrency(item.unit_price_amount, currency)}</span>
                              </>
                            ) : (
                              <>Qty: {item.quantity} × {formatCurrency(item.unit_price_amount, currency)}</>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {hasDiscount ? (
                            <>
                              <div className="text-sm text-gray-400 line-through">{formatCurrency(preDiscount, currency)}</div>
                              <div className="font-medium">{formatCurrency(lineTotal, currency)}</div>
                            </>
                          ) : (
                            <div className="font-medium">{formatCurrency(preDiscount, currency)}</div>
                          )}
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={saving}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {/* Discount row */}
                      <div className="mt-1.5">
                        <LineItemDiscountEditor
                          item={item}
                          currency={currency}
                          onUpdate={handleUpdateItemDiscount}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  );
                })}
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

          {/* Invoice-Level Discount */}
          {items.length > 0 && (
            <div className="card border-orange-200">
              <h2 className="text-lg font-semibold mb-3">Invoice Discount</h2>
              <div className="flex items-center gap-2">
                <select
                  value={invoiceDiscountType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setInvoiceDiscountType(newType);
                    if (newType === 'none') {
                      setInvoiceDiscountValue('');
                      handleSaveInvoiceDiscount('none', 0);
                    }
                  }}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  <option value="none">None</option>
                  <option value="percentage">%</option>
                  <option value="fixed">{currency}</option>
                </select>
                {invoiceDiscountType !== 'none' && (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={invoiceDiscountType === 'percentage' ? 100 : subtotalAfterLineDiscounts}
                    value={invoiceDiscountValue}
                    onChange={(e) => setInvoiceDiscountValue(e.target.value)}
                    onBlur={handleSaveInvoiceDiscount}
                    placeholder="0"
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                )}
              </div>
              {invoiceDiscountAmt > 0 && (
                <div className="mt-2 text-sm text-orange-600 font-medium">
                  -{formatCurrency(invoiceDiscountAmt, currency)} off invoice
                </div>
              )}
              {maxDiscountPercent !== null && (
                <div className="mt-2 text-xs text-gray-500">
                  Your max discount: {maxDiscountPercent}%
                </div>
              )}
            </div>
          )}

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
                <span className="font-medium">{formatCurrency(preDiscountSubtotal, currency)}</span>
              </div>

              {lineDiscountsTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-orange-600">Line discounts</span>
                  <span className="text-orange-600">-{formatCurrency(lineDiscountsTotal, currency)}</span>
                </div>
              )}

              {invoiceDiscountAmt > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-orange-600">
                    Invoice discount
                    {invoiceDiscountType === 'percentage' && ` (${invoiceDiscountValue}%)`}
                  </span>
                  <span className="text-orange-600">-{formatCurrency(invoiceDiscountAmt, currency)}</span>
                </div>
              )}

              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">{formatCurrency(grandTotal, currency)}</span>
              </div>

              {totalSavings > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
                  <span className="text-green-700 text-sm font-medium">
                    You save {formatCurrency(totalSavings, currency)}
                  </span>
                </div>
              )}
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
