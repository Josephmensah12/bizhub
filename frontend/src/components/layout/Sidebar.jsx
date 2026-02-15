import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navigation = [
  {
    name: 'Dashboard',
    path: '/',
    icon: '📊',
    roles: ['Admin', 'Manager', 'Sales', 'Technician', 'Warehouse']
  },
  {
    name: 'Inventory',
    path: '/inventory',
    icon: '📦',
    roles: ['Admin', 'Manager', 'Sales', 'Technician', 'Warehouse']
  },
  {
    name: 'Sales',
    icon: '💰',
    roles: ['Admin', 'Manager', 'Sales'],
    submenu: [
      { name: 'Invoices', path: '/sales/invoices', addPath: '/sales/invoices/new' },
      { name: 'Payments', path: '/sales/payments' }
    ]
  },
  {
    name: 'Preorders',
    path: '/preorders',
    icon: '🛒',
    roles: ['Admin', 'Manager', 'Sales']
  },
  {
    name: 'Stock Takes',
    path: '/stock-takes',
    icon: '📋',
    roles: ['Admin', 'Manager', 'Warehouse']
  },
  {
    name: 'Repairs',
    path: '/repairs',
    icon: '🔧',
    roles: ['Admin', 'Manager', 'Technician']
  },
  {
    name: 'Customers',
    path: '/customers',
    icon: '👥',
    roles: ['Admin', 'Manager', 'Sales']
  },
  {
    name: 'Reports',
    path: '/reports',
    icon: '📈',
    roles: ['Admin', 'Manager', 'Sales', 'Warehouse']
  },
  {
    name: 'Users',
    path: '/users',
    icon: '🔑',
    roles: ['Admin']
  },
  {
    name: 'Settings',
    icon: '⚙️',
    roles: ['Admin', 'Manager'],
    submenu: [
      { name: 'Company Profile', path: '/settings/company-profile' },
      { name: 'Currency', path: '/settings/currency' }
    ]
  }
]

export default function Sidebar() {
  const location = useLocation()
  const { user } = useAuth()
  const userRole = user?.role
  const [expandedMenus, setExpandedMenus] = useState(['Sales', 'Settings']) // Default expanded

  const toggleSubmenu = (name) => {
    setExpandedMenus(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : [...prev, name]
    )
  }

  const isSubmenuActive = (submenu) => {
    return submenu.some(item => location.pathname.startsWith(item.path))
  }

  return (
    <div className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-primary-600">BIZHUB</h1>
        <p className="text-sm text-gray-600 mt-1">Payless4Tech</p>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigation.filter(item => !userRole || item.roles.includes(userRole)).map((item) => (
          <div key={item.name}>
            {item.submenu ? (
              // Menu with submenu
              <div>
                <button
                  onClick={() => toggleSubmenu(item.name)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                    isSubmenuActive(item.submenu)
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.name}</span>
                  </div>
                  <svg
                    className={`w-4 h-4 transition-transform ${
                      expandedMenus.includes(item.name) ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Submenu items */}
                {expandedMenus.includes(item.name) && (
                  <div className="mt-1 ml-4 space-y-1">
                    {item.submenu.map((subItem) => (
                      <div key={subItem.path} className="flex items-center">
                        <NavLink
                          to={subItem.path}
                          className={({ isActive }) =>
                            `flex-1 flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                              isActive
                                ? 'bg-primary-100 text-primary-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`
                          }
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>{subItem.name}</span>
                        </NavLink>
                        {subItem.addPath && (
                          <NavLink
                            to={subItem.addPath}
                            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-lg"
                            title={`Add ${subItem.name.slice(0, -1)}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </NavLink>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Regular menu item
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`
                }
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.name}</span>
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200 text-xs text-gray-500">
        <p>BIZHUB v1.0</p>
        <p>© 2024 Payless4Tech</p>
      </div>
    </div>
  )
}
