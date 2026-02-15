/**
 * Role-Based Access Control (RBAC) permission helpers and middleware.
 */

function canSeeCost(role) {
  return ['Admin', 'Manager'].includes(role);
}

function canSeeProfit(role) {
  return role === 'Admin';
}

function canDelete(role) {
  return role === 'Admin';
}

function canManageUsers(role) {
  return role === 'Admin';
}

function canProcessReturns(role) {
  return ['Admin', 'Manager'].includes(role);
}

function canImport(role) {
  return ['Admin', 'Manager', 'Warehouse'].includes(role);
}

function canExport(role) {
  return ['Admin', 'Manager'].includes(role);
}

function canEditInvoices(role) {
  return ['Admin', 'Manager'].includes(role);
}

function canVoidInvoices(role) {
  return ['Admin', 'Manager'].includes(role);
}

function canEditInventory(role) {
  return ['Admin', 'Manager', 'Warehouse', 'Technician'].includes(role);
}

function canAddInventory(role) {
  return ['Admin', 'Manager', 'Warehouse'].includes(role);
}

function canAccessSettings(role) {
  return role === 'Admin';
}

function canViewSettings(role) {
  return ['Admin', 'Manager'].includes(role);
}

const REPORT_ACCESS = {
  Admin: ['sales', 'margins', 'products', 'customers', 'staff', 'inventory', 'my-performance'],
  Manager: ['sales', 'products', 'customers', 'staff', 'inventory', 'my-performance'],
  Sales: ['my-performance'],
  Technician: ['my-performance'],
  Warehouse: ['inventory', 'my-performance']
};

function canAccessReport(role, reportTab) {
  return (REPORT_ACCESS[role] || []).includes(reportTab);
}

function accessibleReports(role) {
  return REPORT_ACCESS[role] || [];
}

/**
 * Default max discount percent by role.
 */
function defaultMaxDiscount(role) {
  if (role === 'Admin') return null; // unlimited
  if (role === 'Manager') return 35;
  return 15; // Sales, Technician, Warehouse
}

/**
 * Build a full permissions object for a user.
 */
function buildPermissions(user) {
  const role = user.role;
  const maxDiscount = user.max_discount_percent != null
    ? parseFloat(user.max_discount_percent)
    : defaultMaxDiscount(role);

  return {
    role,
    canSeeCost: canSeeCost(role),
    canSeeProfit: canSeeProfit(role),
    canDelete: canDelete(role),
    canManageUsers: canManageUsers(role),
    canProcessReturns: canProcessReturns(role),
    canImport: canImport(role),
    canExport: canExport(role),
    canEditInvoices: canEditInvoices(role),
    canVoidInvoices: canVoidInvoices(role),
    canEditInventory: canEditInventory(role),
    canAddInventory: canAddInventory(role),
    canAccessSettings: canAccessSettings(role),
    canViewSettings: canViewSettings(role),
    maxDiscountPercent: maxDiscount,
    accessibleReports: accessibleReports(role)
  };
}

/**
 * Middleware factory: require a specific permission.
 * Usage: router.get('/path', requirePermission(canSeeCost), handler)
 */
function requirePermission(permFn) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }
    if (!permFn(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' }
      });
    }
    next();
  };
}

/**
 * Strip cost/profit fields from an asset object based on role.
 */
function sanitizeAssetForRole(asset, role) {
  if (canSeeCost(role)) return asset;
  const data = typeof asset.toJSON === 'function' ? asset.toJSON() : { ...asset };
  delete data.cost_amount;
  delete data.cost_currency;
  delete data.original_cost_amount;
  delete data.original_cost_currency;
  return data;
}

/**
 * Strip cost/profit fields from an invoice object based on role.
 */
function sanitizeInvoiceForRole(invoice, role) {
  const data = typeof invoice.toJSON === 'function' ? invoice.toJSON() : { ...invoice };

  if (!canSeeCost(role)) {
    delete data.total_cost_amount;
    delete data.total_profit_amount;
    delete data.margin_percent;

    // Sanitize items
    if (data.items) {
      data.items = data.items.map(item => {
        const i = { ...item };
        delete i.unit_cost_amount;
        delete i.line_cost_amount;
        delete i.line_profit_amount;
        delete i.original_cost_amount;
        delete i.original_cost_currency;
        return i;
      });
    }
  }

  // Profit data is Admin only
  if (!canSeeProfit(role)) {
    delete data.total_profit_amount;
    delete data.margin_percent;
    if (data.items) {
      data.items = data.items.map(item => {
        const i = { ...item };
        delete i.line_profit_amount;
        return i;
      });
    }
  }

  return data;
}

module.exports = {
  canSeeCost,
  canSeeProfit,
  canDelete,
  canManageUsers,
  canProcessReturns,
  canImport,
  canExport,
  canEditInvoices,
  canVoidInvoices,
  canEditInventory,
  canAddInventory,
  canAccessSettings,
  canViewSettings,
  canAccessReport,
  accessibleReports,
  defaultMaxDiscount,
  buildPermissions,
  requirePermission,
  sanitizeAssetForRole,
  sanitizeInvoiceForRole
};
