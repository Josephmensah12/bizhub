/**
 * Clear all testing/transactional data from Bizhub.
 * KEEPS: users, assets, asset_units, company_profile, condition_statuses, exchange rates
 * WIPES: invoices, payments, returns, customers, preorders, stock takes, activity logs, etc.
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/clear-test-data.js
 */

const { Sequelize } = require('sequelize');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: Set DATABASE_URL environment variable');
  process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {}
});

const TABLES_TO_WIPE = [
  'invoice_return_items',
  'invoice_returns',
  'invoice_payments',
  'invoice_items',
  'invoices',
  'customer_credit_applications',
  'customer_credits',
  'customer_merge_logs',
  'customers',
  'preorders',
  'stock_take_items',
  'stock_takes',
  'activity_logs',
  'notification_logs',
  'inventory_item_events',
  'import_batches',
];

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    for (const table of TABLES_TO_WIPE) {
      try {
        const [, meta] = await sequelize.query(`DELETE FROM ${table}`);
        console.log(`  🗑️  ${table} — cleared`);
        // Reset sequence if exists
        await sequelize.query(`ALTER SEQUENCE IF EXISTS ${table}_id_seq RESTART WITH 1`).catch(() => {});
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`  ⏭️  ${table} — table not found, skipping`);
        } else {
          console.log(`  ⚠️  ${table} — ${err.message}`);
        }
      }
    }

    // Reset asset quantities back to clean state (clear sold/reserved/returned counts)
    await sequelize.query(`
      UPDATE assets SET 
        quantity_reserved = 0, 
        quantity_sold = 0, 
        quantity_returned = 0,
        status = 'In Stock',
        updated_at = NOW()
    `);
    console.log('  ✅ Asset quantities reset to clean state');

    // Reset unit statuses
    await sequelize.query(`
      UPDATE asset_units SET 
        status = 'Available', 
        sold_date = NULL, 
        invoice_item_id = NULL,
        updated_at = NOW()
    `);
    console.log('  ✅ Asset unit statuses reset');

    console.log('\n🎉 All test data cleared! Inventory and users preserved.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
