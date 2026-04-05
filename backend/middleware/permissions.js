/**
 * Role-Based Access Control (RBAC) permission helpers and middleware.
 */

function canSeeCost(role) {
  return role === 'Admin';
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

function canAccessFinancialReports(role) {
  return role === 'Admin';
}

function canSeeSourcing(role) {
  return role === 'Admin';
}

function canManageWarranty(role) {
  return ['Admin', 'Manager'].includes(role);
}

function canAccessSourcingReports(role) {
  return role === 'Admin';
}

function canManageExpenses(role) {
  return ['Admin', 'Manager'].includes(role);
}

function canCreateExpenses(role) {
  return ['Admin', 'Manager', 'Sales'].includes(role);
}

function canViewSensitiveExpenses(role) {
  return role === 'Admin';
}

function canViewSettings(role) {
  return ['Admin', 'Manager'].includes(role);
}

const REPORT_ACCESS = {
  Admin: ['sales', 'margins', 'products', 'customers', 'staff', 'inventory', 'my-performance', 'reconciliation'],
  Manager: ['my-performance'],
  Sales: ['my-performance'],
  Technician: ['my-performance'],
  Warehouse: ['my-performance']
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
    canAccessFinancialReports: canAccessFinancialReports(role),
    canManageExpenses: canManageExpenses(role),
    canCreateExpenses: canCreateExpenses(role),
    canViewSensitiveExpenses: canViewSensitiveExpenses(role),
    canSeeSourcing: canSeeSourcing(role),
    canManageWarranty: canManageWarranty(role),
    canAccessSourcingReports: canAccessSourcingReports(role),
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
 * Strip sourcing fields from a unit object based on role.
 */
function sanitizeUnitForRole(unit, role) {
  const data = typeof unit.toJSON === 'function' ? unit.toJSON() : { ...unit };

  if (!canSeeSourcing(role)) {
    delete data.sourcing_batch_id;
    delete data.supplier_sku;
    delete data.supplier_grade;
    delete data.buy_decision;
    delete data.landed_cost_ghs;
    delete data.projected_sell_price_ghs;
    delete data.projected_margin_percent;
    delete data.actual_margin_percent;
    delete data.margin_variance_percent;
    delete data.days_to_sell;
    delete data.sourcingBatch;
    delete data.SourcingBatch;
  }

  if (!canSeeCost(role)) {
    delete data.cost_amount;
    delete data.actual_sell_price_ghs;
  }

  return data;
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
  canAccessFinancialReports,
  canManageExpenses,
  canCreateExpenses,
  canViewSensitiveExpenses,
  canAccessReport,
  accessibleReports,
  defaultMaxDiscount,
  buildPermissions,
  requirePermission,
  canSeeSourcing,
  canManageWarranty,
  canAccessSourcingReports,
  sanitizeUnitForRole,
  sanitizeAssetForRole,
  sanitizeInvoiceForRole
};
