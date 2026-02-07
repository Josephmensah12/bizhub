# BIZHUB Architecture Overview
## For Payless4Tech - Refurbished Electronics Business Hub

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT TIER                          │
│  React SPA (Dashboard, Inventory, Sales, Preorders, etc.)  │
│            Lightweight Charts, Responsive UI                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS/REST JSON
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY/BACKEND                    │
│                    Node.js + Express.js                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Authentication Middleware (JWT)                      │  │
│  │ Authorization Middleware (Role-based)                │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  REST API Endpoints                                  │  │
│  │  /auth, /dashboard, /inventory, /sales,              │  │
│  │  /preorders, /warranties, /repairs, /customers       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Business Logic Layer                                │  │
│  │  - Inventory Manager                                 │  │
│  │  - Sales Manager                                     │  │
│  │  - Preorder Workflow Engine                          │  │
│  │  - Warranty Manager                                  │  │
│  │  - Repair Ticket Manager                             │  │
│  │  - Dashboard Metrics Calculator                      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Data Access Layer (ORM - Sequelize)                 │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA TIER                              │
│                   PostgreSQL 14+                            │
│  - Transactional integrity for sales/inventory             │
│  - JSONB for flexible fields (diagnostic results, etc.)    │
│  - Indexed for fast queries (status, dates, customers)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Backend
- **Runtime**: Node.js 18+ (LTS)
- **Framework**: Express.js 4.x
- **ORM**: Sequelize 6.x (PostgreSQL dialect)
- **Authentication**: JWT (jsonwebtoken) + bcrypt for password hashing
- **Validation**: express-validator or Joi
- **Environment**: dotenv for config management

### 2.2 Frontend
- **Framework**: React 18.x
- **State Management**: React Context API + hooks (or Redux Toolkit for complex state)
- **Routing**: React Router 6.x
- **HTTP Client**: Axios
- **UI Components**:
  - Tailwind CSS for styling
  - Headless UI or Shadcn/ui for component primitives
- **Charts**: Chart.js or Recharts (lightweight)
- **Forms**: React Hook Form
- **Date Handling**: date-fns

### 2.3 Database
- **Primary DB**: PostgreSQL 14+
- **Migration Tool**: Sequelize migrations
- **Backup Strategy**: pg_dump (daily automated, implementation outside MVP)

### 2.4 Development Tools
- **Package Manager**: npm or yarn
- **Code Quality**: ESLint + Prettier
- **Version Control**: Git
- **API Testing**: Postman collections (provided)

---

## 3. Security Architecture

### 3.1 Authentication Flow
1. User submits credentials to `/auth/login`
2. Backend validates against `users` table (bcrypt password comparison)
3. If valid, generate JWT with payload: `{ userId, username, role, exp }`
4. Return JWT to client
5. Client stores JWT in memory or httpOnly cookie
6. All subsequent requests include JWT in `Authorization: Bearer <token>` header
7. Backend middleware validates JWT and attaches user context to `req.user`

### 3.2 Role-Based Access Control (RBAC)

**Roles:**
- **Admin**: Full access to all modules, user management, system settings
- **Manager**: Access to sales, inventory, reports; cannot manage users
- **Sales**: Create invoices, view inventory, manage preorders
- **Technician**: Diagnostics, repairs, QC workflow
- **Warehouse**: Receive stock, move inventory, manage locations

**Middleware Implementation:**
```javascript
// Example: requireRole(['Admin', 'Manager'])
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

**Endpoint Protection Examples:**
- `POST /users` → Admin only
- `POST /invoices` → Sales, Manager, Admin
- `POST /assets/:id/diagnostics` → Technician, Manager, Admin
- `GET /dashboard/metrics` → All authenticated users (filtered by role)

### 3.3 Data Validation
- All input sanitized and validated at API layer
- SQL injection prevention via Sequelize parameterized queries
- XSS prevention via output encoding in React (default behavior)

---

## 4. Module Architecture

### 4.1 Inventory Module

**Purpose**: Manage refurbished electronics inventory (serialized + bulk)

**Key Entities**:
- `ProductModel`: Catalog of device types (HP EliteBook 840 G7, etc.)
- `Asset`: Individual serialized devices (laptops/phones)
- `BulkStock`: Non-serialized items (chargers, mice, RAM)
- `InventoryMovement`: Audit trail of location/status changes

**Workflows**:
1. **Receive Stock**:
   - Create Asset with status `Received`
   - Record purchase cost, supplier, received_date

2. **Diagnostics**:
   - Technician runs checklist
   - Create `DiagnosticsResult` record (JSONB for flexible checklist data)
   - Update Asset status to `Diagnostics Pending` → `Wipe Pending`

3. **Data Wipe**:
   - Technician completes wipe, enters certificate reference
   - Create `WipeCertificate` record
   - Update Asset status to `QC Pending`

4. **Quality Check**:
   - QC assigns condition grade (A/B/C)
   - Assign accessories bundle
   - Update status to `Ready for Sale`

5. **Sales**:
   - Create Invoice, link Asset
   - Update Asset status to `Sold`
   - Record sale_date, sale_price

6. **Location Tracking**:
   - Assets can be moved: Shop Floor / Backroom / Repair Bench / Warehouse
   - Each move creates `InventoryMovement` record

**Business Rules**:
- Cannot sell an Asset unless status is `Ready for Sale` or `Reserved`
- Low stock alerts trigger when BulkStock.quantity < reorder_threshold
- Aging stock calculated: days_since(received_date) > threshold

---

### 4.2 Sales Module

**Purpose**: Handle retail/wholesale transactions, invoicing, payments

**Key Entities**:
- `Customer`: Basic customer info + wholesale/retail flag
- `Invoice`: Header (customer, date, total, status)
- `InvoiceLine`: Line items (asset_id or bulk_stock_id, quantity, price)
- `Payment`: Split tender support (cash, momo, bank, card)

**Workflows**:
1. **Create Invoice**:
   - Select customer (or walk-in)
   - Add line items (serialized assets or bulk items)
   - Calculate total, tax (if applicable)
   - Set status to `Draft`

2. **Process Payment**:
   - Accept one or multiple payment methods
   - Record each payment in `payments` table
   - When total paid ≥ invoice total, mark invoice `Paid`
   - Auto-update inventory:
     - Assets: status → `Sold`, link to invoice
     - BulkStock: decrement quantity

3. **Returns**:
   - Create return record (links to original invoice)
   - If within warranty, create repair ticket or replace
   - Refund payment(s)
   - Return Asset to inventory (status → `Returned`)

**Business Rules**:
- Wholesale customers may have different pricing tiers (future enhancement)
- Track profit: `sale_price - landed_cost`
- Lead source tracking: Instagram, Walk-in, Referral, Campus, etc.

---

### 4.3 Preorder Module

**Purpose**: Manage US-to-Ghana procurement workflow with deposits

**Key Entities**:
- `Preorder`: Customer request, deposit, status, SLA date
- `PreorderEvent`: Audit trail (ordered, arrived, rejected, etc.)

**Workflows**:
1. **Customer Places Preorder**:
   - Customer provides specs, target price
   - Pay GHC 500 deposit
   - Status: `Deposit Pending` → `Ordered`
   - Set SLA: 21 days from order_date

2. **Item Arrives**:
   - Create Asset from shipment
   - Link Asset to Preorder (status → `Reserved`)
   - Notify customer (manual for MVP)
   - Status: `Arrived` → `Customer Notified`

3. **Customer Accepts**:
   - Create Invoice
   - Apply deposit toward purchase
   - Complete sale
   - Status: `Picked Up` → `Closed`

4. **Customer Rejects**:
   - Status: `Rejected`
   - Asset status: `Reserved` → `Available`
   - Enable "Resale Recovery" workflow:
     - When Asset sold, calculate: `sale_price - deposit_owed`
     - If negative, customer owes difference
     - If positive, refund customer

**Business Rules**:
- Deposit is non-refundable until resale attempt
- SLA breach triggers alert in dashboard
- Preorder policy clearly documented in system

---

### 4.4 Warranty Module

**Purpose**: Manage warranty packages (standard vs 1-year premium)

**Key Entities**:
- `Warranty`: Linked to Invoice + Asset, tier, start/end dates
- `WarrantyClaim`: Customer claims, links to RepairTicket

**Workflows**:
1. **Issue Warranty**:
   - At sale, select warranty tier
   - Create Warranty record
   - Generate certificate (PDF placeholder for MVP)

2. **Claim Warranty**:
   - Customer submits claim
   - Validate warranty active (within date range)
   - Create RepairTicket or replace Asset
   - Update WarrantyClaim with outcome

**Business Rules**:
- Premium 1-Year includes: accessories, certificate, premium boxing
- Exclusions: physical damage, water damage (configurable)
- Warranty transferable if asset resold (policy decision)

---

### 4.5 Repair Module

**Purpose**: Track in-house repairs and service tickets

**Key Entities**:
- `RepairTicket`: Issue description, customer, linked Asset (optional)
- `RepairEvent`: Status transitions, notes, timestamps

**Workflows**:
1. **Create Ticket**:
   - Customer/Staff reports issue
   - Status: `Open`
   - Assign to Technician

2. **Diagnosis**:
   - Technician investigates
   - Status: `Diagnosing` → `Waiting for Parts` or `In Repair`

3. **Repair Complete**:
   - Update status: `Ready`
   - Notify customer
   - Record labor + parts cost

4. **Close Ticket**:
   - Customer picks up or issue resolved
   - Status: `Closed`
   - Outcome: Repaired / Replaced / Refunded / Unable

**Business Rules**:
- If Asset under warranty, link WarrantyClaim
- Track cost vs revenue for warranty claims (P&L analysis)

---

### 4.6 Dashboard Module

**Purpose**: Real-time business metrics and work queues

**Widgets (API endpoints provide data)**:
1. **Today's Sales**: Sum of invoice totals where `invoice_date = TODAY`, transaction count
2. **Inventory On Hand**: Count of Assets by category + status `Ready for Sale` or `Reserved`
3. **Low Stock Alerts**: BulkStock where `quantity < reorder_threshold`
4. **Aging Stock**: Assets where `days_since(received_date) > 30/60/90`
5. **Needs Attention Queue**:
   - Assets: status = `Diagnostics Pending`, `Wipe Pending`, `QC Pending`
   - Preorders: SLA breached, customer pickup due
   - Repairs: status = `Open`, `Waiting for Parts`
6. **Preorders Summary**: Count by status
7. **Repairs Summary**: Count by status
8. **BNPL Summary**: Active plans, overdue (future implementation)
9. **Top Sellers**: Assets/ProductModels sold in last 7/30 days, sorted by count
10. **Lead Source Breakdown**: Invoice count by lead_source

**UI Design**:
- Grid layout with responsive cards
- Clickable widgets drill down to filtered list views
- Refresh button + auto-refresh every 5 minutes

---

## 5. Data Flow Examples

### 5.1 Sale of a Refurbished Laptop

```
1. Sales staff searches inventory for "HP EliteBook i5 16GB"
   GET /assets?status=Ready for Sale&model=HP EliteBook

2. Select Asset (serial: HPE840-12345)
   GET /assets/HPE840-12345

3. Create Invoice:
   POST /invoices
   {
     customer_id: 42,
     lines: [{ asset_id: "HPE840-12345", price: 3200 }],
     lead_source: "Instagram"
   }
   Backend:
   - Create Invoice record (status: Draft)
   - Create InvoiceLine record
   - Reserve Asset (prevent double-sale)

4. Process Payment:
   POST /invoices/INV-001/payments
   { method: "momo", amount: 3200 }
   Backend:
   - Create Payment record
   - If total_paid >= invoice_total:
     - Update Invoice.status = Paid
     - Update Asset.status = Sold, sale_date = NOW()
     - Trigger inventory reduction

5. Generate Receipt (PDF or print)
   GET /invoices/INV-001/receipt

6. Dashboard updates automatically (next refresh)
```

### 5.2 Preorder Flow with Customer Rejection

```
1. Customer requests MacBook Pro M1 16GB 512GB
   POST /preorders
   {
     customer_id: 55,
     specs: "MacBook Pro M1 16GB 512GB",
     target_price: 5500,
     deposit: 500
   }
   Backend:
   - Create Preorder (status: Deposit Pending, SLA: NOW() + 21 days)

2. Customer pays deposit:
   POST /preorders/PRE-001/deposit
   { amount: 500, method: "cash" }
   Backend:
   - Update status: Ordered

3. Item arrives from US:
   POST /assets
   {
     model: "MacBook Pro M1 16GB 512GB",
     serial: "MBP-M1-67890",
     status: "Received",
     preorder_id: "PRE-001"
   }
   Backend:
   - Create Asset
   - Link to Preorder
   - Update Preorder.status = Arrived

4. Notify customer (manual), customer comes to view

5. Customer rejects (wants different config):
   POST /preorders/PRE-001/reject
   Backend:
   - Update Preorder.status = Rejected
   - Update Asset.status = Available (remove reservation)
   - Enable resale_recovery flag

6. Asset is sold to another customer:
   POST /invoices (standard sale)
   Backend detects asset.preorder_id:
   - Calculate: sale_price (5300) - deposit_owed (500) = 4800
   - Create adjustment record for original customer
   - If negative balance, flag for collection
   - Update Preorder.status = Resold

7. Refund customer after resale (manual accounting step for MVP)
```

---

## 6. Scalability Considerations

### 6.1 Current Scope (MVP)
- Single server deployment
- PostgreSQL on same server or managed service (e.g., Heroku Postgres, AWS RDS)
- Expect: 10-50 concurrent users, 1000-5000 assets, 100-500 transactions/month

### 6.2 Future Enhancements
- **Horizontal Scaling**: Load balancer + multiple API server instances
- **Database**: Read replicas for reporting queries
- **Caching**: Redis for dashboard metrics, hot inventory data
- **File Storage**: S3 for warranty certificates, diagnostic reports, product images
- **Notifications**: SMS/Email service (Twilio, Mailgun) for preorder alerts
- **Webhooks**: Integration with external BNPL providers
- **Analytics**: Export to data warehouse for BI tools

---

## 7. Development Workflow

### 7.1 Repository Structure
```
bizhub/
├── backend/
│   ├── config/         # DB connection, environment config
│   ├── migrations/     # Sequelize migrations
│   ├── models/         # Sequelize models
│   ├── routes/         # Express route handlers
│   ├── controllers/    # Business logic
│   ├── middleware/     # Auth, validation, error handling
│   ├── utils/          # Helper functions
│   ├── seeds/          # Seed data for development
│   ├── tests/          # Unit + integration tests
│   ├── app.js          # Express app setup
│   └── server.js       # Entry point
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Page-level components
│   │   ├── context/    # React context for state
│   │   ├── services/   # API client functions
│   │   ├── utils/      # Helper functions
│   │   ├── App.jsx     # Root component + routing
│   │   └── main.jsx    # Entry point
│   ├── package.json
│   └── vite.config.js  # Vite bundler config
├── docs/
│   ├── API_SPEC.md     # Detailed API documentation
│   ├── DB_SCHEMA.md    # Database schema + ERD
│   └── DEPLOYMENT.md   # Deployment guide
├── postman/            # Postman collection for API testing
├── README.md
└── package.json        # Root package.json (optional monorepo setup)
```

### 7.2 Development Environment Setup
1. Install Node.js 18+, PostgreSQL 14+
2. Clone repository
3. Backend:
   ```bash
   cd backend
   npm install
   cp .env.example .env  # Configure DB credentials
   npm run migrate       # Run migrations
   npm run seed          # Load seed data
   npm run dev           # Start dev server (nodemon)
   ```
4. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev           # Start Vite dev server
   ```
5. Access: Frontend at http://localhost:5173, API at http://localhost:3000

### 7.3 Deployment (Production)
- **Backend**: Deploy to Heroku, AWS EC2, or DigitalOcean Droplet
- **Frontend**: Build static files (`npm run build`), serve via Nginx or Vercel
- **Database**: Managed PostgreSQL (AWS RDS, Heroku Postgres)
- **Environment Variables**: Secure storage (Heroku Config Vars, AWS Secrets Manager)

---

## 8. API Design Principles

### 8.1 REST Conventions
- **Endpoints**: Noun-based, plural (`/assets`, `/invoices`)
- **HTTP Methods**:
  - GET: Retrieve resource(s)
  - POST: Create new resource
  - PUT/PATCH: Update resource
  - DELETE: Remove resource (soft delete preferred)
- **Status Codes**:
  - 200: Success
  - 201: Created
  - 400: Bad request (validation error)
  - 401: Unauthorized (missing/invalid token)
  - 403: Forbidden (insufficient permissions)
  - 404: Not found
  - 500: Server error

### 8.2 Response Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

### 8.3 Pagination
- Query params: `?page=1&limit=20`
- Default: page=1, limit=50
- Max limit: 100

### 8.4 Filtering & Search
- Examples:
  - `/assets?status=Ready for Sale&category=Laptop`
  - `/invoices?start_date=2024-01-01&end_date=2024-12-31&customer_id=42`
  - `/customers?search=john` (searches name, email, phone)

### 8.5 Error Handling
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Serial number is required",
    "fields": {
      "serial_number": "This field is required"
    }
  }
}
```

---

## 9. Frontend Architecture

### 9.1 Component Structure
```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.jsx
│   │   ├── TopBar.jsx
│   │   └── Layout.jsx
│   ├── dashboard/
│   │   ├── MetricCard.jsx
│   │   ├── SalesWidget.jsx
│   │   ├── InventoryWidget.jsx
│   │   └── QueueWidget.jsx
│   ├── inventory/
│   │   ├── AssetList.jsx
│   │   ├── AssetDetail.jsx
│   │   ├── AssetForm.jsx
│   │   └── DiagnosticsChecklist.jsx
│   ├── sales/
│   │   ├── InvoiceList.jsx
│   │   ├── InvoiceForm.jsx
│   │   ├── PaymentModal.jsx
│   │   └── CustomerSelect.jsx
│   ├── preorders/
│   │   ├── PreorderList.jsx
│   │   ├── PreorderDetail.jsx
│   │   └── PreorderForm.jsx
│   ├── common/
│   │   ├── Button.jsx
│   │   ├── Input.jsx
│   │   ├── Table.jsx
│   │   ├── Modal.jsx
│   │   └── StatusBadge.jsx
│   └── charts/
│       ├── LineChart.jsx
│       └── PieChart.jsx
├── pages/
│   ├── Dashboard.jsx
│   ├── Inventory.jsx
│   ├── Sales.jsx
│   ├── Preorders.jsx
│   ├── Repairs.jsx
│   ├── Customers.jsx
│   ├── Reports.jsx
│   └── Login.jsx
├── context/
│   ├── AuthContext.jsx
│   └── NotificationContext.jsx
├── services/
│   ├── api.js          # Axios instance with interceptors
│   ├── authService.js
│   ├── inventoryService.js
│   ├── salesService.js
│   └── ...
└── utils/
    ├── formatters.js   # Date, currency, etc.
    └── validators.js
```

### 9.2 State Management
- **Global State**: AuthContext (user, token, role), NotificationContext (toast messages)
- **Local State**: React hooks (useState, useReducer) for component-specific data
- **Server State**: Fetch data on mount, store in local state (or consider React Query for caching)

### 9.3 Routing
```javascript
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
    <Route index element={<Dashboard />} />
    <Route path="inventory" element={<Inventory />} />
    <Route path="assets/:id" element={<AssetDetail />} />
    <Route path="sales" element={<Sales />} />
    <Route path="preorders" element={<Preorders />} />
    <Route path="repairs" element={<Repairs />} />
    <Route path="customers" element={<Customers />} />
    <Route path="reports" element={<Reports />} />
  </Route>
</Routes>
```

---

## 10. Testing Strategy (Future)

### 10.1 Backend
- **Unit Tests**: Jest for model methods, utility functions
- **Integration Tests**: Supertest for API endpoint testing
- **Coverage Goal**: 70%+ for business logic

### 10.2 Frontend
- **Component Tests**: React Testing Library
- **E2E Tests**: Playwright or Cypress for critical user flows (login, create invoice, etc.)

---

## 11. Monitoring & Logging (Future)

- **Logging**: Winston or Pino (structured logs)
- **Error Tracking**: Sentry
- **Performance**: New Relic or Datadog APM
- **Uptime**: UptimeRobot or Pingdom

---

## 12. Compliance & Data Privacy

- **GDPR/Ghana Data Protection**: Store customer data securely, provide export/delete capabilities
- **PCI DSS**: If storing card data, use tokenization (Stripe, Paystack)
- **Audit Trails**: All critical actions logged (who, what, when) in `InventoryMovement`, `PreorderEvent`, `RepairEvent` tables

---

## Next Steps

1. Review and approve this architecture
2. Proceed to detailed database schema design
3. Define API endpoint specifications
4. Scaffold codebase with initial project structure
5. Implement core modules iteratively

---

**Document Version**: 1.0
**Last Updated**: 2026-01-14
**Author**: Claude Code
**Status**: Draft for Review
