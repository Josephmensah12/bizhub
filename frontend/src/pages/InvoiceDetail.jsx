import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import ReturnModal from '../components/ReturnModal';
import StoreCreditSelector from '../components/StoreCreditSelector';

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
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format datetime for display
 */
function formatDateTime(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {labels[status] || status}
    </span>
  );
}

/**
 * Payment methods available
 */
const PAYMENT_METHODS = ['Cash', 'MoMo', 'Card', 'ACH', 'Other'];

/**
 * Transaction Modal Component (for both payments and refunds)
 */
function TransactionModal({ invoice, transactionType = 'PAYMENT', onClose, onTransactionRecorded }) {
  const isRefund = transactionType === 'REFUND';
  const maxAmount = isRefund ? invoice.amount_paid : invoice.balance_due;
  const [amount, setAmount] = useState(maxAmount?.toString() || '');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentMethodOtherText, setPaymentMethodOtherText] = useState('');
  const [comment, setComment] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!comment.trim()) {
      setError(`${isRefund ? 'Refund' : 'Payment'} comment is required`);
      return;
    }

    if (paymentMethod === 'Other' && !paymentMethodOtherText.trim()) {
      setError('Please specify the payment method when selecting "Other"');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(`/api/v1/invoices/${invoice.id}/transactions`, {
        transaction_type: transactionType,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        payment_method_other_text: paymentMethod === 'Other' ? paymentMethodOtherText.trim() : null,
        comment: comment.trim(),
        payment_date: paymentDate
      });
      onTransactionRecorded(response.data.data.invoice);
    } catch (err) {
      setError(err.response?.data?.error?.message || `Failed to record ${isRefund ? 'refund' : 'payment'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className={`px-6 py-4 border-b ${isRefund ? 'bg-orange-50' : ''}`}>
          <h2 className="text-lg font-semibold">{isRefund ? 'Return/Refund' : 'Receive Payment'}</h2>
          <p className="text-sm text-gray-500">
            Invoice {invoice.invoice_number} • {isRefund ? 'Paid' : 'Balance'}: {formatCurrency(maxAmount, invoice.currency)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">{invoice.currency}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-14 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            {isRefund && (
              <p className="mt-1 text-xs text-orange-600">
                Max refund amount: {formatCurrency(maxAmount, invoice.currency)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isRefund ? 'Refund' : 'Payment'} Method <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>

          {paymentMethod === 'Other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specify Method <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={paymentMethodOtherText}
                onChange={(e) => setPaymentMethodOtherText(e.target.value)}
                placeholder="e.g., Bitcoin, PayPal, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comment <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={isRefund ? 'e.g., Customer returned item, refund via MoMo' : 'e.g., Momo to MTN 024XXXXXXX, Cash at Accra shop'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              {isRefund ? 'Describe reason and how refund was given' : 'Describe where/how payment was received (account number, location, etc.)'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isRefund ? 'Refund' : 'Payment'} Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 btn ${isRefund ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'btn-primary'}`}
            >
              {loading ? 'Recording...' : isRefund ? 'Return/Refund' : 'Record Payment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Legacy PaymentModal wrapper for backwards compatibility
 */
function PaymentModal({ invoice, onClose, onPaymentReceived }) {
  return (
    <TransactionModal
      invoice={invoice}
      transactionType="PAYMENT"
      onClose={onClose}
      onTransactionRecorded={onPaymentReceived}
    />
  );
}

/**
 * Void Transaction Modal
 */
function VoidModal({ transaction, invoice, onClose, onVoided }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const typeLabel = transaction.transaction_type === 'PAYMENT' ? 'Payment' : 'Refund';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!reason.trim()) {
      setError('A reason is required when voiding a transaction');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(`/api/v1/invoices/${invoice.id}/transactions/${transaction.id}/void`, {
        reason: reason.trim()
      });
      onVoided(response.data.data.invoice);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to void transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b bg-red-50">
          <h2 className="text-lg font-semibold text-red-800">Void {typeLabel}</h2>
          <p className="text-sm text-red-600">
            {formatCurrency(transaction.amount, transaction.currency)} via {transaction.payment_method}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>Warning:</strong> This action cannot be undone. The {typeLabel.toLowerCase()} will be marked as voided and excluded from all calculations.
          </div>

          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for voiding <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Recorded in error, duplicate entry, customer dispute"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? 'Voiding...' : `Void ${typeLabel}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Cancel Invoice Modal (Admin only)
 */
function CancelInvoiceModal({ invoice, onClose, onCancelled }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(`/api/v1/invoices/${invoice.id}/cancel`, {
        reason: reason.trim() || null
      });
      onCancelled(response.data.data.invoice, response.data.data.releasedItemsCount);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to cancel invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b bg-red-50">
          <h2 className="text-lg font-semibold text-red-800">Cancel Invoice</h2>
          <p className="text-sm text-red-600">
            Invoice {invoice.invoice_number}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>Warning:</strong> Cancelling will release all items back into inventory and lock this invoice from further changes. This action cannot be undone.
          </div>

          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cancellation Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer changed mind, duplicate invoice, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
            />
          </div>

          <div className="text-sm text-gray-600">
            <strong>Items to be released:</strong> {invoice.items?.length || 0} item(s) will be returned to inventory.
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? 'Cancelling...' : 'Cancel Invoice'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 btn btn-secondary"
            >
              Keep Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Void Item Modal (for voiding line items on paid invoices)
 */
function VoidItemModal({ item, invoice, onClose, onVoided }) {
  const [reason, setReason] = useState('');
  const [voidQuantity, setVoidQuantity] = useState(item.quantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!reason.trim()) {
      setError('A reason is required when voiding an item');
      return;
    }

    if (voidQuantity <= 0 || voidQuantity > item.quantity) {
      setError(`Quantity must be between 1 and ${item.quantity}`);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await axios.post(`/api/v1/invoices/${invoice.id}/items/${item.id}/void`, {
        reason: reason.trim(),
        quantity: voidQuantity
      });
      onVoided(response.data.data.invoice);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to void item');
    } finally {
      setLoading(false);
    }
  };

  const voidTotal = (item.unit_price_amount || 0) * voidQuantity;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b bg-red-50">
          <h2 className="text-lg font-semibold text-red-800">Void Item</h2>
          <p className="text-sm text-red-600">
            {item.description}
          </p>
          <p className="text-sm text-red-600">
            Qty on invoice: {item.quantity} &bull; Line total: {formatCurrency(item.line_total_amount, invoice.currency)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>Warning:</strong> This will void {voidQuantity === item.quantity ? 'the entire item' : `${voidQuantity} of ${item.quantity} units`} and restore stock. The invoice balance will be recalculated, potentially making it overpaid (negative balance).
          </div>

          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          {item.quantity > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity to void
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={item.quantity}
                  value={voidQuantity}
                  onChange={(e) => setVoidQuantity(Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <span className="text-sm text-gray-500">
                  of {item.quantity} &bull; Void amount: {formatCurrency(voidTotal, invoice.currency)}
                </span>
              </div>
              {voidQuantity < item.quantity && (
                <p className="text-xs text-gray-500 mt-1">
                  {item.quantity - voidQuantity} unit(s) will remain on the invoice
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for voiding <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Item added in error, customer dispute, pricing correction"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? 'Voiding...' : `Void ${voidQuantity === item.quantity ? 'Item' : voidQuantity + ' Unit(s)'}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showVoidedTransactions, setShowVoidedTransactions] = useState(false);

  // Void item state
  const [showVoidItemModal, setShowVoidItemModal] = useState(false);
  const [selectedVoidItem, setSelectedVoidItem] = useState(null);
  const [showVoidedItems, setShowVoidedItems] = useState(false);

  // Returns state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returns, setReturns] = useState([]);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Inline price editing
  const [editingPriceItemId, setEditingPriceItemId] = useState(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

  // Show/hide profit details
  const [showProfit, setShowProfit] = useState(false);

  // PDF and WhatsApp state
  const [pdfLoading, setPdfLoading] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  // Fetch returns when invoice loads
  const fetchReturns = async () => {
    try {
      const response = await axios.get(`/api/v1/invoices/${id}/returns`);
      setReturns(response.data.data.returns || []);
    } catch (err) {
      console.error('Failed to fetch returns:', err);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/v1/invoices/${id}`);
      setInvoice(response.data.data.invoice);
      setError(null);
      fetchReturns();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnProcessed = (updatedInvoice) => {
    setInvoice(updatedInvoice);
    setShowReturnModal(false);
    fetchReturns();
  };

  const handleCreditApplied = (updatedInvoice, amountApplied) => {
    setInvoice(updatedInvoice);
  };

  const handleCancelled = (updatedInvoice, releasedItemsCount) => {
    setInvoice(updatedInvoice);
    setShowCancelModal(false);
    alert(`Invoice cancelled successfully. ${releasedItemsCount} item(s) released back to inventory.`);
  };

  const handleRemoveItem = async (itemId) => {
    if (!window.confirm('Remove this item from the invoice?')) return;

    try {
      setActionLoading(true);
      const response = await axios.delete(`/api/v1/invoices/${id}/items/${itemId}`);
      // Reload full invoice to get updated totals and items
      fetchInvoice();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to remove item');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEditPrice = (item) => {
    setEditingPriceItemId(item.id);
    setEditingPriceValue(item.unit_price_amount?.toString() || '0');
  };

  const handleSavePrice = async (itemId) => {
    const newPrice = parseFloat(editingPriceValue);
    if (isNaN(newPrice) || newPrice < 0) {
      alert('Please enter a valid price');
      return;
    }

    try {
      setActionLoading(true);
      await axios.patch(`/api/v1/invoices/${id}/items/${itemId}`, {
        unit_price: newPrice
      });
      setEditingPriceItemId(null);
      fetchInvoice();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to update price');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelEditPrice = () => {
    setEditingPriceItemId(null);
    setEditingPriceValue('');
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return;
    }

    try {
      setActionLoading(true);
      await axios.delete(`/api/v1/invoices/${id}`);
      navigate('/sales/invoices');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete invoice');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePaymentReceived = (updatedInvoice) => {
    setInvoice(updatedInvoice);
    setShowPaymentModal(false);
  };

  const handleVoidItem = (item) => {
    setSelectedVoidItem(item);
    setShowVoidItemModal(true);
  };

  const handleItemVoided = (updatedInvoice) => {
    setInvoice(updatedInvoice);
    setShowVoidItemModal(false);
    setSelectedVoidItem(null);
  };

  const handleVoidTransaction = (transaction) => {
    setSelectedTransaction(transaction);
    setShowVoidModal(true);
  };

  const handleVoided = (updatedInvoice) => {
    setInvoice(updatedInvoice);
    setShowVoidModal(false);
    setSelectedTransaction(null);
  };

  const handleDownloadPdf = async () => {
    try {
      setPdfLoading(true);
      const response = await axios.get(`/api/v1/invoices/${id}/pdf?download=true`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Invoice-${invoice.invoice_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!invoice.customer?.whatsapp_e164) {
      alert('Customer does not have a WhatsApp number');
      return;
    }

    try {
      setWhatsappLoading(true);
      const baseUrl = window.location.origin;
      const response = await axios.get(`/api/v1/invoices/${id}/whatsapp-link?baseUrl=${encodeURIComponent(baseUrl)}`);

      if (response.data.success) {
        // Open WhatsApp link
        window.open(response.data.data.whatsappLink, '_blank');
      }
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to generate WhatsApp link');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleCopyInvoiceLink = async () => {
    try {
      setPdfLoading(true);
      const response = await axios.get(`/api/v1/invoices/${id}/pdf`);

      if (response.data.success) {
        const pdfUrl = `${window.location.origin}${response.data.data.pdfUrl}`;
        await navigator.clipboard.writeText(pdfUrl);
        alert('Invoice link copied to clipboard');
      }
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to generate invoice link');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded">
        {error || 'Invoice not found'}
      </div>
    );
  }

  const isAdmin = user?.role === 'Admin';
  const pCanEditInvoices = permissions?.canEditInvoices ?? false;
  const pCanVoidInvoices = permissions?.canVoidInvoices ?? false;
  const pCanSeeCost = permissions?.canSeeCost ?? false;
  const pCanProcessReturns = permissions?.canProcessReturns ?? false;

  const canEdit = pCanEditInvoices && invoice.status === 'UNPAID';
  const canReceivePayment = ['UNPAID', 'PARTIALLY_PAID'].includes(invoice.status);
  const canReturn = pCanProcessReturns && ['PARTIALLY_PAID', 'PAID'].includes(invoice.status) && invoice.items?.length > 0;
  const canRemoveItems = pCanEditInvoices && invoice.status === 'UNPAID';

  // Cancel logic: Admin/Manager, invoice not cancelled, net paid must be 0
  const netPaid = parseFloat(invoice.amount_paid) || 0;
  const canCancelInvoice = pCanEditInvoices && invoice.status !== 'CANCELLED' && netPaid === 0;
  const hasPaymentsToRefund = invoice.status !== 'CANCELLED' && netPaid > 0;

  // Delete logic: Admin only, must be UNPAID or CANCELLED
  const canDelete = isAdmin && (invoice.status === 'UNPAID' || invoice.status === 'CANCELLED');

  // Void item permission: Admin/Manager + PAID invoice
  const canVoidItems = pCanVoidInvoices && invoice.status === 'PAID';

  // Filter items for display
  const voidedItemCount = (invoice.items || []).filter(item => item.voided_at).length;
  const displayItems = showVoidedItems
    ? (invoice.items || [])
    : (invoice.items || []).filter(item => !item.voided_at);

  // Filter transactions for display
  const displayTransactions = showVoidedTransactions
    ? (invoice.payments || [])
    : (invoice.payments || []).filter(tx => !tx.voided_at);
  const voidedCount = (invoice.payments || []).filter(tx => tx.voided_at).length;

  return (
    <div>
      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          invoice={invoice}
          onClose={() => setShowPaymentModal(false)}
          onPaymentReceived={handlePaymentReceived}
        />
      )}

      {/* Void Modal */}
      {showVoidModal && selectedTransaction && (
        <VoidModal
          transaction={selectedTransaction}
          invoice={invoice}
          onClose={() => { setShowVoidModal(false); setSelectedTransaction(null); }}
          onVoided={handleVoided}
        />
      )}

      {/* Return Modal */}
      {showReturnModal && (
        <ReturnModal
          invoice={invoice}
          onClose={() => setShowReturnModal(false)}
          onReturnProcessed={handleReturnProcessed}
        />
      )}

      {/* Cancel Invoice Modal */}
      {showCancelModal && (
        <CancelInvoiceModal
          invoice={invoice}
          onClose={() => setShowCancelModal(false)}
          onCancelled={handleCancelled}
        />
      )}

      {/* Void Item Modal */}
      {showVoidItemModal && selectedVoidItem && (
        <VoidItemModal
          item={selectedVoidItem}
          invoice={invoice}
          onClose={() => { setShowVoidItemModal(false); setSelectedVoidItem(null); }}
          onVoided={handleItemVoided}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link to="/sales/invoices" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
            &larr; Back to Invoices
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-gray-500 mt-1">{formatDate(invoice.invoice_date)}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {canReceivePayment && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="btn btn-primary"
            >
              Receive Payment
            </button>
          )}

          {canReturn && (
            <button
              onClick={() => setShowReturnModal(true)}
              className="btn bg-orange-600 hover:bg-orange-700 text-white"
            >
              Refund/Return
            </button>
          )}

          {/* PDF Download */}
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="btn btn-secondary flex items-center gap-2"
            title="Download PDF"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {pdfLoading ? 'Generating...' : 'PDF'}
          </button>

          {/* WhatsApp Share */}
          <button
            onClick={handleSendWhatsApp}
            disabled={whatsappLoading || !invoice.customer?.whatsapp_e164}
            className="btn btn-secondary flex items-center gap-2"
            title={invoice.customer?.whatsapp_e164 ? 'Send via WhatsApp' : 'Customer has no WhatsApp'}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            {whatsappLoading ? 'Loading...' : 'WhatsApp'}
          </button>

          {/* Copy Link */}
          <button
            onClick={handleCopyInvoiceLink}
            disabled={pdfLoading}
            className="btn btn-secondary flex items-center gap-2"
            title="Copy invoice link"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Link
          </button>

          {canEdit && (
            <Link
              to={`/sales/invoices/${id}/edit`}
              className="btn btn-secondary"
            >
              Edit
            </Link>
          )}

          {/* Admin-only Cancel Invoice */}
          {isAdmin && invoice.status !== 'CANCELLED' && (
            <>
              {hasPaymentsToRefund ? (
                <button
                  disabled
                  className="btn btn-secondary opacity-50 cursor-not-allowed"
                  title={`Refund all payments before cancelling. Net paid: ${formatCurrency(netPaid, invoice.currency)}`}
                >
                  Cancel Invoice
                </button>
              ) : (
                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionLoading}
                  className="btn btn-danger"
                >
                  {actionLoading ? 'Processing...' : 'Cancel Invoice'}
                </button>
              )}
            </>
          )}

          {/* Admin-only Delete */}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="btn btn-secondary text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Admin warning for invoices with payments */}
      {isAdmin && hasPaymentsToRefund && invoice.status !== 'CANCELLED' && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-yellow-800">Cannot cancel - payments recorded</p>
              <p className="text-sm text-yellow-700 mt-1">
                This invoice has {formatCurrency(netPaid, invoice.currency)} in net payments.
                You must refund all payments (so net paid = 0) before cancelling this invoice.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation info */}
      {invoice.status === 'CANCELLED' && invoice.cancelled_at && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <div>
              <p className="font-medium text-red-800">Invoice Cancelled</p>
              <p className="text-sm text-red-700 mt-1">
                Cancelled on {formatDateTime(invoice.cancelled_at)}
                {invoice.cancelledBy && ` by ${invoice.cancelledBy.full_name}`}
              </p>
              {invoice.cancellation_reason && (
                <p className="text-sm text-red-600 mt-1">
                  Reason: {invoice.cancellation_reason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Customer</h2>
            {invoice.customer ? (
              <div>
                <div className="font-medium text-lg">{invoice.customer.displayName}</div>
                {invoice.customer.company_name && invoice.customer.first_name && (
                  <div className="text-gray-500">{invoice.customer.company_name}</div>
                )}
                {invoice.customer.phone_e164 && (
                  <div className="text-sm text-gray-500 mt-1">
                    <a href={`tel:${invoice.customer.phone_e164}`} className="text-blue-600 hover:text-blue-800">
                      {invoice.customer.phone_e164}
                    </a>
                  </div>
                )}
                {invoice.customer.email && (
                  <div className="text-sm text-gray-500">
                    <a href={`mailto:${invoice.customer.email}`} className="text-blue-600 hover:text-blue-800">
                      {invoice.customer.email}
                    </a>
                  </div>
                )}
                <Link
                  to={`/customers/${invoice.customer.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block"
                >
                  View Customer Profile
                </Link>
              </div>
            ) : (
              <div className="text-gray-500 italic">No customer assigned</div>
            )}
          </div>

          {/* Items */}
          <div className={`card ${invoice.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {invoice.status === 'CANCELLED' ? 'Item History' : 'Items'} ({(invoice.items || []).filter(i => !i.voided_at).length})
              </h2>
              {voidedItemCount > 0 && (
                <button
                  onClick={() => setShowVoidedItems(!showVoidedItems)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {showVoidedItems ? 'Hide voided' : `Show ${voidedItemCount} voided`}
                </button>
              )}
            </div>

            {!invoice.items || invoice.items.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No items on this invoice</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                      {pCanSeeCost && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>}
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayItems.map((item) => {
                      const isItemVoided = !!item.voided_at;
                      const hasItemDiscount = item.discount_type && item.discount_type !== 'none' && parseFloat(item.discount_amount) > 0;
                      const preDiscountTotal = item.pre_discount_total || item.line_total_amount;

                      return (
                        <tr key={item.id} className={`${invoice.status === 'CANCELLED' ? 'text-gray-400' : ''} ${isItemVoided ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-4">
                            <div className={`font-medium ${invoice.status === 'CANCELLED' || isItemVoided ? 'text-gray-400 line-through' : ''}`}>
                              {item.description}
                            </div>
                            {item.asset && (
                              <div className="text-sm text-gray-500">
                                <Link
                                  to={`/inventory/${item.asset.id}`}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  {item.asset.asset_tag}
                                </Link>
                                {item.asset.serial_number && (
                                  <span> • S/N: {item.asset.serial_number}</span>
                                )}
                                {invoice.status !== 'CANCELLED' && !isItemVoided && (
                                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                    item.asset.status === 'Sold' ? 'bg-green-100 text-green-700' :
                                    item.asset.status === 'Processing' ? 'bg-blue-100 text-blue-700' :
                                    item.asset.status === 'Reserved' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {item.asset.status}
                                  </span>
                                )}
                              </div>
                            )}
                            {hasItemDiscount && !isItemVoided && (
                              <div className="text-xs text-orange-600 mt-1">
                                {item.discount_type === 'percentage' ? `${item.discount_value}% off` : `${formatCurrency(item.discount_value, invoice.currency)} off`}
                                {' '}&bull; saved {formatCurrency(item.discount_amount, invoice.currency)}
                              </div>
                            )}
                            {isItemVoided && item.void_reason && (
                              <div className="text-xs text-red-600 mt-1">
                                Void reason: {item.void_reason}
                              </div>
                            )}
                            {isItemVoided && item.voidedBy && (
                              <div className="text-xs text-red-500">
                                Voided by {item.voidedBy.full_name} on {formatDateTime(item.voided_at)}
                              </div>
                            )}
                          </td>
                          <td className={`px-4 py-4 text-center ${isItemVoided ? 'line-through' : ''}`}>{item.quantity}</td>
                          {pCanSeeCost && (
                            <td className={`px-4 py-4 text-right text-gray-500 ${isItemVoided ? 'line-through' : ''}`}>
                              {formatCurrency(item.unit_cost_amount, invoice.currency)}
                            </td>
                          )}
                          <td className={`px-4 py-4 text-right ${isItemVoided ? 'line-through' : ''}`}>
                            {canEdit && !isItemVoided && editingPriceItemId === item.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editingPriceValue}
                                  onChange={(e) => setEditingPriceValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSavePrice(item.id);
                                    if (e.key === 'Escape') handleCancelEditPrice();
                                  }}
                                  className="w-24 px-2 py-1 text-right border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSavePrice(item.id)}
                                  disabled={actionLoading}
                                  className="text-green-600 hover:text-green-800 p-1"
                                  title="Save"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={handleCancelEditPrice}
                                  className="text-gray-400 hover:text-gray-600 p-1"
                                  title="Cancel"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <span
                                className={canEdit && !isItemVoided ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}
                                onClick={() => canEdit && !isItemVoided && handleStartEditPrice(item)}
                                title={canEdit && !isItemVoided ? 'Click to edit price' : ''}
                              >
                                {formatCurrency(item.unit_price_amount, invoice.currency)}
                              </span>
                            )}
                          </td>
                          <td className={`px-4 py-4 text-right font-medium ${isItemVoided ? 'line-through' : ''}`}>
                            {hasItemDiscount && !isItemVoided ? (
                              <div>
                                <div className="text-xs text-gray-400 line-through">{formatCurrency(preDiscountTotal, invoice.currency)}</div>
                                <div>{formatCurrency(item.line_total_amount, invoice.currency)}</div>
                              </div>
                            ) : (
                              formatCurrency(item.line_total_amount, invoice.currency)
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {isItemVoided ? (
                              <span className="text-xs text-red-500 font-medium">Voided</span>
                            ) : canVoidItems ? (
                              <button
                                onClick={() => handleVoidItem(item)}
                                disabled={actionLoading}
                                className="text-sm text-red-600 hover:text-red-800"
                              >
                                Void
                              </button>
                            ) : canRemoveItems ? (
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                disabled={actionLoading}
                                className="text-sm text-red-600 hover:text-red-800"
                              >
                                Remove
                              </button>
                            ) : (
                              <span className="text-gray-300">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    {/* Subtotal row (only show if there's a discount) */}
                    {(invoice.discount_amount > 0 || displayItems.some(i => i.discount_type && i.discount_type !== 'none' && parseFloat(i.discount_amount) > 0)) && (
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-right text-sm text-gray-500">Subtotal</td>
                        <td className="px-4 py-2 text-right text-sm text-gray-500">
                          {formatCurrency(invoice.subtotal_amount, invoice.currency)}
                        </td>
                        <td></td>
                      </tr>
                    )}
                    {/* Invoice-level discount row */}
                    {invoice.discount_amount > 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-right text-sm text-orange-600">
                          Invoice Discount
                          {invoice.discount_type === 'percentage' && ` (${invoice.discount_value}%)`}
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-orange-600 font-medium">
                          -{formatCurrency(invoice.discount_amount, invoice.currency)}
                        </td>
                        <td></td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-lg">
                        {formatCurrency(invoice.total_amount, invoice.currency)}
                      </td>
                      <td></td>
                    </tr>
                    {/* Savings indicator */}
                    {(() => {
                      const lineDiscounts = displayItems.reduce((sum, i) => sum + (parseFloat(i.discount_amount) || 0), 0);
                      const totalSavings = lineDiscounts + (parseFloat(invoice.discount_amount) || 0);
                      if (totalSavings > 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="px-4 py-2 text-right">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                Customer saved {formatCurrency(totalSavings, invoice.currency)}
                              </span>
                            </td>
                          </tr>
                        );
                      }
                      return null;
                    })()}
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Transaction History */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Transaction History</h2>
              {voidedCount > 0 && (
                <button
                  onClick={() => setShowVoidedTransactions(!showVoidedTransactions)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {showVoidedTransactions ? 'Hide voided' : `Show ${voidedCount} voided`}
                </button>
              )}
            </div>

            {!invoice.payments || invoice.payments.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No transactions recorded</div>
            ) : displayTransactions.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No active transactions</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comment</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayTransactions.map((tx) => {
                      const isVoided = !!tx.voided_at;
                      const isRefund = tx.transaction_type === 'REFUND';

                      return (
                        <tr key={tx.id} className={isVoided ? 'bg-gray-50 opacity-60' : ''}>
                          <td className="px-4 py-3 text-sm">
                            {formatDate(tx.payment_date)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              isVoided
                                ? 'bg-gray-200 text-gray-500 line-through'
                                : isRefund
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-green-100 text-green-800'
                            }`}>
                              {isRefund ? 'Refund' : 'Payment'}
                              {isVoided && ' (Voided)'}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${
                            isVoided
                              ? 'text-gray-400 line-through'
                              : isRefund
                                ? 'text-orange-600'
                                : 'text-green-600'
                          }`}>
                            {isRefund ? '-' : '+'}{formatCurrency(tx.amount, tx.currency)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              {tx.payment_method === 'Other' && tx.payment_method_other_text
                                ? `Other – ${tx.payment_method_other_text}`
                                : tx.payment_method || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <div className={isVoided ? 'line-through' : ''}>
                              {tx.comment}
                            </div>
                            {isVoided && tx.void_reason && (
                              <div className="text-xs text-red-600 mt-1">
                                Void reason: {tx.void_reason}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {tx.receivedBy?.full_name || '—'}
                            {isVoided && tx.voidedBy && (
                              <div className="text-xs text-red-500">
                                Voided by: {tx.voidedBy.full_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {!isVoided && invoice.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleVoidTransaction(tx)}
                                className="text-xs text-red-600 hover:text-red-800 hover:underline"
                                title="Void this transaction"
                              >
                                Void
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Returns History */}
          {returns.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Returns History</h2>
              <div className="space-y-4">
                {returns.map(ret => (
                  <div
                    key={ret.id}
                    className={`p-4 rounded-lg border ${
                      ret.status === 'FINALIZED'
                        ? 'bg-gray-50 border-gray-200'
                        : ret.status === 'CANCELLED'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            ret.return_type === 'EXCHANGE'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {ret.return_type === 'EXCHANGE' ? 'Exchange' : 'Return & Refund'}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            ret.status === 'FINALIZED'
                              ? 'bg-green-100 text-green-800'
                              : ret.status === 'CANCELLED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {ret.status === 'FINALIZED' ? 'Completed' : ret.status === 'CANCELLED' ? 'Cancelled' : 'Draft'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {ret.items?.length || 0} item(s) - {formatCurrency(ret.total_return_amount, ret.currency)}
                        </div>
                        {ret.return_reason_code && (
                          <div className="text-sm text-gray-500 mt-1">
                            Reason: {
                              ret.return_reason_code === 'BUYER_REMORSE' ? 'Buyer Remorse' :
                              ret.return_reason_code === 'DEFECT' ? 'Defect' :
                              ret.return_reason_code === 'EXCHANGE' ? 'Exchange' :
                              ret.return_reason_code === 'OTHER' ? 'Other' :
                              ret.return_reason_code
                            }
                            {ret.return_reason_details && ` - ${ret.return_reason_details}`}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <div>{formatDate(ret.created_at)}</div>
                        {ret.createdBy && <div>by {ret.createdBy.full_name}</div>}
                      </div>
                    </div>
                    {ret.credit && (
                      <div className="mt-2 text-sm">
                        <span className="text-purple-600 font-medium">
                          Store Credit: {formatCurrency(ret.credit.remaining_amount, ret.credit.currency)}
                          {ret.credit.status === 'CONSUMED' && ' (Used)'}
                          {ret.credit.status === 'ACTIVE' && ' (Active)'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Notes</h2>
              <pre className="whitespace-pre-wrap font-sans text-gray-700">{invoice.notes}</pre>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="card bg-gray-50">
            <h2 className="text-lg font-semibold mb-4">Payment Summary</h2>
            {invoice.status === 'CANCELLED' ? (
              <div className="text-center py-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                  Invoice Cancelled
                </span>
                <p className="text-sm text-gray-500 mt-3">
                  Original total: {formatCurrency(invoice.total_amount, invoice.currency)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Balance due: {formatCurrency(0, invoice.currency)}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {/* Show subtotal + discount breakdown if there's a discount */}
                  {invoice.discount_amount > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Subtotal</span>
                        <span>{formatCurrency(invoice.subtotal_amount, invoice.currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-600">
                          Discount{invoice.discount_type === 'percentage' ? ` (${invoice.discount_value}%)` : ''}
                        </span>
                        <span className="text-orange-600">-{formatCurrency(invoice.discount_amount, invoice.currency)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Invoice Total</span>
                    <span className="font-medium">
                      {formatCurrency(invoice.total_amount, invoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount Paid</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(invoice.amount_paid, invoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="font-semibold">Balance Due</span>
                    <span className={`font-bold text-lg ${invoice.balance_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(invoice.balance_due, invoice.currency)}
                    </span>
                  </div>
                </div>

                {canReceivePayment && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full mt-4 btn btn-primary"
                  >
                    Receive Payment
                  </button>
                )}
              </>
            )}
          </div>

          {/* Store Credit (if customer has available credit) */}
          {canReceivePayment && invoice.customer_id && (
            <StoreCreditSelector
              customerId={invoice.customer_id}
              invoiceId={invoice.id}
              invoiceCurrency={invoice.currency}
              balanceDue={invoice.balance_due}
              onCreditApplied={handleCreditApplied}
            />
          )}

          {/* Financial Summary — only for roles that can see cost data */}
          {pCanSeeCost && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Profit Details</h2>
                <button
                  onClick={() => setShowProfit(!showProfit)}
                  className="text-gray-400 hover:text-gray-600"
                  title={showProfit ? 'Hide profit details' : 'Show profit details'}
                >
                  {showProfit ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Revenue</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(invoice.total_amount, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cost</span>
                  <span className="font-medium">
                    {showProfit ? formatCurrency(invoice.total_cost_amount, invoice.currency) : '******'}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-gray-500">Profit</span>
                  <span className={`font-medium ${invoice.total_profit_amount >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {showProfit ? formatCurrency(invoice.total_profit_amount, invoice.currency) : '******'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Margin</span>
                  <span className={`font-medium ${invoice.margin_percent >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                    {showProfit ? `${invoice.margin_percent?.toFixed(1) || 0}%` : '******'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Invoice Details */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Invoice Number</span>
                <p className="font-mono">{invoice.invoice_number}</p>
              </div>
              <div>
                <span className="text-gray-500">Currency</span>
                <p>{invoice.currency}</p>
              </div>
              <div>
                <span className="text-gray-500">Created</span>
                <p>{formatDateTime(invoice.created_at)}</p>
                {invoice.creator && <p className="text-gray-500">by {invoice.creator.full_name}</p>}
              </div>
              {invoice.updated_at !== invoice.created_at && (
                <div>
                  <span className="text-gray-500">Last Updated</span>
                  <p>{formatDateTime(invoice.updated_at)}</p>
                  {invoice.updater && <p className="text-gray-500">by {invoice.updater.full_name}</p>}
                </div>
              )}
              {invoice.fx_rate_used && (
                <div>
                  <span className="text-gray-500">FX Rate Used</span>
                  <p>{invoice.fx_rate_used}</p>
                  {invoice.fx_rate_source && (
                    <p className="text-xs text-gray-400">Source: {invoice.fx_rate_source}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
