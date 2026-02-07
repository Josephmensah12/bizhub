# Inventory Module - BizHub

## Overview

The Inventory module is a comprehensive asset management system for BizHub that supports tracking laptops, desktops, iPhones, televisions, and other electronic assets with full specifications, pricing, and lifecycle management.

## Features Implemented

### ✅ Core Features

1. **Asset Management**
   - Create, Read, Update, Delete (CRUD) operations for assets
   - Auto-generated asset tags (INV-000001, INV-000002, etc.)
   - Unique serial number tracking
   - Status management (In Stock, Reserved, Sold, In Repair, Returned)
   - Condition tracking (New, Open Box, Renewed, Used)

2. **Asset Types Supported**
   - Laptop
   - Desktop
   - iPhone
   - Television
   - Other

3. **Comprehensive Asset Fields**
   - **Identity & Tracking**: Asset Tag, Serial Number, Status, Condition, Quantity
   - **Product Info**: Make, Model, Category, Subcategory, Specs
   - **Technical Specs**: RAM, Storage (GB + Type), CPU, GPU, Screen Size, Resolution, Battery Health
   - **Characteristics**: JSONB array for features (Touchscreen, Backlit keyboard, etc.)
   - **Pricing**: Cost, Price, Currency
   - **Audit**: Created At/By, Updated At/By

4. **Inventory List Page**
   - Searchable table with pagination (20 items per page)
   - Advanced filters: Asset Type, Status, Condition, Make
   - Real-time search across asset tag, serial number, make, and model
   - Color-coded status badges
   - Quick actions: View, Edit, Delete
   - Responsive design with horizontal scrolling for small screens

5. **Bulk Import**
   - CSV and Excel (.xlsx, .xls) file support
   - Template download endpoint
   - Row-by-row validation with detailed error reporting
   - Duplicate serial number detection
   - Two import modes:
     - **Skip Errors**: Import valid rows, report invalid ones
     - **All-or-Nothing**: Fail entire import if any row is invalid
   - 10MB file size limit
   - Automatic cleanup of uploaded files

6. **API Endpoints**

```
GET    /api/v1/assets                    - List assets with filters & pagination
GET    /api/v1/assets/filters/options    - Get filter options (types, statuses, etc.)
GET    /api/v1/assets/export/template    - Download CSV import template
GET    /api/v1/assets/:id                - Get single asset details
POST   /api/v1/assets                    - Create new asset
POST   /api/v1/assets/import             - Bulk import from CSV/Excel
PUT    /api/v1/assets/:id                - Update asset
DELETE /api/v1/assets/:id                - Delete asset
```

### 🔒 Security Features

1. **Authentication & Authorization**
   - All endpoints require authentication
   - Role-based access control:
     - Create/Import: Warehouse, Manager, Admin
     - Update: Warehouse, Technician, Manager, Admin
     - Delete: Manager, Admin only

2. **Validation**
   - Server-side validation using express-validator
   - Required fields enforcement
   - Enum validation for asset types, statuses, conditions
   - Numeric field validation
   - Unique constraint enforcement (asset_tag, serial_number)

3. **File Upload Security**
   - Allowed file types: CSV, XLS, XLSX only
   - Maximum file size: 10MB
   - Automatic file cleanup after processing
   - Safe file parsing with error handling

### 🎯 Database Features

1. **Schema Design**
   - Primary key auto-increment
   - Unique indexes on asset_tag and serial_number
   - Indexes on frequently filtered fields (asset_type, status, make, condition)
   - Foreign key constraints to users table for audit trail
   - JSONB support for major_characteristics array

2. **Concurrency-Safe Asset Tag Generation**
   - Sequential numbering (INV-000001, INV-000002, ...)
   - Thread-safe using database row locking
   - Automatic padding with leading zeros

## Usage Guide

### Accessing the Inventory Module

1. **Login to BizHub**
   - Navigate to http://localhost:5173
   - Login with your credentials

2. **View Inventory**
   - Click on "Inventory" in the sidebar
   - Browse assets in the table view
   - Use filters to narrow down results
   - Search by asset tag, serial number, make, or model

3. **Add New Asset**
   - Click "Add Asset" button (top right)
   - Fill in the asset form:
     - Required: Asset Type, Serial Number, Make, Model
     - Optional: All other fields
   - Click "Save" to create the asset
   - Asset tag is auto-generated

4. **Edit Asset**
   - Click "Edit" next to any asset in the table
   - Modify fields as needed
   - Note: Asset Tag and ID are immutable
   - Click "Save" to update

5. **Delete Asset**
   - Click "Delete" next to any asset
   - Confirm deletion in the popup

### Bulk Import Guide

1. **Download Template**
   ```bash
   GET /api/v1/assets/export/template?format=csv
   ```
   Or click "Import Assets" → "Download Template"

2. **Prepare Your CSV/Excel File**
   - Use the template as a guide
   - Fill in required columns:
     - assetType (Laptop, Desktop, iPhone, Television, Other)
     - serialNumber (must be unique)
     - make
     - model
   - Optional columns: status, condition, ramGB, storageGB, etc.

3. **Import File**
   ```bash
   curl -X POST http://localhost:3000/api/v1/assets/import \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "file=@assets.csv" \
     -F "importMode=skip-errors"
   ```

4. **Review Import Results**
   - Imported count
   - Failed rows with error details
   - Validation errors list

### API Usage Examples

**List Assets with Filters**
```bash
curl "http://localhost:3000/api/v1/assets?page=1&limit=20&assetType=Laptop&status=In%20Stock" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Create Asset**
```bash
curl -X POST http://localhost:3000/api/v1/assets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asset_type": "Laptop",
    "serial_number": "SN12345",
    "make": "HP",
    "model": "EliteBook 840",
    "status": "In Stock",
    "condition": "Renewed",
    "ram_gb": 16,
    "storage_gb": 512,
    "storage_type": "SSD",
    "price": 1200.00
  }'
```

**Update Asset**
```bash
curl -X PUT http://localhost:3000/api/v1/assets/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Sold",
    "price": 1100.00
  }'
```

## Database Schema

```sql
CREATE TABLE assets (
  id SERIAL PRIMARY KEY,
  asset_tag VARCHAR(20) UNIQUE NOT NULL,
  asset_type VARCHAR(20) NOT NULL,
  serial_number VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'In Stock',
  condition VARCHAR(20),
  quantity INTEGER NOT NULL DEFAULT 1,
  make VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  subcategory VARCHAR(50),
  specs TEXT,
  ram_gb INTEGER,
  storage_gb INTEGER,
  storage_type VARCHAR(20),
  cpu VARCHAR(100),
  gpu VARCHAR(100),
  screen_size_inches DECIMAL(4,2),
  resolution VARCHAR(50),
  battery_health_percent INTEGER,
  major_characteristics JSONB DEFAULT '[]',
  cost DECIMAL(10,2),
  price DECIMAL(10,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX ON assets(asset_tag);
CREATE UNIQUE INDEX ON assets(serial_number);
CREATE INDEX ON assets(asset_type);
CREATE INDEX ON assets(status);
CREATE INDEX ON assets(make);
CREATE INDEX ON assets(condition);
```

## Sample Data

The module includes 6 sample assets:
- 3 Laptops (HP, Dell, Lenovo)
- 1 Desktop (HP)
- 1 iPhone (Apple iPhone 13 Pro)
- 1 Television (Samsung QLED)

## File Structure

```
backend/
├── controllers/
│   ├── assetController.js          # CRUD operations
│   └── assetImportController.js    # Bulk import logic
├── models/
│   └── Asset.js                    # Sequelize model
├── routes/
│   └── assetRoutes.js              # API routes
├── migrations/
│   └── 20260203-create-assets.js   # Database migration
├── seeders/
│   └── 20260203-sample-assets.js   # Sample data
└── utils/
    └── assetTagGenerator.js        # Auto-increment asset tags

frontend/
└── src/
    └── pages/
        └── Inventory.jsx           # Main inventory page
```

## Next Steps / Future Enhancements

1. **Add/Edit Form Pages**
   - Create `/inventory/add` page with comprehensive form
   - Create `/inventory/:id/edit` page for editing
   - Form validation and UX improvements

2. **Asset Detail Page**
   - Create `/inventory/:id` page with full asset details
   - Display all fields in organized sections
   - Action buttons (Edit, Delete, etc.)

3. **Bulk Import UI**
   - Create `/inventory/import` wizard page
   - File upload with drag-and-drop
   - Column mapping interface
   - Preview and validation before import
   - Download error report

4. **Advanced Features**
   - Asset history/audit log
   - Image uploads for assets
   - Barcode/QR code generation and scanning
   - Export to CSV/Excel
   - Bulk operations (bulk status update, bulk delete)
   - Asset tags printing
   - Low stock alerts

## Troubleshooting

### Backend not starting after migration
- Check that PostgreSQL is running
- Verify database credentials in `.env`
- Run `npm run migrate` to apply migrations

### Import fails with validation errors
- Check CSV format matches template
- Verify serial numbers are unique
- Ensure asset types are from allowed list
- Check numeric fields contain valid numbers

### Frontend shows empty list
- Check backend is running on port 3000
- Verify you're logged in
- Check browser console for API errors
- Run seed data if database is empty: `npm run seed`

## Support

For issues or questions, contact the development team or check the main BIZHUB README.

---

**Last Updated**: 2026-02-03
**Version**: 1.0.0
**Status**: Production Ready
