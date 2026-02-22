/**
 * FINAL cost fix — comprehensive.
 * 
 * Spreadsheet Cost = GHS (was converted from USD using assigned exchange rate)
 * Step 1: USD cost = GHS cost ÷ assigned exchange rate
 * Step 2: Store as USD — app converts to GHS at today's rate for display
 * 
 * Exchange rate priority:
 *   1. From spreadsheet "Exchange Rate" custom field
 *   2. From purchase_exchange_rate column (enriched from SalesBinder API)
 *   3. Fallback: current live rate (for items where rate was looked up day-of)
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/fix-all-costs-final.js
 */

const { Sequelize } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');
const https = require('https');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

// Fetch current live USD/GHS rate
function fetchCurrentRate() {
  return new Promise((resolve, reject) => {
    https.get('https://open.er-api.com/v6/latest/USD', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.rates?.GHS || 16);
        } catch(e) { resolve(16); }
      });
    }).on('error', () => resolve(16));
  });
}

async function main() {
  await sequelize.authenticate();
  console.log('✅ Connected');

  // Get current live rate for items with no historical rate
  const currentRate = await fetchCurrentRate();
  console.log(`💱 Current live USD/GHS rate: ${currentRate}`);

  // Load spreadsheet
  const wb = XLSX.readFile(path.join(__dirname, '..', 'data', 'laptop-import.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const SKIP = ['PRE-ORDER', 'CT-X636F', 'ZEN SCREEN'];

  // Build serial → data map
  const serialMap = {};
  for (const r of rows) {
    if (SKIP.includes((r.Name || '').trim().toUpperCase())) continue;
    const serial = String(r.SKU || '').trim();
    if (!serial) continue;
    serialMap[serial.toUpperCase()] = {
      cost_ghs: r.Cost || 0,
      price_ghs: r.Price || 0,
      exchange_rate: r['Exchange Rate  '] || null  // from SalesBinder custom field
    };
  }

  // Get all units from DB
  const [units] = await sequelize.query(`
    SELECT id, serial_number, purchase_exchange_rate FROM asset_units
  `);
  console.log(`📦 ${units.length} units to process`);

  let fixed = 0;
  for (const unit of units) {
    const info = serialMap[unit.serial_number.toUpperCase()];
    if (!info) {
      console.log(`  ⏭️  ${unit.serial_number} — not in spreadsheet`);
      continue;
    }

    // Determine exchange rate: spreadsheet field > DB enriched value > current live rate
    // Parse rate - handle strings like "GHC 16.00"
    let rate = typeof info.exchange_rate === 'string'
      ? parseFloat(info.exchange_rate.replace(/[^0-9.]/g, ''))
      : info.exchange_rate;
    if (isNaN(rate) || !rate) rate = null;
    let rateSource = rate ? 'spreadsheet' : null;

    if (!rate && unit.purchase_exchange_rate) {
      rate = parseFloat(unit.purchase_exchange_rate);
      if (isNaN(rate)) rate = null;
      if (rate) rateSource = 'enriched';
    }
    if (!rate) {
      rate = currentRate;
      rateSource = 'current-live';
    }

    // Convert GHS cost back to USD
    const rawCost = info.cost_ghs / rate;
    const usdCost = isNaN(rawCost) || !isFinite(rawCost) ? null : parseFloat(rawCost.toFixed(2));

    await sequelize.query(`
      UPDATE asset_units 
      SET cost_amount = :cost,
          price_amount = :price,
          purchase_exchange_rate = :rate,
          updated_at = NOW()
      WHERE id = :id
    `, {
      replacements: { 
        cost: usdCost, 
        price: info.price_ghs,
        rate: rate,
        id: unit.id 
      }
    });

    console.log(`  ✅ ${unit.serial_number} — GHS ${info.cost_ghs} ÷ ${rate} (${rateSource}) = USD ${usdCost} | Price: GHS ${info.price_ghs}`);
    fixed++;
  }

  // Recalculate ALL asset-level costs from unit averages
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
  console.log('\n✅ Recalculated all asset-level costs');

  // Print final summary
  const [assets] = await sequelize.query(`
    SELECT asset_tag, make, model, cost_amount, cost_currency, price_amount, price_currency, quantity 
    FROM assets ORDER BY asset_tag
  `);
  console.log('\n📊 FINAL ASSET COSTS:');
  console.log('─'.repeat(100));
  for (const a of assets) {
    const costGHS = (parseFloat(a.cost_amount) * currentRate).toFixed(2);
    console.log(`  ${a.asset_tag} | ${a.make} ${a.model} | Cost: $${a.cost_amount} USD (≈ GHS ${costGHS} at today's rate) | Sell: GHS ${a.price_amount} | Qty: ${a.quantity}`);
  }

  console.log(`\n🎉 Fixed ${fixed} units. All costs now in true USD.`);
  console.log(`   App will display GHS equivalent using today's live rate (${currentRate}).`);
  await sequelize.close();
}

main().catch(e => { console.error(e); process.exit(1); });
