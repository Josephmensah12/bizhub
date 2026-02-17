import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Route-to-title mapping
const routeTitles = {
  '/': 'Dashboard',
  '/inventory': 'Inventory',
  '/inventory/add': 'Add Asset',
  '/inventory/import': 'Import Inventory',
  '/inventory/import-history': 'Import History',
  '/inventory/import-units': 'Import Units',
  '/inventory/recycle-bin': 'Recycle Bin',
  '/sales': 'Sales',
  '/sales/invoices': 'Invoices',
  '/sales/invoices/new': 'New Invoice',
  '/sales/payments': 'Payments',
  '/preorders': 'Preorders',
  '/stock-takes': 'Stock Takes',
  '/repairs': 'Repairs',
  '/customers': 'Customers',
  '/customers/add': 'New Customer',
  '/customers/import': 'Import Customers',
  '/reports': 'Reports',
  '/users': 'User Management',
  '/settings/currency': 'Currency Settings',
  '/settings/company-profile': 'Company Profile',
  '/settings/condition-statuses': 'Condition Statuses',
}

function getBreadcrumbs(pathname) {
  const segments = pathname.split('/').filter(Boolean)
  const crumbs = []
  let path = ''
  for (const seg of segments) {
    path += '/' + seg
    const title = routeTitles[path]
    if (title) crumbs.push({ label: title, path })
    else if (/^[0-9a-f-]+$/i.test(seg)) crumbs.push({ label: 'Detail', path })
    else crumbs.push({ label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '), path })
  }
  return crumbs
}

function getPageTitle(pathname) {
  // Try exact match first
  if (routeTitles[pathname]) return routeTitles[pathname]
  // Try removing trailing dynamic segments for detail pages
  const segments = pathname.split('/').filter(Boolean)
  while (segments.length > 0) {
    const test = '/' + segments.join('/')
    if (routeTitles[test]) return routeTitles[test]
    segments.pop()
  }
  return 'Dashboard'
}

export default function TopBar() {
  const { user } = useAuth()
  const location = useLocation()
  const breadcrumbs = getBreadcrumbs(location.pathname)
  const pageTitle = getPageTitle(location.pathname)

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center px-8 shrink-0">
      {/* Left: Page title + breadcrumbs */}
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 truncate">{pageTitle}</h2>
        {breadcrumbs.length > 1 && (
          <nav className="flex items-center gap-1 text-xs text-gray-400 -mt-0.5">
            <span className="text-gray-400">Home</span>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4.5 3l3 3-3 3" />
                </svg>
                <span className={i === breadcrumbs.length - 1 ? 'text-gray-600 font-medium' : ''}>
                  {crumb.label}
                </span>
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Right: Search + Notification + User */}
      <div className="flex items-center gap-3">
        {/* Search icon */}
        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="6" />
            <path d="M13.5 13.5L17 17" />
          </svg>
        </button>

        {/* Notification bell */}
        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors relative">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2a5 5 0 015 5c0 4 2 5 2 5H3s2-1 2-5a5 5 0 015-5z" />
            <path d="M8.5 17a1.5 1.5 0 003 0" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200" />

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold">
            {initials}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-800 leading-tight">{user?.full_name}</p>
            <p className="text-xs text-gray-400 leading-tight">{user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
