import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Layout
import Layout from './components/layout/Layout'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import AssetDetail from './pages/AssetDetail'
import AddAsset from './pages/AddAsset'
import EditAsset from './pages/EditAsset'
import InventoryImportWizard from './pages/InventoryImportWizard'
import ImportHistory from './pages/ImportHistory'
import RecycleBin from './pages/RecycleBin'
import Sales from './pages/Sales'
import Invoices from './pages/Invoices'
import InvoiceCreate from './pages/InvoiceCreate'
import InvoiceDetail from './pages/InvoiceDetail'
import Preorders from './pages/Preorders'
import Repairs from './pages/Repairs'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import CustomerForm from './pages/CustomerForm'
import CustomerImport from './pages/CustomerImport'
import Reports from './pages/Reports'
import CurrencySettings from './pages/CurrencySettings'
import CompanyProfile from './pages/CompanyProfile'
import Payments from './pages/Payments'
import UserManagement from './pages/UserManagement'

// Protected Route Component
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

// Role-gated Route — redirects to dashboard if user lacks required role
function RoleRoute({ roles, children }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="inventory/add" element={<RoleRoute roles={['Admin', 'Manager', 'Warehouse']}><AddAsset /></RoleRoute>} />
        <Route path="inventory/import" element={<RoleRoute roles={['Admin', 'Manager', 'Warehouse']}><InventoryImportWizard /></RoleRoute>} />
        <Route path="inventory/import-history" element={<RoleRoute roles={['Admin', 'Manager', 'Warehouse']}><ImportHistory /></RoleRoute>} />
        <Route path="inventory/recycle-bin" element={<RoleRoute roles={['Admin']}><RecycleBin /></RoleRoute>} />
        <Route path="inventory/:id" element={<AssetDetail />} />
        <Route path="inventory/:id/edit" element={<RoleRoute roles={['Admin', 'Manager', 'Warehouse', 'Technician']}><EditAsset /></RoleRoute>} />
        <Route path="assets/:id" element={<AssetDetail />} />
        <Route path="sales" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><Sales /></RoleRoute>} />
        <Route path="sales/invoices" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><Invoices /></RoleRoute>} />
        <Route path="sales/invoices/new" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><InvoiceCreate /></RoleRoute>} />
        <Route path="sales/invoices/:id" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><InvoiceDetail /></RoleRoute>} />
        <Route path="sales/invoices/:id/edit" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><InvoiceCreate /></RoleRoute>} />
        <Route path="sales/payments" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><Payments /></RoleRoute>} />
        <Route path="preorders" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><Preorders /></RoleRoute>} />
        <Route path="repairs" element={<RoleRoute roles={['Admin', 'Manager', 'Technician']}><Repairs /></RoleRoute>} />
        <Route path="customers" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><Customers /></RoleRoute>} />
        <Route path="customers/add" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><CustomerForm /></RoleRoute>} />
        <Route path="customers/import" element={<RoleRoute roles={['Admin', 'Manager']}><CustomerImport /></RoleRoute>} />
        <Route path="customers/:id" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><CustomerDetail /></RoleRoute>} />
        <Route path="customers/:id/edit" element={<RoleRoute roles={['Admin', 'Manager', 'Sales']}><CustomerForm /></RoleRoute>} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<RoleRoute roles={['Admin']}><UserManagement /></RoleRoute>} />
        <Route path="settings/currency" element={<RoleRoute roles={['Admin', 'Manager']}><CurrencySettings /></RoleRoute>} />
        <Route path="settings/company-profile" element={<RoleRoute roles={['Admin', 'Manager']}><CompanyProfile /></RoleRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
