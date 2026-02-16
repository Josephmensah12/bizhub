import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

let cachedPermissions = null
let cacheUserId = null

export function usePermissions() {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState(cacheUserId === user?.id ? cachedPermissions : null)
  const [loading, setLoading] = useState(!permissions)

  const fetchPermissions = useCallback(async () => {
    if (!user) return
    // Use cache if same user
    if (cachedPermissions && cacheUserId === user.id) {
      setPermissions(cachedPermissions)
      setLoading(false)
      return
    }
    try {
      const res = await axios.get('/api/v1/auth/permissions')
      const perms = res.data.data
      cachedPermissions = perms
      cacheUserId = user.id
      setPermissions(perms)
    } catch (err) {
      console.error('Failed to fetch permissions:', err)
      // Fallback: derive from user.role locally
      const role = user.role
      const fallback = {
        role,
        canSeeCost: ['Admin', 'Manager'].includes(role),
        canSeeProfit: role === 'Admin',
        canDelete: role === 'Admin',
        canManageUsers: role === 'Admin',
        canProcessReturns: ['Admin', 'Manager'].includes(role),
        canImport: ['Admin', 'Manager', 'Warehouse'].includes(role),
        canExport: ['Admin', 'Manager'].includes(role),
        canEditInvoices: ['Admin', 'Manager'].includes(role),
        canVoidInvoices: ['Admin', 'Manager'].includes(role),
        canEditInventory: ['Admin', 'Manager', 'Warehouse', 'Technician'].includes(role),
        canAddInventory: ['Admin', 'Manager', 'Warehouse'].includes(role),
        canAccessSettings: role === 'Admin',
        canViewSettings: ['Admin', 'Manager'].includes(role),
        maxDiscountPercent: role === 'Admin' ? null : role === 'Manager' ? 35 : 15,
        accessibleReports: role === 'Admin'
          ? ['sales', 'margins', 'products', 'customers', 'staff', 'inventory', 'my-performance', 'reconciliation']
          : role === 'Manager'
            ? ['sales', 'products', 'customers', 'staff', 'inventory', 'my-performance', 'reconciliation']
            : role === 'Sales'
              ? ['my-performance']
              : role === 'Warehouse'
                ? ['inventory', 'my-performance']
                : ['my-performance']
      }
      cachedPermissions = fallback
      cacheUserId = user.id
      setPermissions(fallback)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  return { permissions, loading, refetch: fetchPermissions }
}

// Clear cache on logout
export function clearPermissionsCache() {
  cachedPermissions = null
  cacheUserId = null
}
