# BIZHUB Database Schema
## PostgreSQL Schema for Payless4Tech Business Hub

---

## 1. Schema Overview

The database is designed to support:
- Multi-user access with role-based permissions
- Serialized inventory tracking (individual laptops/phones)
- Bulk inventory (accessories)
- Complete sales workflow (invoices, payments, returns)
- Preorder management with deposit tracking
- Warranty lifecycle management
- Repair ticket system
- Comprehensive audit trails

**Database**: PostgreSQL 14+
**Character Set**: UTF8
**Collation**: en_US.UTF8

---

## 2. Entity Relationship Diagram (Text Format)

```
users ──────┐
            │
            ├──< invoices >──< invoice_lines ────< assets
            │                                    /
            │                                   /
customers ──┤                                  /
            │                                 /
            ├──< preorders ─────────────────┘
            │
            └──< repair_tickets


product_models ──< assets ──< diagnostics_results
                           │
                           ├──< wipe_certificates
                           │
                           ├──< inventory_movements
                           │
                           └──< warranties ──< warranty_claims ──< repair_tickets


bulk_stock ──< invoice_lines


invoices ──< payments


locations (reference table)
lead_sources (reference table)
```

---

## 3. Table Definitions

### 3.1 users

Stores user accounts with role-based access control.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('Admin', 'Manager', 'Sales', 'Technician', 'Warehouse')),
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

**Roles**:
- `Admin`: Full system access
- `Manager`: Sales, inventory, reports
- `Sales`: Create invoices, manage preorders
- `Technician`: Diagnostics, repairs, QC
- `Warehouse`: Receive stock, move inventory

---

### 3.2 customers

Stores customer information for retail and wholesale clients.

```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  customer_type VARCHAR(20) NOT NULL CHECK (customer_type IN ('Retail', 'Wholesale')),
  full_name VARCHAR(100) NOT NULL,
  business_name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20) NOT NULL,
  alternate_phone VARCHAR(20),
  address TEXT,
  city VARCHAR(50) DEFAULT 'Accra',
  region VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_type ON customers(customer_type);
CREATE INDEX idx_customers_name ON customers(full_name);
```

---

### 3.3 product_models

Catalog of device types (HP EliteBook, MacBook Pro, etc.) - not individual units.

```sql
CREATE TABLE product_models (
  id SERIAL PRIMARY KEY,
  category VARCHAR(20) NOT NULL CHECK (category IN ('Laptop', 'Phone', 'Accessory')),
  brand VARCHAR(50) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  cpu VARCHAR(100),
  ram VARCHAR(50),
  storage VARCHAR(50),
  screen_size VARCHAR(20),
  gpu VARCHAR(100),
  operating_system VARCHAR(50),
  description TEXT,
  default_price_grade_a DECIMAL(10, 2),
  default_price_grade_b DECIMAL(10, 2),
  default_price_grade_c DECIMAL(10, 2),
  image_url VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_product_models_category ON product_models(category);
CREATE INDEX idx_product_models_brand ON product_models(brand);
CREATE INDEX idx_product_models_model ON product_models(model_name);
```

**Example**: "HP EliteBook 840 G7 i5-10310U 16GB 512GB SSD 14\" FHD"

---

### 3.4 assets

Individual serialized devices (each laptop/phone is a unique asset).

```sql
CREATE TABLE assets (
  id SERIAL PRIMARY KEY,
  asset_tag VARCHAR(50) UNIQUE NOT NULL, -- Internal tracking code
  serial_number VARCHAR(100) UNIQUE NOT NULL,
  product_model_id INTEGER NOT NULL REFERENCES product_models(id),

  -- Purchase info
  supplier VARCHAR(100),
  purchase_cost DECIMAL(10, 2),
  landed_cost DECIMAL(10, 2), -- Including shipping, duty, etc.
  received_date DATE NOT NULL,

  -- Condition
  condition_grade VARCHAR(10) CHECK (condition_grade IN ('A', 'B', 'C', NULL)),
  cosmetic_notes TEXT,
  battery_health_percent INTEGER CHECK (battery_health_percent BETWEEN 0 AND 100),
  battery_cycle_count INTEGER,

  -- Status workflow
  status VARCHAR(30) NOT NULL DEFAULT 'Received' CHECK (status IN (
    'Received',
    'Diagnostics Pending',
    'Wipe Pending',
    'QC Pending',
    'Ready for Sale',
    'Reserved',
    'Sold',
    'Returned',
    'Repair Hold',
    'Scrapped',
    'Not Sellable'
  )),
  not_sellable_reason TEXT,

  -- Location
  location_id INTEGER REFERENCES locations(id),

  -- Sales info (populated when sold)
  sale_price DECIMAL(10, 2),
  sale_date DATE,
  invoice_id INTEGER REFERENCES invoices(id),

  -- Preorder link
  preorder_id INTEGER REFERENCES preorders(id),

  -- Accessories bundled
  accessories_included TEXT, -- JSON or comma-separated list

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_serial ON assets(serial_number);
CREATE INDEX idx_assets_tag ON assets(asset_tag);
CREATE INDEX idx_assets_model ON assets(product_model_id);
CREATE INDEX idx_assets_location ON assets(location_id);
CREATE INDEX idx_assets_received_date ON assets(received_date);
CREATE INDEX idx_assets_invoice ON assets(invoice_id);
```

**Key Business Rule**: An asset cannot be sold unless `status IN ('Ready for Sale', 'Reserved')`.

---

### 3.5 bulk_stock

Non-serialized inventory items (chargers, mice, RAM sticks, etc.).

```sql
CREATE TABLE bulk_stock (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) UNIQUE NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'Charger', 'Mouse', 'RAM', 'Cable', etc.
  description TEXT,
  unit_cost DECIMAL(10, 2),
  unit_price DECIMAL(10, 2),
  quantity INTEGER NOT NULL DEFAULT 0,
  reorder_threshold INTEGER DEFAULT 10,
  supplier VARCHAR(100),
  location_id INTEGER REFERENCES locations(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bulk_stock_sku ON bulk_stock(sku);
CREATE INDEX idx_bulk_stock_quantity ON bulk_stock(quantity);
CREATE INDEX idx_bulk_stock_category ON bulk_stock(category);
```

**Low Stock Alert**: Trigger when `quantity < reorder_threshold`.

---

### 3.6 locations

Physical locations within the business for inventory tracking.

```sql
CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  location_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed data
INSERT INTO locations (location_name, description) VALUES
  ('Shop Floor', 'Main retail display area'),
  ('Backroom', 'Storage behind shop'),
  ('Repair Bench', 'Technician workstation'),
  ('Warehouse', 'Off-site storage'),
  ('Sold', 'Item has been sold and left premises');
```

---

### 3.7 inventory_movements

Audit trail for asset location and status changes.

```sql
CREATE TABLE inventory_movements (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  from_location_id INTEGER REFERENCES locations(id),
  to_location_id INTEGER REFERENCES locations(id),
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  moved_by INTEGER REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_movements_asset ON inventory_movements(asset_id);
CREATE INDEX idx_movements_date ON inventory_movements(created_at);
```

**Usage**: Every time an asset's status or location changes, create a movement record.

---

### 3.8 diagnostics_results

Records from technician diagnostics checklist.

```sql
CREATE TABLE diagnostics_results (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  technician_id INTEGER NOT NULL REFERENCES users(id),
  checklist_data JSONB NOT NULL, -- Flexible checklist: { "display": "pass", "keyboard": "pass", "ports": "1 USB port faulty" }
  overall_result VARCHAR(20) CHECK (overall_result IN ('Pass', 'Pass with Notes', 'Fail')),
  notes TEXT,
  diagnostic_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_diagnostics_asset ON diagnostics_results(asset_id);
CREATE INDEX idx_diagnostics_date ON diagnostics_results(diagnostic_date);
```

**checklist_data example**:
```json
{
  "power_on": "pass",
  "display": "pass",
  "keyboard": "pass",
  "trackpad": "pass",
  "ports": "1 USB-A port not working",
  "wifi": "pass",
  "bluetooth": "pass",
  "speakers": "pass",
  "webcam": "pass",
  "battery": "holds charge, 85% health"
}
```

---

### 3.9 wipe_certificates

Data wipe completion records (compliance/audit).

```sql
CREATE TABLE wipe_certificates (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  technician_id INTEGER NOT NULL REFERENCES users(id),
  wipe_method VARCHAR(50) NOT NULL, -- 'DOD 3-pass', 'NIST 800-88', 'Quick Format', etc.
  certificate_reference VARCHAR(100), -- External cert ID if using software like Blancco
  wipe_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_wipe_asset ON wipe_certificates(asset_id);
CREATE INDEX idx_wipe_date ON wipe_certificates(wipe_date);
```

---

### 3.10 invoices

Sales transaction headers.

```sql
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated: INV-001, INV-002, etc.
  customer_id INTEGER REFERENCES customers(id),
  customer_type VARCHAR(20) NOT NULL CHECK (customer_type IN ('Retail', 'Wholesale', 'Walk-in')),

  -- Sales info
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Paid', 'Cancelled', 'Refunded')),

  -- Totals
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,

  -- Tracking
  lead_source VARCHAR(50), -- 'Instagram', 'Walk-in', 'Referral', 'Campus', etc.
  sales_rep_id INTEGER REFERENCES users(id),

  -- Notes
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_lead_source ON invoices(lead_source);
```

---

### 3.11 invoice_lines

Line items for each invoice.

```sql
CREATE TABLE invoice_lines (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,

  -- Item reference (either asset OR bulk_stock, not both)
  asset_id INTEGER REFERENCES assets(id),
  bulk_stock_id INTEGER REFERENCES bulk_stock(id),

  -- Item details (captured at time of sale)
  item_description VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(10, 2) NOT NULL,

  -- Cost tracking for profit calculation
  unit_cost DECIMAL(10, 2),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT check_item_reference CHECK (
    (asset_id IS NOT NULL AND bulk_stock_id IS NULL AND quantity = 1) OR
    (asset_id IS NULL AND bulk_stock_id IS NOT NULL)
  )
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_asset ON invoice_lines(asset_id);
CREATE INDEX idx_invoice_lines_bulk ON invoice_lines(bulk_stock_id);
```

**Business Rule**: For serialized assets, `quantity` must be 1. For bulk items, quantity can be > 1.

---

### 3.12 payments

Split-tender payment records.

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('Cash', 'MoMo', 'Bank Transfer', 'Card', 'Other')),
  amount DECIMAL(10, 2) NOT NULL,
  reference VARCHAR(100), -- Transaction ID, check number, etc.
  notes TEXT,
  received_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payments_method ON payments(payment_method);
```

**Split Tender Example**: Invoice total GHC 5000 paid with GHC 3000 cash + GHC 2000 MoMo = 2 payment records.

---

### 3.13 preorders

Customer preorder requests with deposit tracking.

```sql
CREATE TABLE preorders (
  id SERIAL PRIMARY KEY,
  preorder_number VARCHAR(50) UNIQUE NOT NULL, -- PRE-001, PRE-002, etc.
  customer_id INTEGER NOT NULL REFERENCES customers(id),

  -- Requested item
  requested_specs TEXT NOT NULL,
  target_price_min DECIMAL(10, 2),
  target_price_max DECIMAL(10, 2),

  -- Deposit
  deposit_amount DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
  deposit_paid BOOLEAN DEFAULT FALSE,
  deposit_date DATE,
  deposit_payment_method VARCHAR(20),

  -- Workflow
  status VARCHAR(30) NOT NULL DEFAULT 'Deposit Pending' CHECK (status IN (
    'Deposit Pending',
    'Ordered',
    'In Transit',
    'Arrived',
    'Customer Notified',
    'Picked Up',
    'Rejected',
    'Resold',
    'Closed'
  )),

  -- SLA tracking
  order_date DATE,
  sla_date DATE, -- order_date + 21 days
  arrival_date DATE,
  customer_notified_date DATE,

  -- Linked asset (when item arrives)
  asset_id INTEGER REFERENCES assets(id),

  -- If rejected and resold
  resale_recovery_amount DECIMAL(10, 2),
  resale_invoice_id INTEGER REFERENCES invoices(id),

  -- Notes and policy
  notes TEXT,
  policy_terms TEXT DEFAULT 'Deposit applied toward purchase. If rejected, Payless4Tech may resell before reimbursing. Customer owes any shortfall.',

  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_preorders_number ON preorders(preorder_number);
CREATE INDEX idx_preorders_customer ON preorders(customer_id);
CREATE INDEX idx_preorders_status ON preorders(status);
CREATE INDEX idx_preorders_sla ON preorders(sla_date);
CREATE INDEX idx_preorders_asset ON preorders(asset_id);
```

---

### 3.14 preorder_events

Audit trail for preorder status changes.

```sql
CREATE TABLE preorder_events (
  id SERIAL PRIMARY KEY,
  preorder_id INTEGER NOT NULL REFERENCES preorders(id),
  event_type VARCHAR(50) NOT NULL, -- 'deposit_received', 'ordered', 'arrived', 'customer_notified', 'rejected', etc.
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_preorder_events_preorder ON preorder_events(preorder_id);
CREATE INDEX idx_preorder_events_date ON preorder_events(created_at);
```

---

### 3.15 warranties

Warranty records linked to invoices and assets.

```sql
CREATE TABLE warranties (
  id SERIAL PRIMARY KEY,
  warranty_number VARCHAR(50) UNIQUE NOT NULL, -- WAR-001, WAR-002, etc.
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  asset_id INTEGER REFERENCES assets(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),

  -- Warranty terms
  warranty_tier VARCHAR(20) NOT NULL CHECK (warranty_tier IN ('Standard', 'Premium 1-Year')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Coverage
  coverage_details TEXT DEFAULT 'Hardware defects, excluding physical/water damage',
  exclusions TEXT DEFAULT 'Physical damage, water damage, software issues, battery wear',

  -- Premium package details
  includes_accessories BOOLEAN DEFAULT FALSE,
  includes_certificate BOOLEAN DEFAULT FALSE,
  includes_premium_boxing BOOLEAN DEFAULT FALSE,

  -- Status
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Claimed', 'Expired', 'Void')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_warranties_number ON warranties(warranty_number);
CREATE INDEX idx_warranties_invoice ON warranties(invoice_id);
CREATE INDEX idx_warranties_asset ON warranties(asset_id);
CREATE INDEX idx_warranties_customer ON warranties(customer_id);
CREATE INDEX idx_warranties_dates ON warranties(start_date, end_date);
```

---

### 3.16 warranty_claims

Customer warranty claims linked to repair tickets.

```sql
CREATE TABLE warranty_claims (
  id SERIAL PRIMARY KEY,
  claim_number VARCHAR(50) UNIQUE NOT NULL, -- WCLAIM-001, etc.
  warranty_id INTEGER NOT NULL REFERENCES warranties(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),

  -- Claim details
  issue_description TEXT NOT NULL,
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Approved', 'Denied', 'Completed')),
  denial_reason TEXT,

  -- Resolution
  repair_ticket_id INTEGER REFERENCES repair_tickets(id),
  outcome VARCHAR(50) CHECK (outcome IN ('Repaired', 'Replaced', 'Refunded', 'Denied', NULL)),
  outcome_date DATE,

  -- Costs
  labor_cost DECIMAL(10, 2),
  parts_cost DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),

  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_warranty_claims_number ON warranty_claims(claim_number);
CREATE INDEX idx_warranty_claims_warranty ON warranty_claims(warranty_id);
CREATE INDEX idx_warranty_claims_status ON warranty_claims(status);
CREATE INDEX idx_warranty_claims_date ON warranty_claims(claim_date);
```

---

### 3.17 repair_tickets

Service and repair ticket system.

```sql
CREATE TABLE repair_tickets (
  id SERIAL PRIMARY KEY,
  ticket_number VARCHAR(50) UNIQUE NOT NULL, -- TKT-001, TKT-002, etc.
  customer_id INTEGER REFERENCES customers(id),
  asset_id INTEGER REFERENCES assets(id), -- Optional: may be a general repair not tied to asset

  -- Issue
  issue_type VARCHAR(50) NOT NULL, -- 'Screen Repair', 'Battery Replacement', 'Diagnostics', etc.
  issue_description TEXT NOT NULL,

  -- Status workflow
  status VARCHAR(30) NOT NULL DEFAULT 'Open' CHECK (status IN (
    'Open',
    'Diagnosing',
    'Waiting for Parts',
    'In Repair',
    'Ready',
    'Closed'
  )),

  -- Assignment
  assigned_to INTEGER REFERENCES users(id),

  -- Dates
  opened_date DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_date DATE,

  -- Resolution
  outcome VARCHAR(50) CHECK (outcome IN ('Repaired', 'Replaced', 'Refunded', 'Unable', NULL)),
  resolution_notes TEXT,

  -- Costs
  labor_cost DECIMAL(10, 2) DEFAULT 0,
  parts_cost DECIMAL(10, 2) DEFAULT 0,
  total_cost DECIMAL(10, 2) DEFAULT 0,

  -- Billing
  invoice_id INTEGER REFERENCES invoices(id),

  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_repair_tickets_number ON repair_tickets(ticket_number);
CREATE INDEX idx_repair_tickets_customer ON repair_tickets(customer_id);
CREATE INDEX idx_repair_tickets_asset ON repair_tickets(asset_id);
CREATE INDEX idx_repair_tickets_status ON repair_tickets(status);
CREATE INDEX idx_repair_tickets_assigned ON repair_tickets(assigned_to);
CREATE INDEX idx_repair_tickets_date ON repair_tickets(opened_date);
```

---

### 3.18 repair_events

Audit trail for repair ticket status changes.

```sql
CREATE TABLE repair_events (
  id SERIAL PRIMARY KEY,
  repair_ticket_id INTEGER NOT NULL REFERENCES repair_tickets(id),
  event_type VARCHAR(50) NOT NULL, -- 'status_change', 'note_added', 'assigned', etc.
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_repair_events_ticket ON repair_events(repair_ticket_id);
CREATE INDEX idx_repair_events_date ON repair_events(created_at);
```

---

### 3.19 lead_sources

Reference table for tracking where customers come from.

```sql
CREATE TABLE lead_sources (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed data
INSERT INTO lead_sources (source_name, description) VALUES
  ('Instagram', 'Social media marketing'),
  ('Walk-in', 'Customer walked into shop'),
  ('Referral', 'Referred by existing customer'),
  ('Campus Ambassador', 'University campus representative'),
  ('Online Search', 'Found via Google/search engine'),
  ('Facebook', 'Facebook ads or organic'),
  ('WhatsApp', 'WhatsApp Business'),
  ('Other', 'Other source');
```

---

## 4. Views for Common Queries

### 4.1 view_inventory_summary

Quick snapshot of inventory status.

```sql
CREATE VIEW view_inventory_summary AS
SELECT
  pm.category,
  pm.brand,
  pm.model_name,
  COUNT(*) as total_units,
  COUNT(*) FILTER (WHERE a.status = 'Ready for Sale') as available,
  COUNT(*) FILTER (WHERE a.status = 'Reserved') as reserved,
  COUNT(*) FILTER (WHERE a.status = 'Sold') as sold,
  AVG(a.sale_price) FILTER (WHERE a.status = 'Sold') as avg_sale_price,
  AVG(CURRENT_DATE - a.received_date) FILTER (WHERE a.status IN ('Ready for Sale', 'Reserved')) as avg_age_days
FROM assets a
JOIN product_models pm ON a.product_model_id = pm.id
GROUP BY pm.category, pm.brand, pm.model_name
ORDER BY total_units DESC;
```

### 4.2 view_sales_daily

Daily sales summary.

```sql
CREATE VIEW view_sales_daily AS
SELECT
  invoice_date,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_sales,
  SUM(CASE WHEN customer_type = 'Retail' THEN total_amount ELSE 0 END) as retail_sales,
  SUM(CASE WHEN customer_type = 'Wholesale' THEN total_amount ELSE 0 END) as wholesale_sales
FROM invoices
WHERE status = 'Paid'
GROUP BY invoice_date
ORDER BY invoice_date DESC;
```

### 4.3 view_aging_inventory

Assets sitting in inventory for extended periods.

```sql
CREATE VIEW view_aging_inventory AS
SELECT
  a.asset_tag,
  a.serial_number,
  pm.brand,
  pm.model_name,
  a.condition_grade,
  a.status,
  a.received_date,
  CURRENT_DATE - a.received_date as days_in_inventory,
  CASE
    WHEN CURRENT_DATE - a.received_date > 90 THEN '90+ days'
    WHEN CURRENT_DATE - a.received_date > 60 THEN '60-90 days'
    WHEN CURRENT_DATE - a.received_date > 30 THEN '30-60 days'
    ELSE 'Under 30 days'
  END as aging_bucket
FROM assets a
JOIN product_models pm ON a.product_model_id = pm.id
WHERE a.status IN ('Received', 'Diagnostics Pending', 'Wipe Pending', 'QC Pending', 'Ready for Sale')
ORDER BY days_in_inventory DESC;
```

### 4.4 view_preorder_sla

Preorders with SLA status.

```sql
CREATE VIEW view_preorder_sla AS
SELECT
  p.preorder_number,
  c.full_name as customer_name,
  p.requested_specs,
  p.status,
  p.order_date,
  p.sla_date,
  CURRENT_DATE - p.sla_date as days_overdue,
  CASE
    WHEN CURRENT_DATE > p.sla_date AND p.status NOT IN ('Picked Up', 'Closed', 'Rejected') THEN TRUE
    ELSE FALSE
  END as is_overdue
FROM preorders p
JOIN customers c ON p.customer_id = c.id
WHERE p.status NOT IN ('Closed')
ORDER BY p.sla_date ASC;
```

---

## 5. Indexes Summary

Critical indexes for performance:

```sql
-- Users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- Assets (most queried table)
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_serial ON assets(serial_number);
CREATE INDEX idx_assets_model ON assets(product_model_id);
CREATE INDEX idx_assets_location ON assets(location_id);
CREATE INDEX idx_assets_received_date ON assets(received_date);

-- Invoices
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);

-- Preorders
CREATE INDEX idx_preorders_status ON preorders(status);
CREATE INDEX idx_preorders_sla ON preorders(sla_date);

-- Repair Tickets
CREATE INDEX idx_repair_tickets_status ON repair_tickets(status);
CREATE INDEX idx_repair_tickets_assigned ON repair_tickets(assigned_to);
```

---

## 6. Triggers and Automation

### 6.1 Auto-update timestamps

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at column
CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_timestamp BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_timestamp BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ... repeat for all tables with updated_at
```

### 6.2 Auto-generate invoice numbers

```sql
CREATE SEQUENCE invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || LPAD(nextval('invoice_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoice_number BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();
```

### 6.3 Create inventory movement on asset status change

```sql
CREATE OR REPLACE FUNCTION log_asset_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != NEW.status OR OLD.location_id != NEW.location_id THEN
    INSERT INTO inventory_movements (
      asset_id,
      from_location_id,
      to_location_id,
      from_status,
      to_status,
      reason
    ) VALUES (
      NEW.id,
      OLD.location_id,
      NEW.location_id,
      OLD.status,
      NEW.status,
      'Auto-logged on asset update'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_asset_changes AFTER UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION log_asset_movement();
```

---

## 7. Data Integrity Rules

### 7.1 Constraints

1. **Asset can only be on one invoice**:
   - `invoice_id` is nullable but once set (when sold), should not change
   - Enforce in application logic: check `asset.status = 'Sold'` before allowing another sale

2. **Invoice line must reference either asset OR bulk_stock, not both**:
   - CHECK constraint on `invoice_lines` table enforces this

3. **Preorder deposit must be paid before ordering**:
   - Application logic: status transition from `Deposit Pending` to `Ordered` requires `deposit_paid = TRUE`

4. **Warranty end_date must be after start_date**:
   ```sql
   ALTER TABLE warranties ADD CONSTRAINT check_warranty_dates
     CHECK (end_date > start_date);
   ```

5. **Payment amount must be positive**:
   ```sql
   ALTER TABLE payments ADD CONSTRAINT check_payment_amount
     CHECK (amount > 0);
   ```

### 7.2 Soft Deletes (Recommended)

Instead of deleting records, add `deleted_at` timestamp and filter queries:

```sql
ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_customers_deleted ON customers(deleted_at);

-- Query active customers
SELECT * FROM customers WHERE deleted_at IS NULL;
```

---

## 8. Seed Data Strategy

### 8.1 Core Reference Data (Always Seed)

- `locations`: Shop Floor, Backroom, Repair Bench, Warehouse
- `lead_sources`: Instagram, Walk-in, Referral, etc.
- `users`: Admin user (username: admin, password: changeme123)

### 8.2 Development Data (Seed for Testing)

- 5-10 sample customers (retail + wholesale)
- 20-30 product models (HP EliteBook, Lenovo ThinkPad, MacBook, accessories)
- 50-100 assets in various statuses
- 10-20 invoices with payments
- 5-10 preorders in different stages
- 3-5 repair tickets
- 2-3 warranties

---

## 9. Database Backup Strategy

### 9.1 Daily Backups

```bash
# Automated daily backup script
pg_dump -U bizhub_user -h localhost bizhub_db | gzip > backups/bizhub_$(date +%Y%m%d).sql.gz

# Retain backups: 7 daily, 4 weekly, 6 monthly
```

### 9.2 Point-in-Time Recovery

Enable WAL archiving in PostgreSQL config for PITR capability (production only).

---

## 10. Migration Plan

### 10.1 Initial Schema Creation

Use Sequelize migrations for version control:

```bash
npx sequelize-cli migration:generate --name create-initial-schema
npx sequelize-cli db:migrate
```

### 10.2 Future Schema Changes

Always use migrations, never modify schema directly:

```bash
npx sequelize-cli migration:generate --name add-bnpl-tables
# Edit migration file
npx sequelize-cli db:migrate
```

---

## 11. Performance Optimization

### 11.1 Query Optimization

- Use `EXPLAIN ANALYZE` for slow queries
- Add indexes for frequent WHERE, JOIN, ORDER BY columns
- Use pagination for large result sets
- Avoid `SELECT *`, specify required columns

### 11.2 Connection Pooling

```javascript
// Sequelize config
{
  pool: {
    max: 20,      // Maximum connections
    min: 5,       // Minimum connections
    acquire: 30000,
    idle: 10000
  }
}
```

### 11.3 Caching (Future)

- Cache dashboard metrics for 5 minutes (Redis)
- Cache product catalog (rarely changes)
- Invalidate cache on data changes

---

## 12. Security Considerations

### 12.1 Password Storage

- Use bcrypt with salt rounds = 10
- Never store plain-text passwords
- Enforce minimum password length (8 chars)

### 12.2 SQL Injection Prevention

- Use Sequelize parameterized queries (automatic)
- Never concatenate user input into SQL strings

### 12.3 Sensitive Data

- Consider encrypting: customer email, phone, address (GDPR)
- Mask credit card numbers if stored (PCI DSS)
- Audit log access to financial data

### 12.4 Database User Permissions

```sql
-- Create application user with limited permissions
CREATE USER bizhub_app WITH PASSWORD 'secure_password_here';
GRANT CONNECT ON DATABASE bizhub_db TO bizhub_app;
GRANT USAGE ON SCHEMA public TO bizhub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bizhub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bizhub_app;

-- Read-only user for reporting
CREATE USER bizhub_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE bizhub_db TO bizhub_readonly;
GRANT USAGE ON SCHEMA public TO bizhub_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bizhub_readonly;
```

---

## Next Steps

1. Review and approve schema design
2. Create Sequelize models matching this schema
3. Write migration files
4. Implement seed data
5. Test data integrity constraints
6. Build API endpoints that consume this schema

---

**Schema Version**: 1.0
**Last Updated**: 2026-01-14
**Database**: PostgreSQL 14+
**Total Tables**: 19 core tables + 4 views
**Status**: Ready for Implementation
