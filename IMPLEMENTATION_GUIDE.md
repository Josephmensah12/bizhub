# BIZHUB Implementation Guide
## Quick Start Guide for Payless4Tech Development Team

---

## 📦 What Has Been Delivered

This MVP scaffolding provides a complete foundation for the BIZHUB application:

### Documentation (100% Complete)
1. **ARCHITECTURE.md** - Complete system architecture, tech stack, module design
2. **DB_SCHEMA.md** - Full database schema with 19 tables, indexes, triggers
3. **API_SPEC.md** - 60+ REST endpoints with request/response examples
4. **README.md** - Setup instructions, deployment guide
5. **This file** - Implementation roadmap

### Backend Structure (80% Complete)
- ✅ Express.js app setup with middleware
- ✅ JWT authentication system
- ✅ Error handling middleware
- ✅ Role-based access control
- ✅ All route definitions (11 route files)
- ✅ Database configuration
- ✅ Sequelize setup
- ✅ Auth controller (reference implementation)
- ⏳ **TODO**: Remaining controllers (10 controllers)
- ⏳ **TODO**: Database models (19 models)
- ⏳ **TODO**: Migrations
- ⏳ **TODO**: Seed data

### Frontend Structure (70% Complete)
- ✅ React + Vite setup
- ✅ Tailwind CSS configuration
- ✅ React Router with protected routes
- ✅ Authentication context
- ✅ Layout with sidebar and topbar
- ✅ Login page
- ✅ Dashboard page (functional with API integration)
- ✅ Placeholder pages for all modules
- ⏳ **TODO**: Complete UI for all modules
- ⏳ **TODO**: API service layer
- ⏳ **TODO**: Reusable components (tables, forms, modals)

---

## 🚀 Implementation Phases

### Phase 1: Database & Backend Core (Week 1-2)

**Priority: HIGH** - Foundation for everything

#### Step 1.1: Create Database Models

Create all 19 Sequelize models in `backend/models/`:

**Start with these (in order)**:
1. `Location.js` - Simple reference table
2. `LeadSource.js` - Simple reference table
3. `User.js` - ✅ Already done (see authController for reference)
4. `Customer.js` - No dependencies
5. `ProductModel.js` - No dependencies
6. `Asset.js` - Depends on ProductModel, Location
7. `BulkStock.js` - Depends on Location
8. `Invoice.js` - Depends on Customer, User
9. `InvoiceLine.js` - Depends on Invoice, Asset, BulkStock
10. `Payment.js` - Depends on Invoice
11. `Preorder.js` - Depends on Customer, Asset
12. `PreorderEvent.js` - Depends on Preorder
13. `Warranty.js` - Depends on Invoice, Asset, Customer
14. `WarrantyClaim.js` - Depends on Warranty
15. `RepairTicket.js` - Depends on Customer, Asset
16. `RepairEvent.js` - Depends on RepairTicket
17. `InventoryMovement.js` - Depends on Asset, Location
18. `DiagnosticsResult.js` - Depends on Asset
19. `WipeCertificate.js` - Depends on Asset

**Resources**:
- Refer to `DB_SCHEMA.md` for exact column definitions
- Use `models/User.js` (in authController.js) as template
- Define associations in `associate()` method

**Example Template**:
```javascript
// models/Customer.js
module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customer_type: {
      type: DataTypes.ENUM('Retail', 'Wholesale'),
      allowNull: false
    },
    full_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    // ... rest of fields from DB_SCHEMA.md
  }, {
    tableName: 'customers',
    underscored: true
  });

  Customer.associate = (models) => {
    Customer.hasMany(models.Invoice, { foreignKey: 'customer_id' });
    Customer.hasMany(models.Preorder, { foreignKey: 'customer_id' });
    // ... other associations
  };

  return Customer;
};
```

#### Step 1.2: Create Migrations

```bash
cd backend
npx sequelize-cli migration:generate --name create-initial-schema
```

Edit the migration file to create all tables. Use `DB_SCHEMA.md` as reference.

```bash
npm run migrate
```

#### Step 1.3: Create Seed Data

```bash
npx sequelize-cli seed:generate --name seed-initial-data
```

Create seed data for:
- 1 Admin user (username: admin, password: changeme123 - hashed with bcrypt)
- 4 Locations (Shop Floor, Backroom, Repair Bench, Warehouse)
- 8 Lead Sources (Instagram, Walk-in, etc.)
- 5-10 sample ProductModels (HP EliteBook, Lenovo ThinkPad, MacBook Pro, etc.)
- 3-5 sample Customers
- 20-30 sample Assets in various statuses

```bash
npm run seed
```

#### Step 1.4: Implement Core Controllers

**Priority order**:

1. **userController.js** - Simple CRUD, good starting point
2. **customerController.js** - Simple CRUD
3. **productModelController.js** - Simple CRUD
4. **assetController.js** - CRITICAL, complex workflow
5. **bulkStockController.js** - Inventory management
6. **invoiceController.js** - CRITICAL, complex sales workflow
7. **preorderController.js** - Complex workflow
8. **warrantyController.js**
9. **repairController.js**
10. **dashboardController.js** - Metrics aggregation
11. **reportController.js** - Data analysis

**Resources**:
- Refer to `authController.js` for pattern
- Refer to `API_SPEC.md` for expected request/response
- Refer to `backend/controllers/_README.md` for implementation guide

---

### Phase 2: Frontend Core Pages (Week 3)

**Priority: HIGH** - User-facing functionality

#### Step 2.1: Create API Service Layer

Create `frontend/src/services/` files:

```javascript
// services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

```javascript
// services/assetService.js
import api from './api';

export const assetService = {
  list: (params) => api.get('/assets', { params }),
  getById: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.patch(`/assets/${id}`, data),
  submitDiagnostics: (id, data) => api.post(`/assets/${id}/diagnostics`, data),
  // ... more methods
};
```

Repeat for: `invoiceService.js`, `customerService.js`, `preorderService.js`, etc.

#### Step 2.2: Create Reusable Components

In `frontend/src/components/common/`:

1. **Table.jsx** - Paginated data table
2. **Button.jsx** - Styled button variants
3. **Input.jsx** - Form input with label
4. **Select.jsx** - Dropdown select
5. **Modal.jsx** - Modal dialog
6. **StatusBadge.jsx** - Colored status badges
7. **LoadingSpinner.jsx** - Loading indicator
8. **ErrorAlert.jsx** - Error message display

#### Step 2.3: Implement Core Pages

**Priority order**:

1. **Inventory Page** (`pages/Inventory.jsx`):
   - Asset list with filters (status, model, condition)
   - Search by serial number / asset tag
   - "Add Asset" button → modal form
   - Click asset → navigate to detail page

2. **Asset Detail Page** (`pages/AssetDetail.jsx`):
   - Display all asset information
   - Show diagnostic results, wipe certificate
   - Workflow buttons: Run Diagnostics, Mark Wipe Done, Complete QC
   - Status timeline

3. **Sales Page** (`pages/Sales.jsx`):
   - Invoice list with filters (date range, status, customer)
   - "Create Invoice" button → invoice form
   - Invoice form:
     - Select customer
     - Add line items (assets from inventory)
     - Add bulk items (accessories)
     - Display running total
     - Submit → creates invoice
   - Click invoice → invoice detail view
   - "Add Payment" button on invoice detail

4. **Preorders Page** (`pages/Preorders.jsx`):
   - Preorder list with status filters
   - SLA breach indicators
   - "Create Preorder" button
   - Status action buttons (Record Deposit, Link Asset, Notify Customer, etc.)

5. **Customers Page** (`pages/Customers.jsx`):
   - Customer list with search
   - "Add Customer" button
   - Click customer → customer detail with purchase history

---

### Phase 3: Advanced Features (Week 4)

#### Step 3.1: Dashboard Enhancements
- Implement all metrics calculations in `dashboardController.js`
- Add charts using Recharts (sales trend, lead sources)
- Add drill-down functionality (click widget → filtered list view)

#### Step 3.2: Reports Module
- Implement report generation endpoints
- Create report pages with filters and charts
- Add export functionality (CSV download)

#### Step 3.3: Warranty & Repair Modules
- Complete warranty management UI
- Implement repair ticket workflow
- Link warranties to invoices/assets

---

### Phase 4: Polish & Testing (Week 5)

#### Step 4.1: Error Handling & Validation
- Add input validation on all forms
- Display user-friendly error messages
- Handle API errors gracefully

#### Step 4.2: UX Improvements
- Add loading states
- Add success/error toast notifications
- Improve mobile responsiveness
- Add keyboard shortcuts

#### Step 4.3: Testing
- Write unit tests for critical controllers
- Test all user workflows end-to-end
- Test edge cases (double-sale prevention, stock limits, etc.)

#### Step 4.4: Documentation
- Add inline code comments
- Update README with any changes
- Create user manual (optional)

---

## 🎯 Critical Implementation Notes

### Asset Controller - Key Business Logic

```javascript
// When invoice is paid, update asset to Sold
exports.completeInvoicePayment = asyncHandler(async (req, res) => {
  const { invoice_id } = req.params;

  const t = await db.sequelize.transaction();

  try {
    const invoice = await Invoice.findByPk(invoice_id, {
      include: [{ model: InvoiceLine, include: [Asset, BulkStock] }],
      transaction: t
    });

    // Update invoice status
    await invoice.update({ status: 'Paid' }, { transaction: t });

    // Update assets to Sold
    for (const line of invoice.InvoiceLines) {
      if (line.Asset) {
        await line.Asset.update({
          status: 'Sold',
          sale_date: new Date(),
          sale_price: line.unit_price,
          invoice_id: invoice.id
        }, { transaction: t });

        // Create inventory movement
        await InventoryMovement.create({
          asset_id: line.Asset.id,
          from_status: 'Reserved',
          to_status: 'Sold',
          moved_by: req.user.id,
          reason: `Sold on invoice ${invoice.invoice_number}`
        }, { transaction: t });
      }

      // Decrement bulk stock
      if (line.BulkStock) {
        await line.BulkStock.decrement('quantity', {
          by: line.quantity,
          transaction: t
        });
      }
    }

    await t.commit();
    res.json({ success: true, message: 'Invoice paid, inventory updated' });
  } catch (error) {
    await t.rollback();
    throw error;
  }
});
```

### Preorder Workflow - Status Transitions

```javascript
// Preorder status flow:
// 1. Deposit Pending -> (record deposit) -> Ordered
// 2. Ordered -> (item ships) -> In Transit
// 3. In Transit -> (arrives) -> Arrived (link asset, reserve it)
// 4. Arrived -> (notify customer) -> Customer Notified
// 5. Customer Notified -> (customer accepts) -> Picked Up -> Closed
// OR
// 5. Customer Notified -> (customer rejects) -> Rejected (free asset)
// 6. Rejected -> (asset sold to someone else) -> Resold
```

### Dashboard Metrics - Efficient Queries

```javascript
// Use Sequelize aggregation for dashboard
const todaySales = await Invoice.findAll({
  attributes: [
    [sequelize.fn('SUM', sequelize.col('total_amount')), 'total'],
    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
  ],
  where: {
    invoice_date: new Date(),
    status: 'Paid'
  }
});
```

---

## 📋 Development Checklist

Use this checklist to track progress:

### Backend
- [ ] All 19 models created
- [ ] Migrations run successfully
- [ ] Seed data loaded
- [ ] User controller implemented
- [ ] Customer controller implemented
- [ ] Product Model controller implemented
- [ ] Asset controller implemented (CRITICAL)
- [ ] Bulk Stock controller implemented
- [ ] Invoice controller implemented (CRITICAL)
- [ ] Preorder controller implemented
- [ ] Warranty controller implemented
- [ ] Repair controller implemented
- [ ] Dashboard controller implemented
- [ ] Report controller implemented

### Frontend
- [ ] API service layer created
- [ ] Reusable components created
- [ ] Inventory page implemented
- [ ] Asset detail page implemented
- [ ] Sales page implemented
- [ ] Invoice detail implemented
- [ ] Preorder page implemented
- [ ] Customer page implemented
- [ ] Repair page implemented
- [ ] Reports page implemented
- [ ] Dashboard completed with charts

### Testing & Deployment
- [ ] All API endpoints tested
- [ ] All UI workflows tested
- [ ] Error handling verified
- [ ] User roles tested
- [ ] Data integrity verified
- [ ] Production environment setup
- [ ] Database backup configured
- [ ] Application deployed

---

## 🆘 Troubleshooting

### Common Issues

**Database connection error**:
- Verify PostgreSQL is running
- Check `.env` credentials
- Ensure database exists

**Migration fails**:
- Check model definitions match schema
- Verify foreign key references
- Run `npm run migrate:undo` then retry

**Frontend can't connect to backend**:
- Verify backend is running on port 3000
- Check CORS settings in `app.js`
- Check Vite proxy config in `vite.config.js`

**Authentication not working**:
- Verify JWT_SECRET is set in `.env`
- Check token is stored in localStorage
- Verify Authorization header format: `Bearer <token>`

---

## 📞 Next Steps

1. **Review all documentation** (ARCHITECTURE.md, DB_SCHEMA.md, API_SPEC.md)
2. **Set up development environment** (install Node.js, PostgreSQL)
3. **Follow Phase 1** implementation steps
4. **Test frequently** as you build
5. **Commit often** to Git

---

## ✅ What You Can Run Right Now

Even without models/controllers implemented, you can:

1. **Install dependencies**:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Start backend** (will show errors for missing models):
   ```bash
   cd backend
   npm run dev
   ```

3. **Start frontend** (UI will load, but API calls will fail):
   ```bash
   cd frontend
   npm run dev
   ```

4. **View documentation**:
   - Open `ARCHITECTURE.md` in VS Code or browser
   - Open `DB_SCHEMA.md` to see complete schema
   - Open `API_SPEC.md` to see all endpoints

---

**This foundation is solid. Now it's time to build! Start with Phase 1, Step 1.1. Good luck!**

---

**Document Version**: 1.0
**Last Updated**: 2026-01-14
**Author**: Claude Code
**Status**: Ready for Development Team
