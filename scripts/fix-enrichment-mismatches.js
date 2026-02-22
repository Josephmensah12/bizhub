/**
 * Fix the 7 units that didn't match during enrichment.
 * - 5 case-sensitive serial mismatches
 * - 1 empty serial (skip)
 * - 1 possible mismatch (196378482156)
 * 
 * Also re-runs enrichment for matched units.
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/fix-enrichment-mismatches.js
 */

const { Sequelize } = require('sequelize');
const https = require('https');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }

const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

const SB_API_KEY = '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ';
const AUTH_HEADER = 'Basic ' + Buffer.from(SB_API_KEY + ':x').toString('base64');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: AUTH_HEADER } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

// Items that failed: serial in spreadsheet → SalesBinder Item ID
const MISMATCHES = [
  { serial: 'lpzj1160358', itemId: null },
  { serial: 'lpzi9994613', itemId: null },
  { serial: 'lpzj0784915', itemId: null },
  { serial: 'lpzi6469229', itemId: null },
  { serial: '5cd1180t74', itemId: null },
  { serial: '196378482156', itemId: null },
  // empty serial - skip
];

async function main() {
  await sequelize.authenticate();
  console.log('✅ Connected');

  // First: find units in DB that have no purchase_date (these are the ones that failed)
  const [unmatched] = await sequelize.query(`
    SELECT id, serial_number FROM asset_units WHERE purchase_date IS NULL
  `);
  console.log(`Found ${unmatched.length} units without purchase_date:`);
  unmatched.forEach(u => console.log(`  - [${u.id}] ${u.serial_number}`));

  // Load spreadsheet to get Item IDs for these serials
  const XLSX = require('xlsx');
  const path = require('path');
  const wb = XLSX.readFile(path.join(__dirname, '..', 'data', 'laptop-import.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  // Build serial → itemId map (case insensitive)
  const serialToItemId = {};
  rows.forEach(r => {
    const s = String(r.SKU || '').trim();
    if (s) serialToItemId[s.toUpperCase()] = r['Item ID'];
  });

  let updated = 0;
  for (const unit of unmatched) {
    const serial = unit.serial_number;
    const itemId = serialToItemId[serial.toUpperCase()];

    if (!itemId) {
      console.log(`  ⏭️ ${serial} — no SalesBinder Item ID found`);
      continue;
    }

    await sleep(1600);
    try {
      console.log(`  📡 Fetching ${serial} (${itemId})...`);
      const data = await fetchJSON(`https://entech.salesbinder.com/api/2.0/items/${itemId}.json`);
      const item = data.item;
      if (!item) { console.log(`    ⚠️ No data`); continue; }

      const createdDate = item.created ? item.created.slice(0, 10) : null;

      // Get exchange rate
      let exchangeRate = null;
      if (item.item_details) {
        const erField = item.item_details.find(d =>
          d.custom_field && d.custom_field.name && d.custom_field.name.trim() === 'Exchange Rate'
        );
        if (erField && erField.value) {
          exchangeRate = parseFloat(String(erField.value).replace(/[^0-9.]/g, ''));
          if (isNaN(exchangeRate)) exchangeRate = null;
        }
      }

      await sequelize.query(`
        UPDATE asset_units SET 
          purchase_date = :date, 
          purchase_exchange_rate = :rate,
          updated_at = NOW()
        WHERE id = :id
      `, { replacements: { date: createdDate, rate: exchangeRate, id: unit.id } });

      console.log(`    ✅ ${serial} → date: ${createdDate}, rate: ${exchangeRate || 'N/A'}`);
      updated++;
    } catch (err) {
      console.log(`    ❌ ${serial} — ${err.message}`);
    }
  }

  // Update asset-level dates
  await sequelize.query(`
    UPDATE assets a SET 
      purchase_date = sub.min_date,
      purchase_exchange_rate = sub.avg_rate,
      updated_at = NOW()
    FROM (
      SELECT asset_id, MIN(purchase_date) as min_date, ROUND(AVG(purchase_exchange_rate), 4) as avg_rate
      FROM asset_units WHERE purchase_date IS NOT NULL GROUP BY asset_id
    ) sub WHERE a.id = sub.asset_id
  `);

  console.log(`\n🎉 Fixed ${updated} units`);
  await sequelize.close();
}

main().catch(e => { console.error(e); process.exit(1); });
