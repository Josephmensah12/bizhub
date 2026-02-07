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

const PAYMENT_METHODS = ['Cash', 'MoMo', 'Card', 'ACH', 'Other'];
const RESTOCK_CONDITIONS = [
  { value: 'AS_IS', label: 'Ready for Sale' },
  { value: 'NEEDS_TESTING', label: 'Needs Testing' },
  { value: 'NEEDS_REPAIR', label: 'Needs Repair' }
];

const RETURN_REASON_OPTIONS = [
  { value: 'BUYER_REMORSE', label: 'Buyer Remorse' },
  { value: 'DEFECT', label: 'Defect' },
  { value: 'EXCHANGE', label: 'Exchange' },
  { value: 'OTHER', label: 'Other' }
];

/**
 * Return Modal - Multi-step wizard for processing returns
 */
export default function ReturnModal({ invoice, onClose, onReturnProcessed }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Return type
  const [returnType, setReturnType] = useState('RETURN_REFUND');

  // Step 2: Items selection
  const [returnableItems, setReturnableItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});

  // Step 3: Reason
  const [returnReasonCode, setReturnReasonCode] = useState('');
  const [returnReasonDetails, setReturnReasonDetails] = useState('');

  // Step 4: Finalize (for RETURN_REFUND)
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentMethodOtherText, setPaymentMethodOtherText] = useState('');
  const [comment, setComment] = useState('');

  // Created return (for finalization step)
  const [createdReturn, setCreatedReturn] = useState(null);

  // Load returnable items
  useEffect(() => {
    const fetchReturnableItems = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/v1/invoices/${invoice.id}/returnable-items`);
        setReturnableItems(response.data.data.returnableItems);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to load returnable items');
      } finally {
        setLoading(false);
      }
    };
    fetchReturnableItems();
  }, [invoice.id]);

  // Auto-suggest restock condition when reason is DEFECT
  useEffect(() => {
    if (returnReasonCode === 'DEFECT') {
      // Suggest NEEDS_TESTING for all selected items
      setSelectedItems(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (updated[key].restockCondition === 'AS_IS') {
            updated[key] = { ...updated[key], restockCondition: 'NEEDS_TESTING' };
          }
        });
        return updated;
      });
    }
  }, [returnReasonCode]);

  // Toggle item selection
  const toggleItem = (itemId) => {
    setSelectedItems(prev => {
      if (prev[itemId]) {
        const { [itemId]: removed, ...rest } = prev;
        return rest;
      } else {
        const item = returnableItems.find(i => i.id === itemId);
        return {
          ...prev,
          [itemId]: {
            invoiceItemId: itemId,
            quantityReturned: 1,
            restockCondition: returnReasonCode === 'DEFECT' ? 'NEEDS_TESTING' : 'AS_IS',
            maxQuantity: item?.returnableQuantity || 1,
            unitPrice: item?.unitPrice || 0,
            description: item?.description
          }
        };
      }
    });
  };

  // Update quantity for selected item
  const updateQuantity = (itemId, quantity) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        quantityReturned: Math.max(1, Math.min(quantity, prev[itemId].maxQuantity))
      }
    }));
  };

  // Update restock condition
  const updateRestockCondition = (itemId, condition) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        restockCondition: condition
      }
    }));
  };

  // Calculate total return amount
  const calculateTotal = () => {
    return Object.values(selectedItems).reduce((sum, item) => {
      return sum + (item.unitPrice * item.quantityReturned);
    }, 0);
  };

  // Create return draft
  const handleCreateReturn = async () => {
    try {
      setLoading(true);
      setError(null);

      const items = Object.values(selectedItems).map(item => ({
        invoiceItemId: item.invoiceItemId,
        quantityReturned: item.quantityReturned,
        restockCondition: item.restockCondition
      }));

      const response = await axios.post(`/api/v1/invoices/${invoice.id}/returns`, {
        returnType,
        items,
        returnReasonCode,
        returnReasonDetails: returnReasonDetails.trim() || null
      });

      setCreatedReturn(response.data.data.return);

      // If exchange, we can finalize immediately (no payment details needed)
      if (returnType === 'EXCHANGE') {
        await handleFinalizeReturn(response.data.data.returnId);
      } else {
        setStep(4);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create return');
    } finally {
      setLoading(false);
    }
  };

  // Finalize return
  const handleFinalizeReturn = async (returnId = null) => {
    try {
      setLoading(true);
      setError(null);

      const id = returnId || createdReturn?.id;
      if (!id) {
        setError('Return not created yet');
        return;
      }

      const body = {};

      // For RETURN_REFUND, include refund details
      if (returnType === 'RETURN_REFUND') {
        if (!comment.trim()) {
          setError('Comment is required for refund');
          return;
        }

        if (paymentMethod === 'Other' && !paymentMethodOtherText.trim()) {
          setError('Please specify the payment method');
          return;
        }

        body.refund = {
          paymentMethod,
          paymentMethodOtherText: paymentMethod === 'Other' ? paymentMethodOtherText.trim() : null,
          comment: comment.trim()
        };
      }

      const response = await axios.post(`/api/v1/returns/${id}/finalize`, body);

      onReturnProcessed(response.data.data.invoice);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to finalize return');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = Object.keys(selectedItems).length;
  const totalAmount = calculateTotal();
  const canProceedStep2 = selectedCount > 0;
  const canProceedStep3 = returnReasonCode !== '';

  // For RETURN_REFUND, check against amount paid
  const amountPaid = parseFloat(invoice.amount_paid) || 0;
  const exceedsAmountPaid = returnType === 'RETURN_REFUND' && totalAmount > amountPaid;

  // Show warning if reason is EXCHANGE but mode is REFUND
  const showModeReasonMismatch = returnReasonCode === 'EXCHANGE' && returnType === 'RETURN_REFUND';

  // Get title based on step
  const getStepTitle = () => {
    switch (step) {
      case 1: return 'Refund/Return';
      case 2: return 'Select Items to Return';
      case 3: return 'Return Reason';
      case 4: return 'Finalize Refund';
      default: return 'Return';
    }
  };

  const totalSteps = returnType === 'EXCHANGE' ? 3 : 4;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${returnType === 'EXCHANGE' ? 'bg-purple-50' : 'bg-orange-50'}`}>
          <h2 className="text-lg font-semibold">{getStepTitle()}</h2>
          <p className="text-sm text-gray-500">
            Invoice {invoice.invoice_number} - Step {step} of {totalSteps}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Choose Return Type */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">Choose what you want to do:</p>

              <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                returnType === 'RETURN_REFUND' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="returnType"
                  value="RETURN_REFUND"
                  checked={returnType === 'RETURN_REFUND'}
                  onChange={() => setReturnType('RETURN_REFUND')}
                  className="sr-only"
                />
                <div className="flex items-start">
                  <div className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center ${
                    returnType === 'RETURN_REFUND' ? 'border-orange-500' : 'border-gray-300'
                  }`}>
                    {returnType === 'RETURN_REFUND' && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Refund (Return + Refund)</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Customer returns selected items and you refund the amount back to them.
                    </div>
                  </div>
                </div>
              </label>

              <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                returnType === 'EXCHANGE' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="returnType"
                  value="EXCHANGE"
                  checked={returnType === 'EXCHANGE'}
                  onChange={() => setReturnType('EXCHANGE')}
                  className="sr-only"
                />
                <div className="flex items-start">
                  <div className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center ${
                    returnType === 'EXCHANGE' ? 'border-purple-500' : 'border-gray-300'
                  }`}>
                    {returnType === 'EXCHANGE' && <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Exchange (Store Credit)</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Customer returns selected items and receives store credit to apply toward a new purchase.
                    </div>
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Step 2: Select Items */}
          {step === 2 && (
            <div className="space-y-4">
              {loading && returnableItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Loading items...</div>
              ) : returnableItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No items available for return</div>
              ) : (
                <>
                  <p className="text-gray-600 mb-4">Select items to return and specify quantities:</p>

                  <div className="space-y-3">
                    {returnableItems.map(item => {
                      const isSelected = !!selectedItems[item.id];
                      const selectedItem = selectedItems[item.id];

                      return (
                        <div
                          key={item.id}
                          className={`p-4 border rounded-lg ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                        >
                          <div className="flex items-start">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItem(item.id)}
                              className="mt-1 mr-3 h-4 w-4 text-blue-600 rounded"
                            />
                            <div className="flex-1">
                              <div className="flex justify-between">
                                <div className="font-medium">{item.description}</div>
                                <div className="text-sm text-gray-500">
                                  {formatCurrency(item.unitPrice, invoice.currency)} each
                                </div>
                              </div>
                              {item.asset && (
                                <div className="text-sm text-gray-500 mt-1">
                                  {item.asset.assetTag}
                                  {item.asset.serialNumber && ` - S/N: ${item.asset.serialNumber}`}
                                </div>
                              )}
                              <div className="text-sm text-gray-500">
                                Returnable: {item.returnableQuantity} of {item.quantity} sold
                              </div>

                              {isSelected && (
                                <div className="mt-3 flex flex-wrap gap-4">
                                  <div>
                                    <label className="text-xs text-gray-500">Quantity</label>
                                    <div className="flex items-center gap-2 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => updateQuantity(item.id, selectedItem.quantityReturned - 1)}
                                        disabled={selectedItem.quantityReturned <= 1}
                                        className="w-8 h-8 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                                      >
                                        -
                                      </button>
                                      <span className="w-8 text-center">{selectedItem.quantityReturned}</span>
                                      <button
                                        type="button"
                                        onClick={() => updateQuantity(item.id, selectedItem.quantityReturned + 1)}
                                        disabled={selectedItem.quantityReturned >= selectedItem.maxQuantity}
                                        className="w-8 h-8 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">Condition</label>
                                    <select
                                      value={selectedItem.restockCondition}
                                      onChange={(e) => updateRestockCondition(item.id, e.target.value)}
                                      className="mt-1 block text-sm border border-gray-300 rounded px-2 py-1"
                                    >
                                      {RESTOCK_CONDITIONS.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="ml-auto">
                                    <label className="text-xs text-gray-500">Return Amount</label>
                                    <div className="mt-1 font-medium text-orange-600">
                                      {formatCurrency(selectedItem.unitPrice * selectedItem.quantityReturned, invoice.currency)}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Return Amount</span>
                      <span className="text-xl font-bold text-orange-600">
                        {formatCurrency(totalAmount, invoice.currency)}
                      </span>
                    </div>
                    {exceedsAmountPaid && (
                      <div className="text-sm text-red-600 mt-2">
                        Return amount exceeds amount paid ({formatCurrency(amountPaid, invoice.currency)})
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Return Reason */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg mb-4">
                <div className="text-sm text-gray-500 mb-2">Return Summary</div>
                <div className="space-y-1">
                  {Object.values(selectedItems).map(item => (
                    <div key={item.invoiceItemId} className="flex justify-between text-sm">
                      <span>{item.quantityReturned}x {item.description}</span>
                      <span>{formatCurrency(item.unitPrice * item.quantityReturned, invoice.currency)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                    <span>Total</span>
                    <span className="text-orange-600">{formatCurrency(totalAmount, invoice.currency)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Return Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={returnReasonCode}
                  onChange={(e) => setReturnReasonCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Select a reason...</option>
                  {RETURN_REASON_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {showModeReasonMismatch && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                  You selected "Exchange" as the reason but chose to refund. The customer will receive a direct refund instead of store credit.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Details (Optional)
                </label>
                <textarea
                  value={returnReasonDetails}
                  onChange={(e) => setReturnReasonDetails(e.target.value)}
                  placeholder="e.g., Screen flicker, battery issue, wrong model, customer changed mind..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {returnReasonDetails.length}/500 characters
                </p>
              </div>

              <div className={`p-4 rounded-lg ${returnType === 'EXCHANGE' ? 'bg-purple-50' : 'bg-orange-50'}`}>
                <div className="font-medium mb-1">
                  {returnType === 'EXCHANGE' ? 'Store Credit Will Be Created' : 'Refund Details Required Next'}
                </div>
                <div className="text-sm text-gray-600">
                  {returnType === 'EXCHANGE'
                    ? `Customer will receive ${formatCurrency(totalAmount, invoice.currency)} in store credit that can be applied to future purchases.`
                    : 'You will need to specify how the refund was given (cash, MoMo, etc.) on the next step.'}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Refund Details (RETURN_REFUND only) */}
          {step === 4 && returnType === 'RETURN_REFUND' && (
            <div className="space-y-4">
              <div className="p-4 bg-orange-50 rounded-lg mb-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Refund Amount</span>
                  <span className="text-xl font-bold text-orange-600">
                    {formatCurrency(totalAmount, invoice.currency)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refund Method <span className="text-red-500">*</span>
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
                  placeholder="e.g., Refunded via MoMo to 024XXXXXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Describe how the refund was given (account number, location, etc.)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between">
          <button
            type="button"
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            disabled={loading}
            className="btn btn-secondary"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <div className="flex gap-3">
            {step < 3 && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={loading || (step === 2 && (!canProceedStep2 || exceedsAmountPaid))}
                className="btn btn-primary"
              >
                Next
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleCreateReturn}
                disabled={loading || !canProceedStep3}
                className={`btn ${returnType === 'EXCHANGE' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'btn-primary'}`}
              >
                {loading ? 'Processing...' : (returnType === 'EXCHANGE' ? 'Create Store Credit' : 'Continue to Refund')}
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={() => handleFinalizeReturn()}
                disabled={loading || !comment.trim()}
                className="btn bg-orange-600 hover:bg-orange-700 text-white"
              >
                {loading ? 'Processing...' : 'Complete Refund'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
