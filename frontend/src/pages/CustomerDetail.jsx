import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * Format date for display
 */
function formatDate(dateString) {
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
 * Tag badge component
 */
function TagBadge({ tag }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2 mb-1">
      {tag}
    </span>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [mergeHistory, setMergeHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/v1/customers/${id}`);
      setCustomer(response.data.data.customer);
      setMergeHistory(response.data.data.mergeHistory || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch customer');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this customer?')) {
      return;
    }

    try {
      await axios.delete(`/api/v1/customers/${id}`);
      navigate('/customers');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to delete customer');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded">
        {error || 'Customer not found'}
      </div>
    );
  }

  const whatsappNumber = customer.whatsapp_e164 || (customer.whatsapp_same_as_phone ? customer.phone_e164 : null);

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link to="/customers" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
            &larr; Back to Customers
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{customer.displayName}</h1>
          {customer.company_name && customer.first_name && (
            <p className="text-gray-600">{customer.company_name}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Link
            to={`/customers/${id}/edit`}
            className="btn btn-secondary"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            className="btn btn-danger"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              {whatsappNumber && (
                <a
                  href={`https://wa.me/${whatsappNumber.replace('+', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              )}
              {customer.phone_e164 && (
                <a
                  href={`tel:${customer.phone_e164}`}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call
                </a>
              )}
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </a>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">Phone</label>
                <p className="font-medium">
                  {customer.phone_raw || customer.phone_e164 || '—'}
                  {customer.phone_e164 && customer.phone_raw && (
                    <span className="text-sm text-gray-500 ml-2">({customer.phone_e164})</span>
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">WhatsApp</label>
                <p className="font-medium">
                  {customer.whatsapp_same_as_phone ? (
                    <span className="text-gray-600">Same as phone</span>
                  ) : (
                    customer.whatsapp_raw || customer.whatsapp_e164 || '—'
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Email</label>
                <p className="font-medium">{customer.email || '—'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Address</label>
                <p className="font-medium">{customer.address || '—'}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Notes</h2>
            {customer.notes ? (
              <pre className="whitespace-pre-wrap font-sans text-gray-700">{customer.notes}</pre>
            ) : (
              <p className="text-gray-500">No notes</p>
            )}
          </div>

          {/* Merge History */}
          {mergeHistory.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Merge History</h2>
              <div className="space-y-3">
                {mergeHistory.map((log) => (
                  <div key={log.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">
                        Merged by {log.mergedBy?.full_name || 'System'}
                      </span>
                      <span className="text-gray-500">{formatDate(log.merged_at)}</span>
                    </div>
                    {log.diff_json && Object.keys(log.diff_json).length > 0 && (
                      <div className="text-gray-600 text-xs">
                        Fields updated: {Object.keys(log.diff_json).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Source & Tags */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-500">Heard About Us</label>
                <p className="font-medium">
                  {customer.heard_about_us || '—'}
                  {customer.heard_about_us === 'Other' && customer.heard_about_us_other_text && (
                    <span className="text-gray-600"> - {customer.heard_about_us_other_text}</span>
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Tags</label>
                <div className="mt-1">
                  {customer.tags && customer.tags.length > 0 ? (
                    <div className="flex flex-wrap">
                      {customer.tags.map(tag => (
                        <TagBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No tags</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Audit Info */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Record Info</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500">Created</label>
                <p>{formatDate(customer.created_at)}</p>
                {customer.creator && (
                  <p className="text-gray-500">by {customer.creator.full_name}</p>
                )}
              </div>
              <div>
                <label className="text-gray-500">Last Updated</label>
                <p>{formatDate(customer.updated_at)}</p>
                {customer.updater && (
                  <p className="text-gray-500">by {customer.updater.full_name}</p>
                )}
              </div>
              <div>
                <label className="text-gray-500">Customer ID</label>
                <p className="font-mono">{customer.id}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
