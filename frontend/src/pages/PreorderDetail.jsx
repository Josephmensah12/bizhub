import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const STATUSES = ['Deposit Paid', 'Purchased', 'Shipped', 'Arrived', 'Completed', 'Cancelled'];
const SHIPPING_METHODS = [{ value: '', label: 'Select...' }, { value: 'air', label: 'Air' }, { value: 'sea', label: 'Sea' }, { value: 'other', label: 'Other' }];
const PAYMENT_METHODS = ['Cash', 'MoMo', 'Bank Transfer', 'Card', 'Other'];
const STATUS_STEPS = ['Deposit Paid', 'Purchased', 'Shipped', 'Arrived', 'Completed'];

function formatCurrency(amount, currency = 'GHS') {
  if (amount == null || isNaN(amount)) return '—';
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default function PreorderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [preorder, setPreorder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Status update
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Convert
  const [converting, setConverting] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await axios.get(`/api/v1/preorders/${id}/notifications`);
      setNotifications(res.data.data.notifications || []);
    } catch (_) {
      // silent fail
    } finally {
      setLoadingNotifications(false);
    }
  };

  const fetchPreorder = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/preorders/${id}`);
      setPreorder(res.data.data);
      setEditForm(res.data.data);
    } catch (err) {
      setError('Preorder not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPreorder(); fetchNotifications(); }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axios.put(`/api/v1/preorders/${id}`, editForm);
      setPreorder(res.data.data);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    setUpdatingStatus(true);
    setError(null);
    try {
      await axios.put(`/api/v1/preorders/${id}/status`, {
        status: newStatus,
        status_message: statusMessage || null
      });
      setShowStatusModal(false);
      setNewStatus('');
      setStatusMessage('');
      fetchPreorder();
      setTimeout(fetchNotifications, 1500);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConvert = async () => {
    if (!window.confirm('Convert this preorder to an invoice? The deposit will be recorded as a payment.')) return;
    setConverting(true);
    setError(null);
    try {
      const res = await axios.post(`/api/v1/preorders/${id}/convert-to-invoice`);
      navigate(`/sales/invoices/${res.data.data.invoice_id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to convert');
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this preorder? This action cannot be undone.')) return;
    try {
      await axios.delete(`/api/v1/preorders/${id}`);
      navigate('/preorders');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (!preorder) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">{error || 'Preorder not found'}</p>
        <Link to="/preorders" className="text-violet-600 hover:underline mt-2 inline-block">Back to Preorders</Link>
      </div>
    );
  }

  const currentStepIndex = STATUS_STEPS.indexOf(preorder.status);
  const dateMap = {
    'Deposit Paid': preorder.created_at,
    'Purchased': preorder.purchase_date,
    'Shipped': preorder.shipped_date,
    'Arrived': preorder.actual_arrival_date,
    'Completed': preorder.status === 'Completed' ? preorder.updated_at : null
  };

  const nextStatus = currentStepIndex >= 0 && currentStepIndex < STATUS_STEPS.length - 1
    ? STATUS_STEPS[currentStepIndex + 1]
    : null;

  const Field = ({ label, value, editKey, type = 'text', options, textarea }) => {
    if (!editing) {
      return (
        <div>
          <div className="text-xs text-gray-500 mb-0.5">{label}</div>
          <div className="text-sm text-gray-900">{value || '—'}</div>
        </div>
      );
    }
    if (options) {
      return (
        <div>
          <div className="text-xs text-gray-500 mb-0.5">{label}</div>
          <select
            value={editForm[editKey] || ''}
            onChange={(e) => setEditForm(f => ({ ...f, [editKey]: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {options.map(o => typeof o === 'string'
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
            )}
          </select>
        </div>
      );
    }
    if (textarea) {
      return (
        <div>
          <div className="text-xs text-gray-500 mb-0.5">{label}</div>
          <textarea
            value={editForm[editKey] || ''}
            onChange={(e) => setEditForm(f => ({ ...f, [editKey]: e.target.value }))}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            rows={2}
          />
        </div>
      );
    }
    return (
      <div>
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <input
          type={type}
          value={editForm[editKey] ?? ''}
          onChange={(e) => setEditForm(f => ({ ...f, [editKey]: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/preorders" className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              {preorder.tracking_code}
              <StatusBadge status={preorder.status} />
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{preorder.customer_name} &middot; {preorder.customer_phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setEditForm(preorder); }} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Edit</button>
              {nextStatus && preorder.status !== 'Cancelled' && preorder.status !== 'Completed' && (
                <button
                  onClick={() => { setNewStatus(nextStatus); setShowStatusModal(true); }}
                  className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                >
                  Mark as {nextStatus}
                </button>
              )}
              {preorder.status === 'Arrived' && !preorder.invoice_id && (
                <button
                  onClick={handleConvert}
                  disabled={converting}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {converting ? 'Converting...' : 'Convert to Invoice'}
                </button>
              )}
              {['Deposit Paid', 'Cancelled'].includes(preorder.status) && (
                <button onClick={handleDelete} className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Progress Stepper */}
      {preorder.status !== 'Cancelled' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => {
              const isCompleted = i <= currentStepIndex;
              const isCurrent = i === currentStepIndex;
              const stepDate = dateMap[step];

              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                      isCompleted
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                    } ${isCurrent ? 'ring-4 ring-violet-100' : ''}`}>
                      {isCompleted ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <div className={`mt-2 text-xs font-medium ${isCurrent ? 'text-violet-700' : isCompleted ? 'text-gray-700' : 'text-gray-400'}`}>
                      {step === 'Completed' ? 'Ready' : step}
                    </div>
                    {stepDate && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(stepDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </div>
                    )}
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${i < currentStepIndex ? 'bg-violet-600' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
          {preorder.status_message && (
            <div className="mt-4 text-sm text-gray-600 bg-violet-50 rounded-lg px-4 py-2">
              {preorder.status_message}
            </div>
          )}
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Customer Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Customer</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={preorder.customer_name} editKey="customer_name" />
            <Field label="Phone" value={preorder.customer_phone} editKey="customer_phone" />
            <Field label="Email" value={preorder.customer_email} editKey="customer_email" />
            {preorder.customer_id && (
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Linked Customer</div>
                <div className="text-sm text-violet-600">#{preorder.customer_id}</div>
              </div>
            )}
          </div>
        </div>

        {/* Item */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Item</h3>
          <div className="space-y-3">
            <Field label="Description" value={preorder.item_description} editKey="item_description" textarea />
            <Field label="Quantity" value={preorder.quantity} editKey="quantity" type="number" />
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Pricing</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Selling Price (GHS)" value={formatCurrency(preorder.selling_price)} editKey="selling_price" type="number" />
            <Field label="Deposit (GHS)" value={formatCurrency(preorder.deposit_amount)} editKey="deposit_amount" type="number" />
            <Field label="Payment Method" value={preorder.deposit_payment_method} editKey="deposit_payment_method" options={PAYMENT_METHODS} />
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Balance Due</div>
              <div className="text-sm font-bold text-red-600">{formatCurrency(preorder.balance_due)}</div>
            </div>
          </div>
        </div>

        {/* Shipping */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Shipping</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method" value={preorder.shipping_method} editKey="shipping_method" options={SHIPPING_METHODS} />
            <Field label="Tracking Number" value={preorder.tracking_number} editKey="tracking_number" />
            <Field label="Shipped Date" value={preorder.shipped_date} editKey="shipped_date" type="date" />
            <Field label="Est. Arrival" value={preorder.estimated_arrival_date} editKey="estimated_arrival_date" type="date" />
            <Field label="Actual Arrival" value={preorder.actual_arrival_date} editKey="actual_arrival_date" type="date" />
          </div>
        </div>

        {/* Internal / Sourcing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Sourcing (Internal)</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Cost" value={preorder.purchase_cost_amount ? formatCurrency(preorder.purchase_cost_amount, preorder.purchase_cost_currency) : null} editKey="purchase_cost_amount" type="number" />
            <Field label="Currency" value={preorder.purchase_cost_currency} editKey="purchase_cost_currency" />
            <Field label="Purchase Date" value={preorder.purchase_date} editKey="purchase_date" type="date" />
            <Field label="Supplier Order #" value={preorder.supplier_order_number} editKey="supplier_order_number" />
            <div className="col-span-2">
              <Field label="Source URL" value={preorder.source_url} editKey="source_url" />
            </div>
            <div className="col-span-2">
              <Field label="Source Notes" value={preorder.source_notes} editKey="source_notes" textarea />
            </div>
          </div>
        </div>

        {/* Notes & Audit */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes & Audit</h3>
          <div className="space-y-3">
            <Field label="Notes" value={preorder.notes} editKey="notes" textarea />
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Created</div>
              <div className="text-sm text-gray-600">
                {new Date(preorder.created_at).toLocaleString()} {preorder.creator && `by ${preorder.creator.full_name}`}
              </div>
            </div>
            {preorder.updater && (
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Last Updated</div>
                <div className="text-sm text-gray-600">
                  {new Date(preorder.updated_at).toLocaleString()} by {preorder.updater.full_name}
                </div>
              </div>
            )}
            {preorder.invoice && (
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Linked Invoice</div>
                <Link to={`/sales/invoices/${preorder.invoice.id}`} className="text-sm text-violet-600 hover:underline">
                  {preorder.invoice.invoice_number} ({preorder.invoice.status})
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Notifications</h3>
          <div className="space-y-2">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="text-lg mt-0.5">
                  {n.channel === 'email' ? '\u{1F4E7}' : n.channel === 'sms' ? '\u{1F4F1}' : '\u{1F4AC}'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{n.subject || 'Notification'}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${
                      n.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {n.status === 'sent' ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    To: {n.recipient} &middot; {new Date(n.created_at).toLocaleString()}
                  </div>
                  {n.status === 'failed' && n.error_message && (
                    <div className="text-xs text-red-500 mt-0.5">{n.error_message}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowStatusModal(false)}>
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Status</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {STATUSES.filter(s => s !== 'Completed').map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status Message (shown to customer)</label>
                <input
                  type="text"
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  placeholder="e.g. Your item is on its way to Ghana"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowStatusModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button
                  onClick={handleStatusUpdate}
                  disabled={updatingStatus}
                  className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  {updatingStatus ? 'Updating...' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
