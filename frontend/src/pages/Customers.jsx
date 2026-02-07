import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Tag badge component
 */
function TagBadge({ tag }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-1">
      {tag}
    </span>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState({
    heardAboutUsOptions: [],
    existingTags: []
  });

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    heardAboutUs: '',
    tags: '',
    missingPhone: false,
    missingEmail: false
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Fetch options on mount
  useEffect(() => {
    fetchOptions();
  }, []);

  // Fetch customers when filters or pagination changes
  useEffect(() => {
    fetchCustomers();
  }, [pagination.page, filters]);

  const fetchOptions = async () => {
    try {
      const response = await axios.get('/api/v1/customers/options');
      setOptions(response.data.data);
    } catch (err) {
      console.error('Error fetching options:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };

      if (filters.search) params.search = filters.search;
      if (filters.heardAboutUs) params.heardAboutUs = filters.heardAboutUs;
      if (filters.tags) params.tags = filters.tags;
      if (filters.missingPhone) params.missingPhone = 'true';
      if (filters.missingEmail) params.missingEmail = 'true';

      const response = await axios.get('/api/v1/customers', { params });
      setCustomers(response.data.data.customers);
      setPagination(prev => ({
        ...prev,
        ...response.data.data.pagination
      }));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) {
      return;
    }

    try {
      await axios.delete(`/api/v1/customers/${id}`);
      fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete customer');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <div className="flex gap-3">
          <Link
            to="/customers/import"
            className="btn btn-secondary"
          >
            Import Customers
          </Link>
          <Link
            to="/customers/add"
            className="btn btn-primary"
          >
            Add Customer
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Name, phone, email..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Heard About Us
            </label>
            <select
              value={filters.heardAboutUs}
              onChange={(e) => handleFilterChange('heardAboutUs', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Sources</option>
              {options.heardAboutUsOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <select
              value={filters.tags}
              onChange={(e) => handleFilterChange('tags', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Tags</option>
              {options.existingTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <div className="flex gap-4">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={filters.missingPhone}
                  onChange={(e) => handleFilterChange('missingPhone', e.target.checked)}
                  className="mr-2"
                />
                Missing Phone
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={filters.missingEmail}
                  onChange={(e) => handleFilterChange('missingEmail', e.target.checked)}
                  className="mr-2"
                />
                Missing Email
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Customers Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No customers found. Try adjusting your filters.
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    WhatsApp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tags
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {customer.displayName}
                      </Link>
                      {customer.company_name && customer.first_name && (
                        <div className="text-xs text-gray-500">{customer.company_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {customer.phone_e164 ? (
                        <a
                          href={`tel:${customer.phone_e164}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {customer.phone_raw || customer.phone_e164}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {customer.whatsapp_e164 ? (
                        <a
                          href={`https://wa.me/${customer.whatsapp_e164.replace('+', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-800"
                        >
                          {customer.whatsapp_same_as_phone ? 'Same' : customer.whatsapp_raw || customer.whatsapp_e164}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {customer.email ? (
                        <a
                          href={`mailto:${customer.email}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {customer.email}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {customer.heard_about_us || '—'}
                    </td>
                    <td className="px-4 py-4">
                      {customer.tags && customer.tags.length > 0 ? (
                        <div className="flex flex-wrap">
                          {customer.tags.slice(0, 3).map(tag => (
                            <TagBadge key={tag} tag={tag} />
                          ))}
                          {customer.tags.length > 3 && (
                            <span className="text-xs text-gray-500">+{customer.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatDate(customer.updated_at)}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <div className="flex gap-2">
                        <Link
                          to={`/customers/${customer.id}/edit`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(customer.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} customers
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
