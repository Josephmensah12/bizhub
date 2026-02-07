import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  formatWithEquivalent,
  calculateProfitAndMarkup,
  formatProfit,
  formatMarkup
} from '../services/currencyConversion';

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [costDisplay, setCostDisplay] = useState(null);
  const [priceDisplay, setPriceDisplay] = useState(null);
  const [profitDisplay, setProfitDisplay] = useState('—');
  const [markupDisplay, setMarkupDisplay] = useState('—');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  useEffect(() => {
    fetchAsset();
    fetchHistory();
  }, [id]);

  // Calculate currency equivalents, profit, and markup when asset loads
  useEffect(() => {
    async function calculatePricingData() {
      if (!asset) return;

      // Cost with GHS equivalent (show in selling currency)
      if (asset.cost_amount && asset.cost_currency) {
        const formatted = await formatWithEquivalent(
          asset.cost_amount,
          asset.cost_currency,
          asset.price_currency || 'GHS'
        );
        setCostDisplay(formatted);
      } else {
        setCostDisplay('—');
      }

      // Selling Price with cost currency equivalent
      if (asset.price_amount && asset.price_currency) {
        const formatted = await formatWithEquivalent(
          asset.price_amount,
          asset.price_currency,
          asset.cost_currency || 'USD'
        );
        setPriceDisplay(formatted);
      } else {
        setPriceDisplay('—');
      }

      // Calculate profit and markup
      const result = await calculateProfitAndMarkup(
        parseFloat(asset.cost_amount),
        asset.cost_currency,
        parseFloat(asset.price_amount),
        asset.price_currency
      );

      if (result.error) {
        setProfitDisplay('—');
        setMarkupDisplay('—');
      } else {
        setProfitDisplay(formatProfit(result.profit));
        setMarkupDisplay(formatMarkup(result.markup));
      }
    }

    calculatePricingData();
  }, [asset]);

  const fetchAsset = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/v1/assets/${id}`);
      setAsset(response.data.data.asset);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch asset details');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await axios.get(`/api/v1/assets/${id}/history`);
      setHistory(response.data.data.events || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`/api/v1/assets/${id}`);
      navigate('/inventory');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete asset');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div>
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <div className="text-center py-8 text-gray-500">Asset not found</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate('/inventory')}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          ← Back to Inventory
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{asset.asset_tag}</h1>
            <p className="text-gray-600 mt-1">
              {asset.make} {asset.model}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to={`/inventory/${id}/edit`}
              className="btn btn-secondary"
            >
              Edit Asset
            </Link>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mb-6">
        <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${
          asset.status === 'In Stock' ? 'bg-green-100 text-green-800' :
          asset.status === 'Processing' ? 'bg-blue-100 text-blue-800' :
          asset.status === 'Reserved' ? 'bg-yellow-100 text-yellow-800' :
          asset.status === 'Sold' ? 'bg-gray-100 text-gray-800' :
          asset.status === 'In Repair' ? 'bg-orange-100 text-orange-800' :
          'bg-purple-100 text-purple-800'
        }`}>
          {asset.status}
        </span>
        {asset.condition && (
          <span className="ml-2 inline-block px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
            {asset.condition}
          </span>
        )}
        {/* Show linked invoice for Reserved or Sold status */}
        {(asset.status === 'Processing' || asset.status === 'Reserved' || asset.status === 'Sold') && (() => {
          const linkedEvent = history.find(e =>
            (e.eventType === 'RESERVED' || e.eventType === 'SOLD' || e.eventType === 'ADDED_TO_INVOICE') &&
            e.details?.invoiceId
          );
          if (linkedEvent?.details?.invoiceId) {
            return (
              <Link
                to={`/invoices/${linkedEvent.details.invoiceId}`}
                className="ml-3 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Invoice: {linkedEvent.details.invoiceNumber || 'View'}
              </Link>
            );
          }
          return null;
        })()}
      </div>

      {/* Basic Information */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailItem label="Asset Tag" value={asset.asset_tag} />
          <DetailItem label="Category" value={asset.category} />
          <DetailItem label="Asset Type" value={asset.asset_type} />
          <DetailItem label="Serial Number" value={asset.serial_number} />
          <DetailItem label="Make" value={asset.make} />
          <DetailItem label="Model" value={asset.model} />
          <DetailItem label="Product Category" value={asset.product_category} />
          <DetailItem label="Subcategory" value={asset.subcategory} />
          <DetailItem label="Quantity" value={asset.quantity} />
        </div>
        {asset.specs && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Specifications</label>
            <p className="text-gray-900">{asset.specs}</p>
          </div>
        )}
      </div>

      {/* Technical Specifications */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Technical Specifications</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailItem label="RAM" value={asset.ram_gb ? `${asset.ram_gb} GB` : null} />
          <DetailItem label="Storage" value={asset.storage_gb ? `${asset.storage_gb} GB ${asset.storage_type || ''}` : null} />
          <DetailItem label="CPU" value={asset.cpu} />
          <DetailItem label="GPU" value={asset.gpu} />
          <DetailItem label="Screen Size" value={asset.screen_size_inches ? `${asset.screen_size_inches}"` : null} />
          <DetailItem label="Resolution" value={asset.resolution} />
          <DetailItem label="Battery Health" value={asset.battery_health_percent ? `${asset.battery_health_percent}%` : null} />
        </div>
        {asset.major_characteristics && asset.major_characteristics.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Major Characteristics</label>
            <div className="flex flex-wrap gap-2">
              {asset.major_characteristics.map((char, idx) => (
                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded">
                  {char}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailItem
            label="Cost (Purchase Price)"
            value={costDisplay}
          />
          <DetailItem
            label="Selling Price"
            value={priceDisplay}
          />
          <DetailItem
            label="Profit"
            value={profitDisplay}
            highlight={profitDisplay !== '—' && !profitDisplay.startsWith('-')}
            negative={profitDisplay !== '—' && profitDisplay.includes('-')}
          />
          <DetailItem
            label="Markup"
            value={markupDisplay}
            subtext="profit as % of cost"
          />
        </div>
        {asset.cost_currency !== asset.price_currency && asset.cost_amount && asset.price_amount && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
            <strong>Multi-Currency:</strong> Equivalents shown use daily exchange rate + 0.5 markup.
            Exchange rates update daily for accurate margin calculations.
          </div>
        )}
      </div>

      {/* Audit Information - Collapsible */}
      <div className="card mb-6">
        <button
          onClick={() => setAuditExpanded(!auditExpanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-gray-900">Audit Information</h2>
          <span className={`text-gray-500 transition-transform duration-200 ${auditExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {auditExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
            <DetailItem
              label="Created At"
              value={new Date(asset.created_at).toLocaleString()}
            />
            <DetailItem
              label="Created By"
              value={asset.creator?.full_name}
            />
            <DetailItem
              label="Updated At"
              value={new Date(asset.updated_at).toLocaleString()}
            />
            <DetailItem
              label="Updated By"
              value={asset.updater?.full_name}
            />
          </div>
        )}
      </div>

      {/* History Timeline - Collapsible */}
      <div className="card">
        <button
          onClick={() => setHistoryExpanded(!historyExpanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            History
            {!historyLoading && history.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">({history.length} events)</span>
            )}
          </h2>
          <span className={`text-gray-500 transition-transform duration-200 ${historyExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {historyExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : history.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">No history events recorded yet.</p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                <div className="space-y-6">
                  {history.map((event, index) => (
                    <HistoryEvent key={event.id} event={event} isFirst={index === 0} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value, highlight, negative, subtext }) {
  if (!value) return null;

  // Determine text color based on props
  let valueClass = 'text-gray-900';
  if (highlight) valueClass = 'text-green-600 font-semibold';
  if (negative) valueClass = 'text-red-600 font-semibold';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {subtext && <span className="text-xs text-gray-500 ml-1">({subtext})</span>}
      </label>
      <p className={valueClass}>{value}</p>
    </div>
  );
}

/**
 * Get icon and color for event type
 */
function getEventStyle(eventType) {
  const styles = {
    IMPORTED: { icon: '📥', color: 'bg-blue-500', textColor: 'text-blue-700' },
    CREATED: { icon: '✨', color: 'bg-green-500', textColor: 'text-green-700' },
    UPDATED: { icon: '✏️', color: 'bg-yellow-500', textColor: 'text-yellow-700' },
    ADDED_TO_INVOICE: { icon: '📄', color: 'bg-purple-500', textColor: 'text-purple-700' },
    RESERVED: { icon: '🔒', color: 'bg-orange-500', textColor: 'text-orange-700' },
    SOLD: { icon: '💰', color: 'bg-green-600', textColor: 'text-green-700' },
    PAYMENT_RECEIVED: { icon: '💵', color: 'bg-green-500', textColor: 'text-green-700' },
    RETURN_INITIATED: { icon: '↩️', color: 'bg-amber-500', textColor: 'text-amber-700' },
    RETURN_FINALIZED: { icon: '✅', color: 'bg-amber-600', textColor: 'text-amber-700' },
    REFUND_ISSUED: { icon: '💸', color: 'bg-red-500', textColor: 'text-red-700' },
    EXCHANGE_CREDIT_CREATED: { icon: '🎫', color: 'bg-purple-500', textColor: 'text-purple-700' },
    CREDIT_APPLIED: { icon: '🎟️', color: 'bg-purple-400', textColor: 'text-purple-700' },
    INVENTORY_RELEASED: { icon: '📦', color: 'bg-blue-500', textColor: 'text-blue-700' },
    SOFT_DELETED: { icon: '🗑️', color: 'bg-red-500', textColor: 'text-red-700' },
    RESTORED: { icon: '♻️', color: 'bg-green-500', textColor: 'text-green-700' },
    BULK_UPLOAD_REVERTED: { icon: '⏪', color: 'bg-gray-500', textColor: 'text-gray-700' },
    INVOICE_CANCELLED: { icon: '❌', color: 'bg-red-500', textColor: 'text-red-700' },
    INVOICE_CANCELLED_INVENTORY_RELEASED: { icon: '📦', color: 'bg-blue-500', textColor: 'text-blue-700' }
  };
  return styles[eventType] || { icon: '📌', color: 'bg-gray-500', textColor: 'text-gray-700' };
}

function HistoryEvent({ event, isFirst }) {
  const style = getEventStyle(event.eventType);
  const date = new Date(event.occurredAt);

  // Check if this event is linked to an invoice
  const hasInvoiceLink = event.referenceType === 'invoice' && event.details?.invoiceId;
  const invoiceNumber = event.details?.invoiceNumber;

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div className={`absolute left-2 w-5 h-5 rounded-full ${style.color} flex items-center justify-center text-xs shadow-sm`}>
        <span className="text-white text-[10px]">{style.icon}</span>
      </div>

      <div className={`p-3 rounded-lg ${isFirst ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
        <div className="flex items-start justify-between">
          <div>
            <span className={`font-medium ${style.textColor}`}>{event.label}</span>
            {event.summary && (
              <p className="text-sm text-gray-600 mt-1">{event.summary}</p>
            )}
            {/* Invoice link for Reserved/Added to Invoice events */}
            {hasInvoiceLink && (
              <Link
                to={`/invoices/${event.details.invoiceId}`}
                className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                <span>📄</span>
                <span>View Invoice {invoiceNumber || ''}</span>
              </Link>
            )}
          </div>
          <div className="text-right text-xs text-gray-500 ml-4 whitespace-nowrap">
            <div>{date.toLocaleDateString()}</div>
            <div>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        {/* Actor and source info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          {event.actor && (
            <span>by {event.actor.name}</span>
          )}
          {event.source && event.source !== 'USER' && (
            <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">
              {event.source}
            </span>
          )}
        </div>

        {/* Details expandable */}
        {event.details && Object.keys(event.details).length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
              View details
            </summary>
            <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-xs">
              <pre className="whitespace-pre-wrap text-gray-600">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
