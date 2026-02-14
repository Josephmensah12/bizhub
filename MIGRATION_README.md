# SalesBinder → Bizhub Migration

This document explains how to migrate February 2026 data from SalesBinder to Bizhub.

## What Gets Migrated

- **Customers**: All customers who made purchases in February 2026
- **Assets**: All inventory items that appear on February 2026 invoices  
- **Invoices**: All invoices from February 1-28, 2026
- **Invoice Items**: Line items for each invoice

## Prerequisites

1. **Database Migration**: Run the tracking fields migration first
   ```bash
   cd backend
   npx sequelize-cli db:migrate
   ```

2. **SalesBinder API Access**: The script uses the configured API key
   - Base URL: `https://entech.salesbinder.com/api/2.0`
   - API Key: `4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ` (Joe's key)

3. **Bizhub Database**: Ensure the bizhub database is set up and running

## How to Run

### Option 1: Simple Runner
```bash
node run-migration.js
```

### Option 2: Direct Script
```bash
cd backend
node scripts/salesbinder-migration.js
```

## What Happens

### Step 1: User Mapping
- Maps SalesBinder staff to bizhub users
- Looks for "Joyce Boye" and "Joseph Narh" in bizhub users table
- Falls back to admin user (ID 1) if not found

### Step 2: Data Fetching
- Pulls all February 2026 invoices from SalesBinder API
- Extracts unique customers and items from those invoices
- Rate limits API calls to avoid 429 errors (2 second delays)

### Step 3: Customer Migration
- Creates new customers or finds existing ones
- Maps SalesBinder `name` → bizhub `first_name` + `last_name`
- Uses `salesbinder_id` to prevent duplicates
- Sets source as "SalesBinder Import"

### Step 4: Asset Migration
- Maps SalesBinder categories to bizhub taxonomy:
  - `Laptop` → Computer > Laptop
  - `TELEVISION` → Consumer Electronics > Television  
  - `MISCELLANEOUS` → Consumer Electronics > Audio Equipment
  - etc.
- Extracts specs from item_details (RAM, Storage, CPU)
- Generates unique asset tags (INV-YYYYMMDD-###)
- Uses `salesbinder_id` to prevent duplicates

### Step 5: Invoice Migration
- Creates invoices with proper status mapping:
  - `paid in full` → PAID
  - `unpaid` → UNPAID
  - `partially paid` → PARTIALLY_PAID
- Links to migrated customers and staff
- Creates invoice line items linked to migrated assets
- Recalculates totals and payment status

## Data Mapping

### Customer Fields
| SalesBinder | Bizhub |
|-------------|--------|
| `name` | `first_name` + `last_name` |
| `office_phone` | `phone_raw` |
| `office_email` | `email` |
| `billing_address_1` | `address_line_1` |
| `billing_city` | `city` |
| `id` | `salesbinder_id` |

### Asset Fields
| SalesBinder | Bizhub |
|-------------|--------|
| `name` | `make` + `model` (parsed) |
| `category.name` | `category` + `asset_type` (mapped) |
| `serial_number` | `serial_number` |
| `quantity` | `quantity` |
| `cost` | `cost_amount` (GHS) |
| `price` | `price_amount` (GHS) |
| `item_details` | `specs`, `ram_gb`, `storage_gb`, `cpu` |
| `id` | `salesbinder_id` |

### Invoice Fields
| SalesBinder | Bizhub |
|-------------|--------|
| `issue_date` | `invoice_date` |
| `status.name` | `status` (mapped) |
| `total_cost` | `total_cost_amount` |
| `total_price` | `total_amount` |
| `total_transactions` | `amount_paid` |
| `document_number` | `salesbinder_invoice_number` |
| `id` | `salesbinder_id` |

## Error Handling

- **Rate Limiting**: 2-second delays between API calls, exponential backoff on 429 errors
- **Duplicate Prevention**: Uses `salesbinder_id` fields to skip existing records
- **Transaction Safety**: Each invoice is created in a database transaction
- **Logging**: Comprehensive info/warn/error logging throughout
- **Statistics**: Tracks created/skipped/error counts for each data type

## Expected Results (February 2026)

Based on SalesBinder analysis:
- **~33 invoices** (Feb 1-13 data showed 33, full month likely ~60-80)
- **~30-40 customers** (unique buyers)  
- **~50-100 assets** (unique items sold)
- **~100-200 invoice line items**

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure bizhub backend is configured properly
2. **API Rate Limits**: Script handles automatically, just wait
3. **Duplicate Keys**: Run migration multiple times safely - it skips existing records
4. **User Mapping**: If Joyce/Joseph not found, records will use admin user (ID 1)

### Logs to Check

The script logs everything to console:
- `[INFO]` - Normal progress updates
- `[WARN]` - Non-fatal issues (missing data, skipped records)  
- `[ERROR]` - Failed operations

### Database State

After migration, check these tables:
```sql
-- Imported customers
SELECT COUNT(*) FROM customers WHERE salesbinder_id IS NOT NULL;

-- Imported assets  
SELECT COUNT(*) FROM assets WHERE salesbinder_id IS NOT NULL;

-- Imported invoices
SELECT COUNT(*) FROM invoices WHERE salesbinder_id IS NOT NULL;

-- Revenue verification
SELECT SUM(total_amount) FROM invoices WHERE salesbinder_id IS NOT NULL;
```

## Recovery

If something goes wrong, you can:

1. **Delete imported data**:
   ```sql
   DELETE FROM invoice_items WHERE invoice_id IN (
     SELECT id FROM invoices WHERE salesbinder_id IS NOT NULL
   );
   DELETE FROM invoices WHERE salesbinder_id IS NOT NULL;
   DELETE FROM assets WHERE salesbinder_id IS NOT NULL;  
   DELETE FROM customers WHERE salesbinder_id IS NOT NULL;
   ```

2. **Re-run migration**: The script will recreate everything

3. **Partial re-run**: Comment out completed steps in the migration script

## Post-Migration

After successful migration:

1. **Verify Reports**: Check the Reports module to see February 2026 data
2. **Update Dashboard**: Dashboard should show imported assets and sales
3. **Test Invoicing**: Ensure new invoices can be created normally
4. **Backup**: Take a database backup with the imported data

## Support

For issues or questions:
- Check the console logs first  
- Verify database migrations ran (`npx sequelize-cli db:migrate:status`)
- Check SalesBinder API access (try a manual curl request)
- Review the mapping functions in `salesbinder-migration.js`