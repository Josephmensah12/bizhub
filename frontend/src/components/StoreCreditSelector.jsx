import { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Format currency for display
 */
function formatCurrency(amount, currency = 'GHS') {
  if (amount === null || amount === undefined) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Store Credit Selector Component
 * Shows available store credits and allows applying them to an invoice
 */
export default function StoreCreditSelector({ customerId, invoiceId, invoiceCurrency, balanceDue, onCreditApplied }) {
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCreditId, setSelectedCreditId] = useState(null);
  const [amountToApply, setAmountToApply] = useState('');

  useEffect(() => {
    if (customerId) {
      fetchCredits();
    }
  }, [customerId]);

  const fetchCredits = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/v1/customers/${customerId}/credits`, {
        params: { currency: invoiceCurrency }
      });
      // Filter to only show usable credits
      const usableCredits = (response.data.data.credits || []).filter(
        c => c.status === 'ACTIVE' && c.remaining_amount > 0 && c.currency === invoiceCurrency
      );
      setCredits(usableCredits);
    } catch (err) {
      setError('Failed to load store credits');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCredit = async () => {
    if (!selectedCreditId || !amountToApply) return;

    const amount = parseFloat(amountToApply);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid amount');
      return;
    }

    try {
      setApplying(true);
      setError(null);
      const response = await axios.post(`/api/v1/customers/${customerId}/credits/apply`, {
        invoiceId,
        creditId: selectedCreditId,
        amountToApply: amount
      });

      // Refresh credits and notify parent
      fetchCredits();
      setSelectedCreditId(null);
      setAmountToApply('');
      onCreditApplied(response.data.data.invoice, response.data.data.amountApplied);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to apply credit');
    } finally {
      setApplying(false);
    }
  };

  const selectedCredit = credits.find(c => c.id === selectedCreditId);
  const maxApplicable = selectedCredit ? Math.min(selectedCredit.remaining_amount, balanceDue) : 0;

  if (loading) {
    return <div className="text-sm text-gray-500">Checking for store credits...</div>;
  }

  if (credits.length === 0) {
    return null; // No credits available, don't show anything
  }

  const totalAvailable = credits.reduce((sum, c) => sum + c.remaining_amount, 0);

  return (
    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-purple-800">Store Credit Available</h3>
        <span className="text-sm text-purple-600">
          Total: {formatCurrency(totalAvailable, invoiceCurrency)}
        </span>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {credits.map(credit => (
          <label
            key={credit.id}
            className={`block p-3 border rounded-lg cursor-pointer transition ${
              selectedCreditId === credit.id
                ? 'border-purple-500 bg-white'
                : 'border-purple-200 bg-purple-25 hover:border-purple-300'
            }`}
          >
            <div className="flex items-start">
              <input
                type="radio"
                name="storeCredit"
                checked={selectedCreditId === credit.id}
                onChange={() => {
                  setSelectedCreditId(credit.id);
                  setAmountToApply(Math.min(credit.remaining_amount, balanceDue).toFixed(2));
                }}
                className="mt-1 mr-3"
              />
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {formatCurrency(credit.remaining_amount, credit.currency)}
                  </span>
                  <span className="text-xs text-gray-500">
                    of {formatCurrency(credit.original_amount, credit.currency)} original
                  </span>
                </div>
                {credit.sourceReturn?.invoice && (
                  <div className="text-xs text-gray-500 mt-1">
                    From return on {credit.sourceReturn.invoice.invoice_number}
                  </div>
                )}
              </div>
            </div>
          </label>
        ))}
      </div>

      {selectedCreditId && (
        <div className="mt-4 pt-4 border-t border-purple-200">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount to Apply
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">{invoiceCurrency}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={maxApplicable}
                  value={amountToApply}
                  onChange={(e) => setAmountToApply(e.target.value)}
                  className="w-full pl-14 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Max: {formatCurrency(maxApplicable, invoiceCurrency)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleApplyCredit}
              disabled={applying || !amountToApply || parseFloat(amountToApply) <= 0}
              className="btn bg-purple-600 hover:bg-purple-700 text-white"
            >
              {applying ? 'Applying...' : 'Apply Credit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
