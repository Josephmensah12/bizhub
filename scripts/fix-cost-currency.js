/**
 * Fix cost amounts — they were imported as USD but are actually GHS.
 * Converts cost to true USD using the purchase exchange rate.
 * Also fixes unit-level costs.
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/fix-cost-currency.js
 */

const { Sequelize } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

async function main() {
  await sequelize.authenticate();
  console.log('✅ Connected');

  // Load spreadsheet for exchange rate per serial
  const wb = XLSX.readFile(path.join(__dirname, '..', 'data', 'laptop-import.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  const SKIP = ['PRE-ORDER', 'CT-X636F', 'ZEN SCREEN'];
  const items = rows.filter(r => !SKIP.includes((r.Name || '').trim().toUpperCase()));

  // Build serial → { cost_ghs, exchange_rate } map
  const serialMap = {};
  for (const r of items) {
    const serial = String(r.SKU || '').trim();
    if (!serial) continue;
    const cost = r.Cost || 0;
    const rate = r['Exchange Rate  '] || null;
    serialMap[serial.toUpperCase()] = { cost_ghs: cost, exchange_rate: rate, price_ghs: r.Price || 0 };
  }

  // Fix asset_units: convert cost from GHS to USD
  const [units] = await sequelize.query('SELECT id, serial_number, cost_amount, price_amount, purchase_exchange_rate FROM asset_units');
  console.log(`📦 ${units.length} units to fix`);

  let fixed = 0;
  for (const unit of units) {
    const info = serialMap[unit.serial_number.toUpperCase()];
    if (!info) {
      console.log(`  ⏭️ ${unit.serial_number} — no spreadsheet match`);
      continue;
    }

    const rate = info.exchange_rate || unit.purchase_exchange_rate;
    if (!rate || rate === 0) {
      console.log(`  ⚠️ ${unit.serial_number} — no exchange rate available`);
      continue;
    }

    // True USD cost = GHS cost / exchange rate
    const usdCost = parseFloat((info.cost_ghs / rate).toFixed(2));

    await sequelize.query(`
      UPDATE asset_units 
      SET cost_amount = :cost, price_amount = :price, updated_at = NOW()
      WHERE id = :id
    `, {
      replacements: { cost: usdCost, price: info.price_ghs, id: unit.id }
    });

    console.log(`  ✅ ${unit.serial_number} — GHS ${info.cost_ghs} ÷ ${rate} = USD ${usdCost} | Price: GHS ${info.price_ghs}`);
    fixed++;
  }

  // Fix asset-level costs: average of units' USD costs per asset
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
  console.log('✅ Updated asset-level costs from unit averages');

  console.log(`\n🎉 Fixed ${fixed} units — costs now in true USD`);
  await sequelize.close();
}

main().catch(e => { console.error(e); process.exit(1); });
