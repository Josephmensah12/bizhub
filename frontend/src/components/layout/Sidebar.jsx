import { useState, createContext, useContext } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Sidebar collapse context
const SidebarContext = createContext()
export const useSidebar = () => useContext(SidebarContext)
export { SidebarContext }

// ─── SVG Icons (Heroicons-style, 20x20) ─────────────────────
const Icons = {
  Dashboard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="7" height="8" rx="1.5" />
      <rect x="11" y="2" width="7" height="5" rx="1.5" />
      <rect x="2" y="12" width="7" height="6" rx="1.5" />
      <rect x="11" y="9" width="7" height="9" rx="1.5" />
    </svg>
  ),
  Inventory: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6l8-4 8 4-8 4-8-4z" />
      <path d="M2 10l8 4 8-4" />
      <path d="M2 14l8 4 8-4" />
    </svg>
  ),
  Invoices: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h12a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M7 6h6M7 9h6M7 12h4" />
    </svg>
  ),
  Payments: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <path d="M2 8h16" />
      <path d="M6 12h3" />
    </svg>
  ),
  Preorders: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="16" r="1.5" />
      <circle cx="15" cy="16" r="1.5" />
      <path d="M1 1h3l2 10h10l2-6H6" />
    </svg>
  ),
  StockTakes: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h12a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M7 7l2 2 4-4" />
      <path d="M7 13h6" />
    </svg>
  ),
  Repairs: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000-1.4l-1.6-1.6a1 1 0 00-1.4 0l-10 10V17h3.7l10-10z" />
      <path d="M11 5l4 4" />
    </svg>
  ),
  Customers: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="6" r="3" />
      <path d="M1 17v-1a4 4 0 014-4h4a4 4 0 014 4v1" />
      <circle cx="15" cy="6" r="2" />
      <path d="M15 10a3 3 0 013 3v1" />
    </svg>
  ),
  Reports: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17V8l4 3V5l4 5V3l4 4v10H3z" />
    </svg>
  ),
  Users: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3" />
      <path d="M3 18v-1a5 5 0 0110 0v1" />
      <path d="M14 4l1 1 3-3" />
    </svg>
  ),
  Settings: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1v2M10 17v2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M1 10h2M17 10h2M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4" />
    </svg>
  ),
  Logout: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3" />
      <path d="M13 14l4-4-4-4" />
      <path d="M17 10H7" />
    </svg>
  ),
  Chevron: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6l-4 4-4-4" />
    </svg>
  ),
  Collapse: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  ),
  Plus: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
}

const iconMap = {
  Dashboard: Icons.Dashboard,
  Inventory: Icons.Inventory,
  Invoices: Icons.Invoices,
  Payments: Icons.Payments,
  Preorders: Icons.Preorders,
  'Stock Takes': Icons.StockTakes,
  Repairs: Icons.Repairs,
  Customers: Icons.Customers,
  Reports: Icons.Reports,
  Users: Icons.Users,
  Settings: Icons.Settings,
  Sales: Icons.Invoices,
}

// ─── Navigation Structure (grouped) ─────────────────────────
const navGroups = [
  {
    label: 'MAIN',
    items: [
      { name: 'Dashboard', path: '/', roles: ['Admin', 'Manager', 'Sales', 'Technician', 'Warehouse'] },
    ]
  },
  {
    label: 'SALES',
    items: [
      { name: 'Inventory', path: '/inventory', roles: ['Admin', 'Manager', 'Sales', 'Technician', 'Warehouse'] },
      {
        name: 'Invoices', path: '/sales/invoices', addPath: '/sales/invoices/new',
        roles: ['Admin', 'Manager', 'Sales'],
        matchPaths: ['/sales/invoices', '/sales']
      },
      { name: 'Payments', path: '/sales/payments', roles: ['Admin', 'Manager', 'Sales'] },
      { name: 'Preorders', path: '/preorders', roles: ['Admin', 'Manager', 'Sales'] },
    ]
  },
  {
    label: 'OPERATIONS',
    items: [
      { name: 'Stock Takes', path: '/stock-takes', roles: ['Admin', 'Manager', 'Warehouse'] },
      { name: 'Repairs', path: '/repairs', roles: ['Admin', 'Manager', 'Technician'] },
      { name: 'Customers', path: '/customers', roles: ['Admin', 'Manager', 'Sales'] },
    ]
  },
  {
    label: 'INSIGHTS',
    items: [
      { name: 'Reports', path: '/reports', roles: ['Admin', 'Manager', 'Sales', 'Warehouse'] },
    ]
  },
  {
    label: 'ADMIN',
    items: [
      { name: 'Users', path: '/users', roles: ['Admin'] },
      {
        name: 'Settings', roles: ['Admin', 'Manager'],
        submenu: [
          { name: 'Company Profile', path: '/settings/company-profile' },
          { name: 'Currency', path: '/settings/currency' },
          { name: 'Conditions', path: '/settings/condition-statuses' },
        ]
      },
    ]
  },
]

export default function Sidebar() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const userRole = user?.role
  const [collapsed, setCollapsed] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState(['Settings'])

  const toggleSubmenu = (name) => {
    setExpandedMenus(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const isActive = (item) => {
    if (item.path === '/') return location.pathname === '/'
    if (item.matchPaths) return item.matchPaths.some(p => location.pathname.startsWith(p))
    return location.pathname.startsWith(item.path)
  }

  const isSubmenuActive = (submenu) => submenu.some(s => location.pathname.startsWith(s.path))

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <div
        className={`flex flex-col bg-navy-900 transition-all duration-200 ease-in-out ${collapsed ? 'w-[48px]' : 'w-64'}`}
        style={{ minHeight: '100vh' }}
      >
        {/* Logo + collapse toggle */}
        <div className={`flex items-center ${collapsed ? 'justify-center py-4' : 'justify-between px-5 py-4'} border-b border-white/10`}>
          {collapsed ? (
            <button onClick={() => setCollapsed(false)} className="text-white font-bold text-lg hover:text-primary-400 transition-colors" title="Expand">B</button>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-bold text-white tracking-wide">BIZHUB</h1>
                <p className="text-xs text-gray-400 mt-0.5">Payless4Tech</p>
              </div>
              <button onClick={() => setCollapsed(true)} className="text-gray-400 hover:text-white transition-colors" title="Collapse">
                {Icons.Collapse}
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-1">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(item => !userRole || item.roles.includes(userRole))
            if (visibleItems.length === 0) return null
            return (
              <div key={group.label}>
                {/* Group label */}
                {!collapsed && (
                  <div className="px-5 pt-3 pb-0.5">
                    <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">{group.label}</span>
                  </div>
                )}
                {collapsed && <div className="h-2" />}

                {visibleItems.map((item) => {
                  if (item.submenu) {
                    // Submenu parent
                    const subActive = isSubmenuActive(item.submenu)
                    return (
                      <div key={item.name}>
                        <button
                          onClick={() => !collapsed && toggleSubmenu(item.name)}
                          title={collapsed ? item.name : undefined}
                          className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-4'} py-2 mx-auto transition-colors rounded-lg ${collapsed ? 'mx-1' : 'mx-2'} ${
                            subActive
                              ? 'bg-primary-600/20 text-white'
                              : 'text-gray-400 hover:bg-navy-700 hover:text-white'
                          }`}
                        >
                          <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                            <span className="shrink-0">{iconMap[item.name] || Icons.Settings}</span>
                            {!collapsed && <span className="text-sm">{item.name}</span>}
                          </div>
                          {!collapsed && (
                            <span className={`transition-transform duration-200 ${expandedMenus.includes(item.name) ? 'rotate-180' : ''}`}>
                              {Icons.Chevron}
                            </span>
                          )}
                        </button>
                        {!collapsed && expandedMenus.includes(item.name) && (
                          <div className="ml-5">
                            {item.submenu.map(sub => (
                              <NavLink
                                key={sub.path}
                                to={sub.path}
                                className={({ isActive: active }) =>
                                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors mx-2 ${
                                    active
                                      ? 'text-white bg-primary-600/20'
                                      : 'text-gray-400 hover:text-white hover:bg-navy-700'
                                  }`
                                }
                              >
                                <span className="w-1 h-1 rounded-full bg-current" />
                                <span>{sub.name}</span>
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  // Regular item
                  const active = isActive(item)
                  return (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      end={item.path === '/'}
                      title={collapsed ? item.name : undefined}
                      className={() =>
                        `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2 rounded-lg transition-colors ${collapsed ? 'mx-1' : 'mx-2'} relative ${
                          active
                            ? 'bg-primary-600/20 text-white'
                            : 'text-gray-400 hover:bg-navy-700 hover:text-white'
                        }`
                      }
                    >
                      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r" />}
                      <span className="shrink-0">{iconMap[item.name] || Icons.Dashboard}</span>
                      {!collapsed && <span className="text-sm">{item.name}</span>}
                      {!collapsed && item.addPath && (
                        <NavLink
                          to={item.addPath}
                          onClick={e => e.stopPropagation()}
                          className="ml-auto p-1 text-gray-500 hover:text-white rounded transition-colors"
                          title={`New ${item.name.slice(0, -1) || item.name}`}
                        >
                          {Icons.Plus}
                        </NavLink>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* User footer */}
        <div className={`border-t border-white/10 ${collapsed ? 'py-3 flex justify-center' : 'p-4'}`}>
          {collapsed ? (
            <button
              onClick={() => { logout(); window.location.href = '/login' }}
              className="w-8 h-8 rounded-full bg-primary-600/30 flex items-center justify-center text-white text-xs font-bold"
              title={`${user?.full_name} - Logout`}
            >
              {initials}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-600/30 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-400">{user?.role}</p>
              </div>
              <button
                onClick={() => { logout(); window.location.href = '/login' }}
                className="text-gray-400 hover:text-white transition-colors shrink-0"
                title="Logout"
              >
                {Icons.Logout}
              </button>
            </div>
          )}
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
