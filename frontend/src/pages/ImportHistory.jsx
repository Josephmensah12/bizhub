import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

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
 * Status badge component
 */
function StatusBadge({ status }) {
  const statusStyles = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    completed_with_errors: 'bg-orange-100 text-orange-800',
    failed: 'bg-red-100 text-red-800',
    reverted: 'bg-gray-100 text-gray-800'
  };

  const statusLabels = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    completed_with_errors: 'Partial Success',
    failed: 'Failed',
    reverted: 'Reverted'
  };

  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[status] || 'bg-gray-100 text-gray-800'}`}>
      {statusLabels[status] || status}
    </span>
  );
}

/**
 * Batch Detail Modal
 */
function BatchDetailModal({ batch, onClose, onRevert, isAdmin }) {
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    fetchBatchAssets();
  }, [batch.id]);

  const fetchBatchAssets = async () => {
    try {
      setAssetsLoading(true);
      const response = await axios.get(`/api/v1/import-batches/${batch.id}/assets`, {
        params: { limit: 50, includeDeleted: 'true' }
      });
      setAssets(response.data.data.assets);
    } catch (err) {
      console.error('Error fetching batch assets:', err);
    } finally {
      setAssetsLoading(false);
    }
  };

  const fetchErrors = async () => {
    try {
      setErrorsLoading(true);
      const response = await axios.get(`/api/v1/import-batches/${batch.id}/error-report`);
      setErrors(response.data.data.errors || []);
      setShowErrors(true);
    } catch (err) {
      if (err.response?.data?.error?.code === 'NO_ERRORS') {
        setErrors([]);
        setShowErrors(true);
      } else {
        console.error('Error fetching errors:', err);
      }
    } finally {
      setErrorsLoading(false);
    }
  };

  const handleRevert = async () => {
    try {
      setReverting(true);
      await axios.post(`/api/v1/import-batches/${batch.id}/revert`, {
        reason: revertReason || undefined
      });
      onRevert();
      onClose();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to revert batch');
    } finally {
      setReverting(false);
    }
  };

  const canRevert = isAdmin && ['completed', 'completed_with_errors'].includes(batch.status);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import Batch Details</h2>
            <p className="text-sm text-gray-500">{batch.original_file_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Batch Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500">Status</div>
              <StatusBadge status={batch.status} />
            </div>
            <div>
              <div className="text-sm text-gray-500">Source</div>
              <div className="font-medium">{batch.source_type?.toUpperCase()}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Imported</div>
              <div className="font-medium">{batch.rows_imported || 0} / {batch.rows_total || 0} rows</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Created</div>
              <div className="font-medium">{formatDate(batch.created_at)}</div>
            </div>
          </div>

          {/* Imported By / Reverted By */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-500">Imported By</div>
              <div className="font-medium">{batch.createdBy?.full_name || '—'}</div>
            </div>
            {batch.status === 'reverted' && (
              <div>
                <div className="text-sm text-gray-500">Reverted By</div>
                <div className="font-medium">
                  {batch.revertedBy?.full_name || '—'}
                  {batch.reverted_at && (
                    <span className="text-gray-500 text-sm ml-2">
                      on {formatDate(batch.reverted_at)}
                    </span>
                  )}
                </div>
                {batch.revert_reason && (
                  <div className="text-sm text-gray-600 mt-1">
                    Reason: {batch.revert_reason}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Report Section */}
          {(batch.rows_failed > 0 || batch.status === 'completed_with_errors' || batch.status === 'failed') && (
            <div className="mb-6">
              <button
                onClick={fetchErrors}
                disabled={errorsLoading}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {errorsLoading ? 'Loading...' : showErrors ? 'Hide Error Report' : 'View Error Report'}
                {batch.rows_failed > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                    {batch.rows_failed} errors
                  </span>
                )}
              </button>

              {showErrors && errors.length > 0 && (
                <div className="mt-3 border border-red-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-red-200">
                    <thead className="bg-red-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-red-700">Row</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-red-700">Field</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-red-700">Error</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-red-700">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100 bg-white">
                      {errors.slice(0, 20).map((err, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm">{err.row}</td>
                          <td className="px-4 py-2 text-sm font-medium">{err.field || '—'}</td>
                          <td className="px-4 py-2 text-sm text-red-600">{err.message}</td>
                          <td className="px-4 py-2 text-sm text-gray-500 font-mono truncate max-w-[200px]">
                            {err.value || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {errors.length > 20 && (
                    <div className="px-4 py-2 bg-red-50 text-sm text-red-700">
                      Showing 20 of {errors.length} errors
                    </div>
                  )}
                </div>
              )}

              {showErrors && errors.length === 0 && (
                <div className="mt-3 p-4 bg-gray-50 rounded text-gray-500 text-sm">
                  No error details available
                </div>
              )}
            </div>
          )}

          {/* Assets List */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Assets from this batch</h3>
            {assetsLoading ? (
              <div className="text-center py-4 text-gray-500">Loading assets...</div>
            ) : assets.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No assets found</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Asset Tag</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Make/Model</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {assets.map((asset) => (
                      <tr key={asset.id} className={asset.deleted_at ? 'bg-gray-100 text-gray-400' : ''}>
                        <td className="px-4 py-2 text-sm">
                          {asset.deleted_at ? (
                            <span className="line-through">{asset.asset_tag}</span>
                          ) : (
                            <Link
                              to={`/inventory/${asset.id}`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {asset.asset_tag}
                            </Link>
                          )}
                          {asset.deleted_at && (
                            <span className="ml-2 text-xs text-gray-400">(deleted)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">{asset.category || '—'}</td>
                        <td className="px-4 py-2 text-sm">{asset.asset_type}</td>
                        <td className="px-4 py-2 text-sm">{asset.make} {asset.model}</td>
                        <td className="px-4 py-2 text-sm">{asset.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer with Revert Button */}
        {canRevert && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {!showRevertConfirm ? (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  Admin action: Revert all {batch.rows_imported} assets from this import
                </span>
                <button
                  onClick={() => setShowRevertConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Revert Batch
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800 font-medium">
                    Warning: This will delete all {batch.rows_imported} assets from this batch.
                  </p>
                  <p className="text-sm text-red-600 mt-1">
                    Sold items cannot be reverted. If this batch contains sold items, the revert will fail.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason for revert (optional)
                  </label>
                  <input
                    type="text"
                    value={revertReason}
                    onChange={(e) => setRevertReason(e.target.value)}
                    placeholder="e.g., Duplicate import, wrong data, test batch..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowRevertConfirm(false);
                      setRevertReason('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRevert}
                    disabled={reverting}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {reverting ? 'Reverting...' : 'Confirm Revert'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportHistory() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);

  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager';

  useEffect(() => {
    fetchBatches();
  }, [pagination.page, statusFilter]);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (statusFilter) params.status = statusFilter;

      const response = await axios.get('/api/v1/import-batches', { params });
      setBatches(response.data.data.batches);
      setPagination(prev => ({
        ...prev,
        ...response.data.data.pagination
      }));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch import history');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleBatchClick = async (batchId) => {
    try {
      const response = await axios.get(`/api/v1/import-batches/${batchId}`);
      setSelectedBatch(response.data.data.batch);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to load batch details');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import History</h1>
          <p className="text-gray-600 mt-1">View and manage bulk import batches</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/inventory"
            className="btn btn-secondary"
          >
            Back to Inventory
          </Link>
          <Link
            to="/inventory/import"
            className="btn btn-primary"
          >
            New Import
          </Link>
        </div>
      </div>

      {/* Status Filter */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="completed_with_errors">Partial Success</option>
            <option value="failed">Failed</option>
            <option value="reverted">Reverted</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Batches Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : batches.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No import batches found.
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    File Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Imported
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Errors
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Imported By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(batch.created_at)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      <div className="max-w-[200px] truncate" title={batch.original_file_name}>
                        {batch.original_file_name}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                      {batch.source_type}
                    </td>
                    <td className="px-4 py-4 text-center text-sm text-gray-900">
                      {batch.rows_total || 0}
                    </td>
                    <td className="px-4 py-4 text-center text-sm">
                      <span className={batch.rows_imported > 0 ? 'text-green-600 font-medium' : 'text-gray-500'}>
                        {batch.rows_imported || 0}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-sm">
                      <span className={batch.rows_failed > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {batch.rows_failed || 0}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge status={batch.status} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {batch.createdBy?.full_name || '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleBatchClick(batch.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} batches
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

      {/* Batch Detail Modal */}
      {selectedBatch && (
        <BatchDetailModal
          batch={selectedBatch}
          onClose={() => setSelectedBatch(null)}
          onRevert={fetchBatches}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
