import { useState, useEffect } from 'react'
import axios from 'axios'

const ROLES = ['Admin', 'Manager', 'Sales', 'Technician', 'Warehouse']

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [filters, setFilters] = useState({ role: '', is_active: '', search: '' })

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'Sales',
    max_discount_percent: '',
    is_active: true
  })

  useEffect(() => {
    fetchUsers()
  }, [filters.role, filters.is_active])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const params = {}
      if (filters.role) params.role = filters.role
      if (filters.is_active !== '') params.is_active = filters.is_active
      if (filters.search) params.search = filters.search

      const res = await axios.get('/api/v1/users', { params })
      setUsers(res.data.data.users)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    fetchUsers()
  }

  const openCreate = () => {
    setEditingUser(null)
    setForm({
      username: '',
      email: '',
      password: '',
      full_name: '',
      phone: '',
      role: 'Sales',
      max_discount_percent: '',
      is_active: true
    })
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (user) => {
    setEditingUser(user)
    setForm({
      username: user.username,
      email: user.email,
      password: '',
      full_name: user.full_name,
      phone: user.phone || '',
      role: user.role,
      max_discount_percent: user.max_discount_percent != null ? String(user.max_discount_percent) : '',
      is_active: user.is_active
    })
    setFormError(null)
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)

    try {
      const payload = {
        username: form.username,
        email: form.email,
        full_name: form.full_name,
        phone: form.phone || null,
        role: form.role,
        is_active: form.is_active,
        max_discount_percent: form.max_discount_percent !== '' ? parseFloat(form.max_discount_percent) : null
      }

      if (editingUser) {
        await axios.put(`/api/v1/users/${editingUser.id}`, payload)
      } else {
        if (!form.password) {
          setFormError('Password is required for new users')
          setSaving(false)
          return
        }
        await axios.post('/api/v1/users', { ...payload, password: form.password })
      }

      setShowForm(false)
      fetchUsers()
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (userId) => {
    if (!window.confirm('Deactivate this user? They will no longer be able to log in.')) return
    try {
      await axios.delete(`/api/v1/users/${userId}`)
      fetchUsers()
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to deactivate user')
    }
  }

  const handleResetPassword = async (userId) => {
    const newPassword = window.prompt('Enter new password (min 6 characters):')
    if (!newPassword) return
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters')
      return
    }
    try {
      await axios.post(`/api/v1/users/${userId}/reset-password`, { new_password: newPassword })
      alert('Password reset successfully')
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to reset password')
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <button onClick={openCreate} className="btn btn-primary">+ Add User</button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Name, username, email..."
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={filters.role}
              onChange={(e) => setFilters(f => ({ ...f, role: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.is_active}
              onChange={(e) => setFilters(f => ({ ...f, is_active: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {/* Users Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No users found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max Disc.</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 text-sm font-medium text-gray-900">{u.full_name}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{u.username}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{u.email}</td>
                  <td className="px-4 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.role === 'Admin' ? 'bg-purple-100 text-purple-800' :
                      u.role === 'Manager' ? 'bg-blue-100 text-blue-800' :
                      u.role === 'Sales' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-center">
                    {u.max_discount_percent != null ? `${u.max_discount_percent}%` : 'Unlimited'}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => openEdit(u)} className="text-blue-600 hover:text-blue-800">Edit</button>
                      <button onClick={() => handleResetPassword(u.id)} className="text-gray-600 hover:text-gray-800">Reset Pwd</button>
                      {u.is_active && (
                        <button onClick={() => handleDeactivate(u.id)} className="text-red-600 hover:text-red-800">Deactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSave} className="p-6">
              <h2 className="text-lg font-semibold mb-4">
                {editingUser ? 'Edit User' : 'Add User'}
              </h2>

              {formError && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{formError}</div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                      required={!editingUser}
                      minLength={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Min 6 characters"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount %</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.max_discount_percent}
                      onChange={(e) => setForm(f => ({ ...f, max_discount_percent: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Leave empty for role default"
                    />
                    <p className="text-xs text-gray-500 mt-1">Empty = role default (Admin: unlimited, Manager: 35%, Sales: 15%)</p>
                  </div>
                  {editingUser && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Active</label>
                      <select
                        value={form.is_active.toString()}
                        onChange={(e) => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
