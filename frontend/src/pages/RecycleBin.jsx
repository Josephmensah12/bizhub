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

export default function RecycleBin() {
  const { user } = useAuth();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [restoring, setRestoring] = useState(false);
  const [permanentDeleting, setPermanentDeleting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager';

  useEffect(() => {
    fetchDeletedAssets();
  }, [pagination.page, search]);

  const fetchDeletedAssets = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (search) params.search = search;

      const response = await axios.get('/api/v1/assets/deleted', { params });
      setAssets(response.data.data.assets);
      setPagination(prev => ({
        ...prev,
        ...response.data.data.pagination
      }));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to fetch deleted assets');
    } finally {
      setLoading(false);
    }
  };

  // Clear selection when assets change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [assets]);

  // Selection handlers
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(assets.map(a => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id, checked) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const isAllSelected = assets.length > 0 && selectedIds.size === assets.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < assets.length;

  // Restore handler
  const handleRestore = async (ids = null) => {
    const idsToRestore = ids || Array.from(selectedIds);
    if (idsToRestore.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to restore ${idsToRestore.length} item(s)?`
    );
    if (!confirmed) return;

    try {
      setRestoring(true);

      const response = await axios.post('/api/v1/assets/restore', {
        ids: idsToRestore
      });

      const { restoredCount } = response.data.data;
      alert(`Successfully restored ${restoredCount} item(s)`);

      setSelectedIds(new Set());
      fetchDeletedAssets();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to restore items');
    } finally {
      setRestoring(false);
    }
  };

  // Permanent delete handler (Admin only)
  const handlePermanentDelete = async (ids = null) => {
    const idsToDelete = ids || Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    const confirmed = window.confirm(
      `WARNING: This will PERMANENTLY delete ${idsToDelete.length} item(s). This cannot be undone!\n\nAre you absolutely sure?`
    );
    if (!confirmed) return;

    // Double confirmation for safety
    const doubleConfirm = window.confirm(
      'Final confirmation: Permanently delete these items?'
    );
    if (!doubleConfirm) return;

    try {
      setPermanentDeleting(true);

      const response = await axios.delete('/api/v1/assets/permanent', {
        data: { ids: idsToDelete }
      });

      const { deletedCount } = response.data.data;
      alert(`Permanently deleted ${deletedCount} item(s)`);

      setSelectedIds(new Set());
      fetchDeletedAssets();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to permanently delete items');
    } finally {
      setPermanentDeleting(false);
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recycle Bin</h1>
          <p className="text-gray-600 mt-1">Deleted items can be restored or permanently removed</p>
        </div>
        <Link
          to="/inventory"
          className="btn btn-secondary"
        >
          Back to Inventory
        </Link>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by asset tag, serial, make, model..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-medium text-blue-800">
              {selectedIds.size} item(s) selected
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleRestore()}
              disabled={restoring}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restoring ? 'Restoring...' : 'Restore Selected'}
            </button>
            {isAdmin && (
              <button
                onClick={() => handlePermanentDelete()}
                disabled={permanentDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {permanentDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Deleted Assets Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-3">🗑️</div>
            <p>Recycle bin is empty</p>
            <p className="text-sm mt-1">Deleted items will appear here</p>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-center w-12">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={el => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Asset Tag
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Make & Model
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Serial Number
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deleted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deleted By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assets.map((asset) => (
                  <tr key={asset.id} className={`hover:bg-gray-50 ${selectedIds.has(asset.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(asset.id)}
                        onChange={(e) => handleSelectOne(asset.id, e.target.checked)}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {asset.asset_tag}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {asset.category || '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {asset.asset_type}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      <div className="font-medium">{asset.make}</div>
                      <div className="text-gray-500">{asset.model}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 font-mono">
                      {asset.serial_number || '—'}
                    </td>
                    <td className="px-4 py-4 text-center text-sm text-gray-900">
                      {asset.quantity || 1}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(asset.deleted_at)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {asset.deleter?.full_name || '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestore([asset.id])}
                          disabled={restoring}
                          className="text-green-600 hover:text-green-800 disabled:opacity-50"
                        >
                          Restore
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handlePermanentDelete([asset.id])}
                            disabled={permanentDeleting}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            Delete Forever
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} deleted items
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
