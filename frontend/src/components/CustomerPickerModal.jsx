import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash/debounce';

export default function CustomerPickerModal({ open, onClose, onSelect, onCreateNew }) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load initial customers on open
  useEffect(() => {
    if (open) {
      setSearch('');
      fetchCustomers('');
    }
  }, [open]);

  const fetchCustomers = async (query) => {
    try {
      setLoading(true);
      const params = { limit: 30 };
      if (query) params.search = query;
      const response = await axios.get('/api/v1/customers', { params });
      setCustomers(response.data.data.customers);
    } catch (err) {
      console.error('Customer fetch error:', err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce((query) => fetchCustomers(query), 300),
    []
  );

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    debouncedSearch(val);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-lg bg-white sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Select Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by name, phone, or email..."
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {initialLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <p>No customers found</p>
              {search && <p className="text-sm mt-1">Try a different search term</p>}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {customers.map((cust) => (
                <button
                  key={cust.id}
                  onClick={() => { onSelect(cust); onClose(); }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="font-medium text-gray-900">{cust.displayName}</div>
                  <div className="text-sm text-gray-500">
                    {[cust.phone_e164, cust.email].filter(Boolean).join(' • ') || 'No contact info'}
                  </div>
                  {cust.company_name && cust.first_name && (
                    <div className="text-xs text-gray-400">{cust.company_name}</div>
                  )}
                </button>
              ))}
            </div>
          )}
          {loading && !initialLoading && (
            <div className="text-center py-3 text-sm text-gray-400">Searching...</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 shrink-0">
          <button
            onClick={() => { onCreateNew(); onClose(); }}
            className="w-full py-2 text-sm font-medium text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded-md transition-colors"
          >
            + Create new customer
          </button>
        </div>
      </div>
    </div>
  );
}
