# BIZHUB API Specification
## REST API for Payless4Tech Business Hub

---

## 1. API Overview

**Base URL**: `http://localhost:3000/api/v1`
**Production**: `https://bizhub.payless4tech.com/api/v1`

**Protocol**: HTTPS (production), HTTP (development)
**Content-Type**: `application/json`
**Authentication**: JWT Bearer Token

---

## 2. Authentication

### 2.1 POST /auth/login

Authenticate user and receive JWT token.

**Request**:
```json
{
  "username": "admin",
  "password": "changeme123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "full_name": "System Administrator",
      "email": "admin@payless4tech.com",
      "role": "Admin"
    }
  },
  "message": "Login successful"
}
```

**Error** (401 Unauthorized):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid username or password"
  }
}
```

---

### 2.2 POST /auth/logout

Logout (client-side token invalidation).

**Request Headers**:
```
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

### 2.3 GET /auth/me

Get current authenticated user info.

**Request Headers**:
```
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "full_name": "System Administrator",
    "email": "admin@payless4tech.com",
    "role": "Admin",
    "is_active": true
  }
}
```

---

## 3. User Management

### 3.1 GET /users

List all users.

**Authorization**: Admin, Manager

**Query Parameters**:
- `page` (int): Page number (default: 1)
- `limit` (int): Items per page (default: 50, max: 100)
- `role` (string): Filter by role
- `is_active` (boolean): Filter by active status

**Request**:
```
GET /users?page=1&limit=20&role=Sales
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "username": "john.doe",
      "full_name": "John Doe",
      "email": "john@payless4tech.com",
      "role": "Sales",
      "phone": "+233240000001",
      "is_active": true,
      "created_at": "2024-01-15T10:30:00Z",
      "last_login": "2024-03-20T14:22:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 8,
    "total_pages": 1
  }
}
```

---

### 3.2 POST /users

Create new user.

**Authorization**: Admin only

**Request**:
```json
{
  "username": "jane.smith",
  "email": "jane@payless4tech.com",
  "password": "SecurePass123!",
  "full_name": "Jane Smith",
  "role": "Technician",
  "phone": "+233240000010"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 9,
    "username": "jane.smith",
    "full_name": "Jane Smith",
    "email": "jane@payless4tech.com",
    "role": "Technician",
    "is_active": true
  },
  "message": "User created successfully"
}
```

---

### 3.3 PUT /users/:id

Update user.

**Authorization**: Admin only

**Request**:
```json
{
  "full_name": "Jane Smith-Mensah",
  "phone": "+233240000011",
  "role": "Manager"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 9,
    "username": "jane.smith",
    "full_name": "Jane Smith-Mensah",
    "role": "Manager"
  },
  "message": "User updated successfully"
}
```

---

### 3.4 DELETE /users/:id

Deactivate user (soft delete).

**Authorization**: Admin only

**Response** (200 OK):
```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

---

## 4. Dashboard Metrics

### 4.1 GET /dashboard/metrics

Get all dashboard widget data.

**Authorization**: All authenticated users (filtered by role)

**Query Parameters**:
- `date` (string): Date for "today's" metrics (default: today, format: YYYY-MM-DD)

**Request**:
```
GET /dashboard/metrics?date=2024-03-20
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "today_sales": {
      "total_amount": 15420.50,
      "transaction_count": 7,
      "retail_amount": 12300.00,
      "wholesale_amount": 3120.50
    },
    "inventory_on_hand": {
      "total_units": 143,
      "by_category": {
        "Laptop": 89,
        "Phone": 31,
        "Accessory": 23
      },
      "ready_for_sale": 67,
      "reserved": 5
    },
    "low_stock_alerts": {
      "count": 3,
      "items": [
        {
          "sku": "CHG-HP65W",
          "item_name": "HP 65W Charger",
          "quantity": 4,
          "reorder_threshold": 10
        }
      ]
    },
    "aging_stock": {
      "30_days": 12,
      "60_days": 8,
      "90_plus_days": 3
    },
    "needs_attention": {
      "diagnostics_pending": 5,
      "wipe_pending": 3,
      "qc_pending": 2,
      "preorders_sla_breach": 1,
      "repairs_open": 4
    },
    "preorders_summary": {
      "total_active": 12,
      "deposit_pending": 2,
      "in_transit": 5,
      "arrived": 3,
      "overdue": 1
    },
    "repairs_summary": {
      "open": 4,
      "in_repair": 2,
      "waiting_for_parts": 1,
      "ready": 3
    },
    "top_sellers": {
      "last_7_days": [
        {
          "model_name": "HP EliteBook 840 G7 i5 16GB 512GB",
          "units_sold": 8,
          "total_revenue": 25600.00
        }
      ]
    },
    "lead_source_breakdown": [
      { "source": "Instagram", "count": 45, "percentage": 52 },
      { "source": "Walk-in", "count": 28, "percentage": 32 },
      { "source": "Referral", "count": 14, "percentage": 16 }
    ]
  }
}
```

---

## 5. Inventory Management

### 5.1 GET /product-models

List product models (catalog).

**Authorization**: All authenticated users

**Query Parameters**:
- `category` (string): Laptop, Phone, Accessory
- `brand` (string): HP, Lenovo, Apple, etc.
- `search` (string): Search in model name

**Request**:
```
GET /product-models?category=Laptop&brand=HP
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "category": "Laptop",
      "brand": "HP",
      "model_name": "EliteBook 840 G7",
      "cpu": "Intel Core i5-10310U",
      "ram": "16GB DDR4",
      "storage": "512GB NVMe SSD",
      "screen_size": "14\" FHD",
      "operating_system": "Windows 11 Pro",
      "default_price_grade_a": 3200.00,
      "default_price_grade_b": 2800.00,
      "default_price_grade_c": 2400.00
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "total_pages": 1
  }
}
```

---

### 5.2 POST /product-models

Create product model.

**Authorization**: Admin, Manager

**Request**:
```json
{
  "category": "Laptop",
  "brand": "Lenovo",
  "model_name": "ThinkPad X1 Carbon Gen 9",
  "cpu": "Intel Core i7-1165G7",
  "ram": "16GB LPDDR4X",
  "storage": "512GB NVMe SSD",
  "screen_size": "14\" FHD",
  "operating_system": "Windows 11 Pro",
  "default_price_grade_a": 4200.00,
  "default_price_grade_b": 3800.00,
  "default_price_grade_c": 3200.00
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 15,
    "model_name": "ThinkPad X1 Carbon Gen 9",
    "brand": "Lenovo"
  },
  "message": "Product model created successfully"
}
```

---

### 5.3 GET /assets

List all serialized assets.

**Authorization**: All authenticated users

**Query Parameters**:
- `status` (string): Filter by status (Ready for Sale, Sold, etc.)
- `category` (string): Laptop, Phone
- `brand` (string): HP, Apple, etc.
- `condition_grade` (string): A, B, C
- `location_id` (int): Filter by location
- `model_id` (int): Filter by product model
- `min_age_days` (int): Assets older than X days
- `search` (string): Search serial number, asset tag

**Request**:
```
GET /assets?status=Ready for Sale&category=Laptop&condition_grade=A
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "asset_tag": "LT-2024-042",
      "serial_number": "5CD4432PQ7",
      "product_model": {
        "id": 1,
        "brand": "HP",
        "model_name": "EliteBook 840 G7",
        "category": "Laptop"
      },
      "condition_grade": "A",
      "status": "Ready for Sale",
      "location": {
        "id": 1,
        "location_name": "Shop Floor"
      },
      "purchase_cost": 2100.00,
      "landed_cost": 2250.00,
      "expected_sale_price": 3200.00,
      "battery_health_percent": 92,
      "received_date": "2024-02-10",
      "days_in_inventory": 39,
      "cosmetic_notes": "Minor scratch on lid, otherwise excellent",
      "accessories_included": "Charger, carrying case"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 67,
    "total_pages": 2
  }
}
```

---

### 5.4 GET /assets/:id

Get single asset details.

**Authorization**: All authenticated users

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 42,
    "asset_tag": "LT-2024-042",
    "serial_number": "5CD4432PQ7",
    "product_model": {
      "id": 1,
      "brand": "HP",
      "model_name": "EliteBook 840 G7",
      "cpu": "Intel Core i5-10310U",
      "ram": "16GB DDR4",
      "storage": "512GB NVMe SSD"
    },
    "supplier": "US Liquidator XYZ",
    "purchase_cost": 2100.00,
    "landed_cost": 2250.00,
    "received_date": "2024-02-10",
    "condition_grade": "A",
    "cosmetic_notes": "Minor scratch on lid",
    "battery_health_percent": 92,
    "battery_cycle_count": 87,
    "status": "Ready for Sale",
    "location": {
      "id": 1,
      "location_name": "Shop Floor"
    },
    "accessories_included": "Charger, carrying case",
    "diagnostics": {
      "id": 23,
      "technician": "Jane Smith",
      "diagnostic_date": "2024-02-12",
      "overall_result": "Pass",
      "checklist_data": {
        "power_on": "pass",
        "display": "pass",
        "keyboard": "pass",
        "ports": "all working"
      }
    },
    "wipe_certificate": {
      "id": 18,
      "technician": "Jane Smith",
      "wipe_method": "DOD 3-pass",
      "wipe_date": "2024-02-13"
    },
    "history": [
      {
        "date": "2024-02-10",
        "event": "Asset received",
        "status": "Received"
      },
      {
        "date": "2024-02-12",
        "event": "Diagnostics completed",
        "status": "Wipe Pending"
      },
      {
        "date": "2024-02-13",
        "event": "Data wipe completed",
        "status": "QC Pending"
      },
      {
        "date": "2024-02-14",
        "event": "QC passed, ready for sale",
        "status": "Ready for Sale"
      }
    ]
  }
}
```

---

### 5.5 POST /assets

Receive new asset into inventory.

**Authorization**: Warehouse, Manager, Admin

**Request**:
```json
{
  "asset_tag": "LT-2024-150",
  "serial_number": "C02XY1234567",
  "product_model_id": 5,
  "supplier": "Mac Liquidation LLC",
  "purchase_cost": 3800.00,
  "landed_cost": 4100.00,
  "received_date": "2024-03-20",
  "location_id": 4,
  "notes": "MacBook Pro 2020 13-inch, good condition"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 150,
    "asset_tag": "LT-2024-150",
    "serial_number": "C02XY1234567",
    "status": "Received"
  },
  "message": "Asset received successfully"
}
```

---

### 5.6 POST /assets/batch

Receive multiple assets at once.

**Authorization**: Warehouse, Manager, Admin

**Request**:
```json
{
  "supplier": "US Liquidator XYZ",
  "received_date": "2024-03-20",
  "location_id": 4,
  "assets": [
    {
      "serial_number": "5CD1234ABC",
      "product_model_id": 1,
      "purchase_cost": 2000.00
    },
    {
      "serial_number": "5CD5678DEF",
      "product_model_id": 1,
      "purchase_cost": 2100.00
    }
  ]
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "received_count": 2,
    "asset_ids": [151, 152]
  },
  "message": "2 assets received successfully"
}
```

---

### 5.7 PATCH /assets/:id

Update asset (general update).

**Authorization**: Warehouse, Technician, Manager, Admin

**Request**:
```json
{
  "condition_grade": "A",
  "cosmetic_notes": "Excellent condition, no visible wear",
  "accessories_included": "Charger, USB-C adapter, carrying case",
  "location_id": 1
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 42,
    "condition_grade": "A",
    "location": "Shop Floor"
  },
  "message": "Asset updated successfully"
}
```

---

### 5.8 POST /assets/:id/diagnostics

Submit diagnostics results.

**Authorization**: Technician, Manager, Admin

**Request**:
```json
{
  "checklist_data": {
    "power_on": "pass",
    "display": "pass",
    "keyboard": "pass",
    "trackpad": "pass",
    "ports": "all working",
    "wifi": "pass",
    "bluetooth": "pass",
    "speakers": "pass",
    "webcam": "pass",
    "battery": "holds charge, 85% health"
  },
  "overall_result": "Pass",
  "battery_health_percent": 85,
  "battery_cycle_count": 120,
  "notes": "All tests passed, minor screen scratch"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "asset_id": 42,
    "status": "Wipe Pending",
    "diagnostics_id": 67
  },
  "message": "Diagnostics completed, asset status updated to Wipe Pending"
}
```

---

### 5.9 POST /assets/:id/wipe

Mark data wipe completed.

**Authorization**: Technician, Manager, Admin

**Request**:
```json
{
  "wipe_method": "DOD 3-pass",
  "certificate_reference": "BLANCCO-20240320-001",
  "notes": "Data wipe successful, certificate generated"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "asset_id": 42,
    "status": "QC Pending",
    "wipe_certificate_id": 89
  },
  "message": "Data wipe completed, asset moved to QC"
}
```

---

### 5.10 POST /assets/:id/qc

Complete quality check.

**Authorization**: Technician, Manager, Admin

**Request**:
```json
{
  "qc_passed": true,
  "condition_grade": "A",
  "cosmetic_notes": "Excellent condition",
  "accessories_to_bundle": "HP 65W charger, carrying case",
  "ready_for_sale": true
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "asset_id": 42,
    "status": "Ready for Sale",
    "condition_grade": "A"
  },
  "message": "QC completed, asset is now ready for sale"
}
```

---

### 5.11 POST /assets/:id/flag-not-sellable

Flag asset as not sellable.

**Authorization**: Manager, Admin

**Request**:
```json
{
  "reason": "Motherboard failure, repair not cost-effective"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "asset_id": 42,
    "status": "Not Sellable"
  },
  "message": "Asset flagged as not sellable"
}
```

---

### 5.12 GET /bulk-stock

List bulk inventory items.

**Authorization**: All authenticated users

**Query Parameters**:
- `category` (string): Filter by category
- `low_stock` (boolean): Only show items below reorder threshold

**Request**:
```
GET /bulk-stock?low_stock=true
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "sku": "CHG-HP65W",
      "item_name": "HP 65W Charger",
      "category": "Charger",
      "quantity": 4,
      "reorder_threshold": 10,
      "unit_cost": 25.00,
      "unit_price": 50.00,
      "supplier": "Tech Wholesale Ghana",
      "location": "Backroom"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 3,
    "total_pages": 1
  }
}
```

---

### 5.13 POST /bulk-stock

Add new bulk stock item.

**Authorization**: Warehouse, Manager, Admin

**Request**:
```json
{
  "sku": "MOUSE-LOG-M185",
  "item_name": "Logitech M185 Wireless Mouse",
  "category": "Mouse",
  "unit_cost": 15.00,
  "unit_price": 35.00,
  "quantity": 50,
  "reorder_threshold": 20,
  "supplier": "Tech Wholesale Ghana",
  "location_id": 2
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 23,
    "sku": "MOUSE-LOG-M185",
    "quantity": 50
  },
  "message": "Bulk stock item added"
}
```

---

### 5.14 PATCH /bulk-stock/:id/adjust

Adjust quantity (restock or correction).

**Authorization**: Warehouse, Manager, Admin

**Request**:
```json
{
  "adjustment": 20,
  "reason": "Restocked from supplier",
  "reference": "PO-20240320-001"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "sku": "CHG-HP65W",
    "old_quantity": 4,
    "new_quantity": 24
  },
  "message": "Stock adjusted successfully"
}
```

---

## 6. Sales & Invoicing

### 6.1 GET /invoices

List invoices.

**Authorization**: Sales, Manager, Admin

**Query Parameters**:
- `status` (string): Draft, Paid, Cancelled
- `customer_id` (int): Filter by customer
- `start_date` (string): YYYY-MM-DD
- `end_date` (string): YYYY-MM-DD
- `lead_source` (string): Instagram, Walk-in, etc.

**Request**:
```
GET /invoices?status=Paid&start_date=2024-03-01&end_date=2024-03-31
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 87,
      "invoice_number": "INV-000087",
      "customer": {
        "id": 23,
        "full_name": "Kwame Mensah",
        "phone": "+233241234567"
      },
      "invoice_date": "2024-03-15",
      "status": "Paid",
      "subtotal": 3200.00,
      "tax_amount": 0,
      "total_amount": 3200.00,
      "total_paid": 3200.00,
      "lead_source": "Instagram",
      "sales_rep": "John Doe"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 45,
    "total_pages": 1
  }
}
```

---

### 6.2 GET /invoices/:id

Get invoice details.

**Authorization**: Sales, Manager, Admin

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 87,
    "invoice_number": "INV-000087",
    "customer": {
      "id": 23,
      "full_name": "Kwame Mensah",
      "business_name": null,
      "phone": "+233241234567",
      "email": "kmensah@example.com",
      "customer_type": "Retail"
    },
    "invoice_date": "2024-03-15",
    "status": "Paid",
    "subtotal": 3200.00,
    "tax_amount": 0,
    "total_amount": 3200.00,
    "lead_source": "Instagram",
    "sales_rep": {
      "id": 2,
      "full_name": "John Doe"
    },
    "lines": [
      {
        "id": 145,
        "line_number": 1,
        "item_description": "HP EliteBook 840 G7 i5 16GB 512GB - Grade A",
        "asset": {
          "id": 42,
          "serial_number": "5CD4432PQ7",
          "asset_tag": "LT-2024-042"
        },
        "quantity": 1,
        "unit_price": 3200.00,
        "unit_cost": 2250.00,
        "line_total": 3200.00,
        "profit": 950.00
      }
    ],
    "payments": [
      {
        "id": 98,
        "payment_date": "2024-03-15",
        "payment_method": "MoMo",
        "amount": 3200.00,
        "reference": "MOMO-20240315-123456",
        "received_by": "John Doe"
      }
    ],
    "total_paid": 3200.00,
    "balance_due": 0,
    "notes": null,
    "created_at": "2024-03-15T10:30:00Z"
  }
}
```

---

### 6.3 POST /invoices

Create new invoice.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "customer_id": 23,
  "customer_type": "Retail",
  "invoice_date": "2024-03-20",
  "lead_source": "Instagram",
  "lines": [
    {
      "asset_id": 42,
      "item_description": "HP EliteBook 840 G7 i5 16GB 512GB - Grade A",
      "quantity": 1,
      "unit_price": 3200.00,
      "unit_cost": 2250.00
    },
    {
      "bulk_stock_id": 5,
      "item_description": "HP 65W Charger (extra)",
      "quantity": 1,
      "unit_price": 50.00,
      "unit_cost": 25.00
    }
  ],
  "notes": "Customer requested extra charger"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 150,
    "invoice_number": "INV-000150",
    "status": "Draft",
    "total_amount": 3250.00,
    "balance_due": 3250.00
  },
  "message": "Invoice created successfully"
}
```

**Business Rules**:
- When invoice includes an asset, reserve it (status → Reserved)
- For bulk items, check availability before creating line
- Auto-calculate subtotal, tax, total

---

### 6.4 POST /invoices/:id/payments

Add payment to invoice.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "payment_method": "MoMo",
  "amount": 3250.00,
  "reference": "MOMO-20240320-789012",
  "payment_date": "2024-03-20"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "invoice_id": 150,
    "invoice_status": "Paid",
    "total_amount": 3250.00,
    "total_paid": 3250.00,
    "balance_due": 0
  },
  "message": "Payment recorded, invoice marked as Paid"
}
```

**Business Rules**:
- When `total_paid >= total_amount`, update invoice status to `Paid`
- Update asset status from `Reserved` to `Sold`
- Decrement bulk stock quantities
- Create inventory movement records

---

### 6.5 POST /invoices/:id/cancel

Cancel invoice.

**Authorization**: Manager, Admin

**Request**:
```json
{
  "reason": "Customer changed mind"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "invoice_id": 150,
    "status": "Cancelled"
  },
  "message": "Invoice cancelled"
}
```

**Business Rules**:
- Release reserved assets (status → Ready for Sale)
- Restore bulk stock quantities if paid invoice
- Cannot cancel if payments received (must refund first)

---

### 6.6 GET /customers

List customers.

**Authorization**: Sales, Manager, Admin

**Query Parameters**:
- `customer_type` (string): Retail, Wholesale
- `search` (string): Search name, phone, email

**Request**:
```
GET /customers?search=kwame
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 23,
      "customer_type": "Retail",
      "full_name": "Kwame Mensah",
      "phone": "+233241234567",
      "email": "kmensah@example.com",
      "address": "Dansoman, Accra",
      "total_purchases": 8,
      "total_spent": 18900.00,
      "last_purchase_date": "2024-03-15"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "total_pages": 1
  }
}
```

---

### 6.7 POST /customers

Create new customer.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "customer_type": "Retail",
  "full_name": "Ama Osei",
  "phone": "+233245678901",
  "email": "ama.osei@example.com",
  "address": "East Legon, Accra",
  "notes": "Referred by Kwame Mensah"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 78,
    "full_name": "Ama Osei",
    "phone": "+233245678901"
  },
  "message": "Customer created successfully"
}
```

---

### 6.8 GET /customers/:id

Get customer details with purchase history.

**Authorization**: Sales, Manager, Admin

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 23,
    "customer_type": "Retail",
    "full_name": "Kwame Mensah",
    "phone": "+233241234567",
    "email": "kmensah@example.com",
    "address": "Dansoman, Accra",
    "created_at": "2023-05-10T08:00:00Z",
    "stats": {
      "total_purchases": 8,
      "total_spent": 18900.00,
      "avg_purchase": 2362.50,
      "last_purchase_date": "2024-03-15"
    },
    "recent_invoices": [
      {
        "invoice_number": "INV-000087",
        "invoice_date": "2024-03-15",
        "total_amount": 3200.00,
        "status": "Paid"
      }
    ],
    "active_warranties": [
      {
        "warranty_number": "WAR-000023",
        "asset": "HP EliteBook 840 G7 - 5CD4432PQ7",
        "end_date": "2025-03-15"
      }
    ]
  }
}
```

---

## 7. Preorders

### 7.1 GET /preorders

List preorders.

**Authorization**: Sales, Manager, Admin

**Query Parameters**:
- `status` (string): Deposit Pending, Ordered, Arrived, etc.
- `customer_id` (int): Filter by customer
- `overdue` (boolean): Only SLA breached preorders

**Request**:
```
GET /preorders?status=In Transit&overdue=false
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "preorder_number": "PRE-000012",
      "customer": {
        "id": 34,
        "full_name": "Kofi Asante",
        "phone": "+233240111222"
      },
      "requested_specs": "MacBook Pro M1 16GB 512GB Space Gray",
      "target_price_min": 5000.00,
      "target_price_max": 5500.00,
      "deposit_amount": 500.00,
      "deposit_paid": true,
      "status": "In Transit",
      "order_date": "2024-03-05",
      "sla_date": "2024-03-26",
      "days_until_sla": 6,
      "is_overdue": false
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 5,
    "total_pages": 1
  }
}
```

---

### 7.2 GET /preorders/:id

Get preorder details.

**Authorization**: Sales, Manager, Admin

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 12,
    "preorder_number": "PRE-000012",
    "customer": {
      "id": 34,
      "full_name": "Kofi Asante",
      "phone": "+233240111222",
      "email": "kofi@example.com"
    },
    "requested_specs": "MacBook Pro M1 16GB 512GB Space Gray",
    "target_price_min": 5000.00,
    "target_price_max": 5500.00,
    "deposit_amount": 500.00,
    "deposit_paid": true,
    "deposit_date": "2024-03-05",
    "deposit_payment_method": "MoMo",
    "status": "In Transit",
    "order_date": "2024-03-05",
    "sla_date": "2024-03-26",
    "days_until_sla": 6,
    "is_overdue": false,
    "asset": null,
    "policy_terms": "Deposit applied toward purchase. If rejected, Payless4Tech may resell before reimbursing. Customer owes any shortfall.",
    "notes": "Customer prefers space gray color",
    "events": [
      {
        "event_type": "created",
        "from_status": null,
        "to_status": "Deposit Pending",
        "created_at": "2024-03-05T09:00:00Z"
      },
      {
        "event_type": "deposit_received",
        "from_status": "Deposit Pending",
        "to_status": "Ordered",
        "created_at": "2024-03-05T10:30:00Z"
      },
      {
        "event_type": "shipped",
        "from_status": "Ordered",
        "to_status": "In Transit",
        "notes": "Tracking: USPS-1234567890",
        "created_at": "2024-03-10T14:00:00Z"
      }
    ]
  }
}
```

---

### 7.3 POST /preorders

Create new preorder.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "customer_id": 34,
  "requested_specs": "MacBook Pro M1 16GB 512GB Space Gray",
  "target_price_min": 5000.00,
  "target_price_max": 5500.00,
  "deposit_amount": 500.00,
  "notes": "Customer wants space gray, 512GB minimum"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 15,
    "preorder_number": "PRE-000015",
    "status": "Deposit Pending",
    "deposit_amount": 500.00
  },
  "message": "Preorder created, awaiting deposit"
}
```

---

### 7.4 POST /preorders/:id/deposit

Record deposit payment.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "amount": 500.00,
  "payment_method": "MoMo",
  "reference": "MOMO-20240305-123456",
  "deposit_date": "2024-03-05"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "preorder_id": 15,
    "status": "Ordered",
    "sla_date": "2024-03-26"
  },
  "message": "Deposit recorded, preorder status updated to Ordered"
}
```

**Business Rules**:
- Update status: `Deposit Pending` → `Ordered`
- Set `order_date = deposit_date`
- Set `sla_date = order_date + 21 days`

---

### 7.5 POST /preorders/:id/link-asset

Link arrived asset to preorder.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "asset_id": 155,
  "arrival_date": "2024-03-18"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "preorder_id": 15,
    "status": "Arrived",
    "asset_id": 155,
    "asset_tag": "LT-2024-155"
  },
  "message": "Asset linked to preorder, status updated to Arrived"
}
```

**Business Rules**:
- Update preorder status: `In Transit` → `Arrived`
- Update asset status: → `Reserved`
- Link asset to preorder

---

### 7.6 POST /preorders/:id/notify-customer

Mark customer notified (manual action for MVP).

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "notification_method": "WhatsApp",
  "notes": "Called customer, will pick up tomorrow"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "preorder_id": 15,
    "status": "Customer Notified",
    "customer_notified_date": "2024-03-18"
  },
  "message": "Customer notified, status updated"
}
```

---

### 7.7 POST /preorders/:id/complete

Complete preorder (customer picked up and paid).

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "invoice_id": 160,
  "notes": "Customer accepted, full payment received"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "preorder_id": 15,
    "status": "Picked Up",
    "invoice_id": 160
  },
  "message": "Preorder completed successfully"
}
```

**Business Rules**:
- Preorder status: → `Picked Up` → `Closed`
- Invoice must include the linked asset
- Deposit amount applied to invoice

---

### 7.8 POST /preorders/:id/reject

Customer rejected preorder item.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "rejection_reason": "Customer wants different specs",
  "notes": "Customer prefers 1TB storage instead of 512GB"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "preorder_id": 15,
    "status": "Rejected",
    "asset_id": 155,
    "asset_status": "Available"
  },
  "message": "Preorder rejected, asset available for resale"
}
```

**Business Rules**:
- Preorder status: → `Rejected`
- Asset status: `Reserved` → `Available`
- Enable resale recovery tracking

---

### 7.9 POST /preorders/:id/resale-complete

Record resale of rejected preorder item.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "resale_invoice_id": 165,
  "resale_amount": 5300.00
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "preorder_id": 15,
    "status": "Resold",
    "deposit_owed": 500.00,
    "resale_amount": 5300.00,
    "recovery_balance": 4800.00,
    "customer_refund_due": 500.00
  },
  "message": "Resale recorded, customer eligible for full deposit refund"
}
```

**Business Rules**:
- Calculate: `recovery_balance = resale_amount - deposit_owed`
- If `recovery_balance >= 0`, refund full deposit to customer
- If `recovery_balance < 0`, customer owes difference

---

## 8. Warranties

### 8.1 GET /warranties

List warranties.

**Authorization**: All authenticated users

**Query Parameters**:
- `status` (string): Active, Expired, Claimed
- `customer_id` (int): Filter by customer
- `expiring_soon` (boolean): Expiring within 30 days

**Request**:
```
GET /warranties?status=Active
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 23,
      "warranty_number": "WAR-000023",
      "customer": {
        "id": 23,
        "full_name": "Kwame Mensah"
      },
      "asset": {
        "id": 42,
        "asset_tag": "LT-2024-042",
        "serial_number": "5CD4432PQ7",
        "model": "HP EliteBook 840 G7"
      },
      "warranty_tier": "Premium 1-Year",
      "start_date": "2024-03-15",
      "end_date": "2025-03-15",
      "days_remaining": 360,
      "status": "Active"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 34,
    "total_pages": 1
  }
}
```

---

### 8.2 POST /warranties

Create warranty (usually auto-created with invoice).

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "invoice_id": 87,
  "asset_id": 42,
  "customer_id": 23,
  "warranty_tier": "Premium 1-Year",
  "start_date": "2024-03-15",
  "includes_accessories": true,
  "includes_certificate": true,
  "includes_premium_boxing": true
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 23,
    "warranty_number": "WAR-000023",
    "end_date": "2025-03-15"
  },
  "message": "Warranty created successfully"
}
```

**Business Rules**:
- `end_date = start_date + warranty_tier_duration`
- Premium 1-Year: 365 days
- Standard: 90 days (if implemented)

---

### 8.3 GET /warranties/:id

Get warranty details.

**Authorization**: All authenticated users

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 23,
    "warranty_number": "WAR-000023",
    "invoice": {
      "invoice_number": "INV-000087",
      "invoice_date": "2024-03-15"
    },
    "customer": {
      "id": 23,
      "full_name": "Kwame Mensah",
      "phone": "+233241234567"
    },
    "asset": {
      "id": 42,
      "asset_tag": "LT-2024-042",
      "serial_number": "5CD4432PQ7",
      "product_model": {
        "brand": "HP",
        "model_name": "EliteBook 840 G7"
      }
    },
    "warranty_tier": "Premium 1-Year",
    "start_date": "2024-03-15",
    "end_date": "2025-03-15",
    "days_remaining": 360,
    "status": "Active",
    "coverage_details": "Hardware defects, excluding physical/water damage",
    "exclusions": "Physical damage, water damage, software issues, battery wear",
    "includes_accessories": true,
    "includes_certificate": true,
    "includes_premium_boxing": true,
    "claims": []
  }
}
```

---

### 8.4 POST /warranty-claims

Submit warranty claim.

**Authorization**: Sales, Manager, Admin

**Request**:
```json
{
  "warranty_id": 23,
  "customer_id": 23,
  "issue_description": "Laptop screen flickering, possible hardware defect",
  "claim_date": "2024-06-10"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 5,
    "claim_number": "WCLAIM-000005",
    "status": "Submitted"
  },
  "message": "Warranty claim submitted"
}
```

**Business Rules**:
- Validate warranty is active (current_date <= end_date)
- Auto-create repair ticket linked to claim

---

### 8.5 PATCH /warranty-claims/:id

Update warranty claim status.

**Authorization**: Manager, Admin

**Request**:
```json
{
  "status": "Approved",
  "repair_ticket_id": 45
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "claim_id": 5,
    "status": "Approved",
    "repair_ticket_id": 45
  },
  "message": "Warranty claim approved, repair ticket created"
}
```

---

### 8.6 POST /warranty-claims/:id/complete

Complete warranty claim.

**Authorization**: Manager, Admin

**Request**:
```json
{
  "outcome": "Repaired",
  "labor_cost": 150.00,
  "parts_cost": 200.00,
  "notes": "Replaced LCD panel, issue resolved"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "claim_id": 5,
    "status": "Completed",
    "outcome": "Repaired",
    "total_cost": 350.00
  },
  "message": "Warranty claim completed"
}
```

---

## 9. Repairs

### 9.1 GET /repair-tickets

List repair tickets.

**Authorization**: Technician, Manager, Admin

**Query Parameters**:
- `status` (string): Open, In Repair, Closed
- `assigned_to` (int): Filter by technician
- `customer_id` (int): Filter by customer

**Request**:
```
GET /repair-tickets?status=Open
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 45,
      "ticket_number": "TKT-000045",
      "customer": {
        "id": 23,
        "full_name": "Kwame Mensah"
      },
      "asset": {
        "id": 42,
        "asset_tag": "LT-2024-042",
        "model": "HP EliteBook 840 G7"
      },
      "issue_type": "Screen Repair",
      "issue_description": "Screen flickering",
      "status": "Open",
      "opened_date": "2024-06-10",
      "assigned_to": {
        "id": 9,
        "full_name": "Jane Smith"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 4,
    "total_pages": 1
  }
}
```

---

### 9.2 GET /repair-tickets/:id

Get repair ticket details.

**Authorization**: Technician, Manager, Admin

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 45,
    "ticket_number": "TKT-000045",
    "customer": {
      "id": 23,
      "full_name": "Kwame Mensah",
      "phone": "+233241234567"
    },
    "asset": {
      "id": 42,
      "asset_tag": "LT-2024-042",
      "serial_number": "5CD4432PQ7",
      "model": "HP EliteBook 840 G7"
    },
    "issue_type": "Screen Repair",
    "issue_description": "Screen flickering, possible hardware defect",
    "status": "In Repair",
    "assigned_to": {
      "id": 9,
      "full_name": "Jane Smith"
    },
    "opened_date": "2024-06-10",
    "closed_date": null,
    "outcome": null,
    "labor_cost": 0,
    "parts_cost": 0,
    "total_cost": 0,
    "warranty_claim": {
      "id": 5,
      "claim_number": "WCLAIM-000005"
    },
    "events": [
      {
        "event_type": "created",
        "from_status": null,
        "to_status": "Open",
        "created_at": "2024-06-10T09:00:00Z"
      },
      {
        "event_type": "assigned",
        "notes": "Assigned to Jane Smith",
        "created_at": "2024-06-10T09:15:00Z"
      },
      {
        "event_type": "status_change",
        "from_status": "Open",
        "to_status": "Diagnosing",
        "notes": "Started diagnostics",
        "created_at": "2024-06-10T10:00:00Z"
      }
    ],
    "notes": "Customer reports flickering started 2 days ago"
  }
}
```

---

### 9.3 POST /repair-tickets

Create repair ticket.

**Authorization**: Sales, Technician, Manager, Admin

**Request**:
```json
{
  "customer_id": 23,
  "asset_id": 42,
  "issue_type": "Screen Repair",
  "issue_description": "Screen flickering, possible hardware defect",
  "assigned_to": 9
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 45,
    "ticket_number": "TKT-000045",
    "status": "Open"
  },
  "message": "Repair ticket created"
}
```

**Business Rules**:
- If asset linked, update asset status to `Repair Hold`

---

### 9.4 PATCH /repair-tickets/:id

Update repair ticket (status, notes, costs).

**Authorization**: Technician, Manager, Admin

**Request**:
```json
{
  "status": "Waiting for Parts",
  "notes": "Ordered replacement LCD panel, ETA 5 days"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "ticket_id": 45,
    "status": "Waiting for Parts"
  },
  "message": "Repair ticket updated"
}
```

---

### 9.5 POST /repair-tickets/:id/complete

Complete repair ticket.

**Authorization**: Technician, Manager, Admin

**Request**:
```json
{
  "outcome": "Repaired",
  "labor_cost": 150.00,
  "parts_cost": 200.00,
  "resolution_notes": "Replaced LCD panel, tested successfully"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "ticket_id": 45,
    "status": "Closed",
    "outcome": "Repaired",
    "total_cost": 350.00,
    "closed_date": "2024-06-15"
  },
  "message": "Repair completed successfully"
}
```

**Business Rules**:
- Update status to `Closed`
- Set `closed_date = current_date`
- If asset linked, update asset status (e.g., back to `Ready for Sale` or return to customer)

---

## 10. Reports

### 10.1 GET /reports/sales

Sales report.

**Authorization**: Manager, Admin

**Query Parameters**:
- `start_date` (string): YYYY-MM-DD (required)
- `end_date` (string): YYYY-MM-DD (required)
- `group_by` (string): day, week, month
- `lead_source` (string): Filter by lead source

**Request**:
```
GET /reports/sales?start_date=2024-03-01&end_date=2024-03-31&group_by=day
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "period": {
      "start_date": "2024-03-01",
      "end_date": "2024-03-31"
    },
    "summary": {
      "total_revenue": 145320.50,
      "transaction_count": 67,
      "avg_transaction": 2169.26,
      "total_cost": 98450.00,
      "gross_profit": 46870.50,
      "profit_margin": 32.26
    },
    "by_day": [
      {
        "date": "2024-03-01",
        "revenue": 4200.00,
        "transactions": 2
      }
    ],
    "by_channel": [
      { "lead_source": "Instagram", "revenue": 75600.00, "transactions": 35 },
      { "lead_source": "Walk-in", "revenue": 52400.00, "transactions": 24 },
      { "lead_source": "Referral", "revenue": 17320.50, "transactions": 8 }
    ],
    "by_customer_type": {
      "Retail": { "revenue": 120400.00, "transactions": 58 },
      "Wholesale": { "revenue": 24920.50, "transactions": 9 }
    },
    "top_products": [
      {
        "model": "HP EliteBook 840 G7",
        "units_sold": 12,
        "revenue": 38400.00
      }
    ]
  }
}
```

---

### 10.2 GET /reports/inventory-aging

Aging stock report.

**Authorization**: Manager, Admin

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_units": 143,
      "under_30_days": 98,
      "30_60_days": 32,
      "60_90_days": 10,
      "90_plus_days": 3
    },
    "aging_buckets": [
      {
        "bucket": "90+ days",
        "units": [
          {
            "asset_tag": "LT-2023-089",
            "serial_number": "ABC123",
            "model": "HP EliteBook 840 G5",
            "condition_grade": "C",
            "days_in_inventory": 120,
            "landed_cost": 1800.00
          }
        ]
      }
    ],
    "total_tied_capital": 321450.00
  }
}
```

---

### 10.3 GET /reports/low-stock

Low stock alert report.

**Authorization**: Warehouse, Manager, Admin

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "sku": "CHG-HP65W",
      "item_name": "HP 65W Charger",
      "category": "Charger",
      "quantity": 4,
      "reorder_threshold": 10,
      "shortage": 6,
      "supplier": "Tech Wholesale Ghana"
    }
  ]
}
```

---

### 10.4 GET /reports/preorder-sla

Preorder SLA breach report.

**Authorization**: Manager, Admin

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_active_preorders": 12,
      "overdue_count": 2,
      "due_within_7_days": 3
    },
    "overdue": [
      {
        "preorder_number": "PRE-000008",
        "customer": "Ama Osei",
        "requested_specs": "Lenovo ThinkPad X1 i7 16GB",
        "order_date": "2024-02-20",
        "sla_date": "2024-03-12",
        "days_overdue": 8,
        "status": "Ordered"
      }
    ]
  }
}
```

---

## 11. Error Handling

### 11.1 Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "fields": {
      "field_name": "Field-specific error message"
    }
  }
}
```

### 11.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_CREDENTIALS` | 401 | Username/password incorrect |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `FORBIDDEN` | 403 | Insufficient permissions for this action |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `DUPLICATE_ENTRY` | 400 | Unique constraint violation |
| `BUSINESS_RULE_VIOLATION` | 400 | Business logic constraint violated |
| `ASSET_NOT_AVAILABLE` | 400 | Asset cannot be sold (wrong status) |
| `INSUFFICIENT_STOCK` | 400 | Bulk item out of stock |
| `SERVER_ERROR` | 500 | Internal server error |

### 11.3 Example Error Responses

**Validation Error**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "fields": {
      "serial_number": "Serial number is required",
      "product_model_id": "Invalid product model ID"
    }
  }
}
```

**Business Rule Violation**:
```json
{
  "success": false,
  "error": {
    "code": "ASSET_NOT_AVAILABLE",
    "message": "Asset cannot be sold - status must be 'Ready for Sale' or 'Reserved', current status is 'Diagnostics Pending'"
  }
}
```

---

## 12. Rate Limiting & Throttling

**MVP**: No rate limiting
**Future**: 100 requests per minute per user

---

## 13. API Versioning

Current version: `v1`
All endpoints prefixed with `/api/v1`

Future versions will be introduced as `/api/v2` when breaking changes occur.

---

## 14. Postman Collection

A Postman collection will be provided with:
- All endpoint examples
- Environment variables (base URL, auth token)
- Pre-request scripts for authentication
- Test scripts for validation

---

## 15. WebSocket Support (Future)

For real-time dashboard updates:
- Connect to `ws://localhost:3000`
- Subscribe to channels: `dashboard.metrics`, `inventory.updates`, `sales.new`
- Receive push notifications for critical events

---

## Next Steps

1. Review and approve API specification
2. Create Postman collection for testing
3. Implement backend routes and controllers
4. Write API integration tests
5. Build frontend services layer to consume these endpoints

---

**API Version**: 1.0
**Last Updated**: 2026-01-14
**Total Endpoints**: 60+ REST endpoints
**Status**: Ready for Implementation
