/**
 * Fix items that had no exchange rate in SalesBinder.
 * These still have GHS costs stored as USD.
 * Uses rate of 16 (matching other items from the same batch).
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/fix-missing-rates.js
 */

const { Sequelize } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

const DEFAULT_RATE = 16; // Rate used by other items in the same batch

async function main() {
  await sequelize.authenticate();
  console.log('✅ Connected');

  // Load spreadsheet to identify items with no exchange rate
  const wb = XLSX.readFile(path.join(__dirname, '..', 'data', 'laptop-import.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  const SKIP = ['PRE-ORDER', 'CT-X636F', 'ZEN SCREEN'];
  const noRateSerials = {};

  for (const r of rows) {
    if (SKIP.includes((r.Name || '').trim().toUpperCase())) continue;
    const rate = r['Exchange Rate  '];
    if (!rate) {
      const serial = String(r.SKU || '').trim();
      if (serial) {
        noRateSerials[serial.toUpperCase()] = { cost_ghs: r.Cost || 0, price_ghs: r.Price || 0 };
      }
    }
  }

  console.log(`📦 ${Object.keys(noRateSerials).length} items with missing exchange rate`);

  // Fix each unit
  let fixed = 0;
  for (const [serialUpper, info] of Object.entries(noRateSerials)) {
    const usdCost = parseFloat((info.cost_ghs / DEFAULT_RATE).toFixed(2));

    const [results] = await sequelize.query(`
      UPDATE asset_units 
      SET cost_amount = :cost, 
          price_amount = :price,
          purchase_exchange_rate = :rate,
          updated_at = NOW()
      WHERE UPPER(serial_number) = :serial
      RETURNING id, serial_number
    `, {
      replacements: { cost: usdCost, price: info.price_ghs, rate: DEFAULT_RATE, serial: serialUpper }
    });

    if (results.length > 0) {
      console.log(`  ✅ ${results[0].serial_number} — GHS ${info.cost_ghs} ÷ ${DEFAULT_RATE} = USD ${usdCost}`);
      fixed++;
    } else {
      console.log(`  ❌ ${serialUpper} — not found in DB`);
    }
  }

  // Recalculate ALL asset-level costs from units
  await sequelize.query(`
    UPDATE assets a
    SET cost_amount = sub.avg_cost,
        price_amount = sub.avg_price,
        cost_currency = 'USD',
        price_currency = 'GHS',
        updated_at = NOW()
    FROM (
      SELECT asset_id,
             ROUND(AVG(cost_amount)::numeric, 2) as avg_cost,
             ROUND(AVG(price_amount)::numeric, 2) as avg_price
      FROM asset_units
      WHERE cost_amount IS NOT NULL
      GROUP BY asset_id
    ) sub
    WHERE a.id = sub.asset_id
  `);
  console.log('✅ Recalculated all asset-level costs from units');

  // Verify — show all assets with their costs
  const [assets] = await sequelize.query(`
    SELECT asset_tag, make, model, cost_amount, cost_currency, price_amount, price_currency, quantity
    FROM assets ORDER BY asset_tag
  `);
  console.log('\n📊 Final asset costs:');
  for (const a of assets) {
    console.log(`  ${a.asset_tag} ${a.make} ${a.model} — Cost: ${a.cost_currency} ${a.cost_amount} | Price: ${a.price_currency} ${a.price_amount} | Qty: ${a.quantity}`);
  }

  console.log(`\n🎉 Fixed ${fixed} units`);
  await sequelize.close();
}

main().catch(e => { console.error(e); process.exit(1); });
