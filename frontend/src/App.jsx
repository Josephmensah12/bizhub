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
        <Route path="inventory/add" element={<AddAsset />} />
        <Route path="inventory/import" element={<InventoryImportWizard />} />
        <Route path="inventory/import-history" element={<ImportHistory />} />
        <Route path="inventory/recycle-bin" element={<RecycleBin />} />
        <Route path="inventory/:id" element={<AssetDetail />} />
        <Route path="inventory/:id/edit" element={<EditAsset />} />
        <Route path="assets/:id" element={<AssetDetail />} />
        <Route path="sales" element={<Sales />} />
        <Route path="sales/invoices" element={<Invoices />} />
        <Route path="sales/invoices/new" element={<InvoiceCreate />} />
        <Route path="sales/invoices/:id" element={<InvoiceDetail />} />
        <Route path="sales/invoices/:id/edit" element={<InvoiceCreate />} />
        <Route path="sales/payments" element={<Payments />} />
        <Route path="preorders" element={<Preorders />} />
        <Route path="repairs" element={<Repairs />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/add" element={<CustomerForm />} />
        <Route path="customers/import" element={<CustomerImport />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<CustomerForm />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings/currency" element={<CurrencySettings />} />
        <Route path="settings/company-profile" element={<CompanyProfile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
