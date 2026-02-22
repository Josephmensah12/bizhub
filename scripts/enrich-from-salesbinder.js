/**
 * Enrich Bizhub asset units with SalesBinder data:
 * - purchase_date from SalesBinder created timestamp
 * - exchange rate (from SalesBinder custom field, or historical API fallback)
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/enrich-from-salesbinder.js
 */

const { Sequelize } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');
const https = require('https');
const http = require('http');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: Set DATABASE_URL environment variable');
  process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

// SalesBinder API config
const SB_API_KEY = '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ';
const SB_BASE = 'https://entech.salesbinder.com/api/2.0';
const AUTH_HEADER = 'Basic ' + Buffer.from(SB_API_KEY + ':x').toString('base64');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: AUTH_HEADER } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Fetch historical USD/GHS exchange rate for a given date
async function getHistoricalRate(dateStr) {
  // Using exchangerate.host (free, no key needed)
  return new Promise((resolve, reject) => {
    const url = `https://open.er-api.com/v6/latest/USD`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.rates && json.rates.GHS) {
            resolve(json.rates.GHS);
          } else {
            resolve(null);
          }
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// Cache for historical rates by date
const rateCache = {};

async function getRateForDate(dateStr) {
  const day = dateStr.slice(0, 10); // YYYY-MM-DD
  if (rateCache[day]) return rateCache[day];
  
  // Try frankfurter.app for historical rates (free, no key)
  const rate = await new Promise((resolve) => {
    const url = `https://api.frankfurter.app/${day}?from=USD&to=GHS`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.rates && json.rates.GHS) {
            resolve(json.rates.GHS);
          } else {
            resolve(null);
          }
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });

  if (rate) {
    rateCache[day] = rate;
    return rate;
  }

  // Fallback to current rate
  const currentRate = await getHistoricalRate(day);
  if (currentRate) rateCache[day] = currentRate;
  return currentRate;
}

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    // Load spreadsheet to get Item IDs mapped to serial numbers
    const xlsxPath = path.join(__dirname, '..', 'data', 'laptop-import.xlsx');
    const wb = XLSX.readFile(xlsxPath);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    const SKIP = ['PRE-ORDER', 'CT-X636F', 'ZEN SCREEN'];
    const items = rows.filter(r => !SKIP.includes((r.Name || '').trim().toUpperCase()));
    console.log(`📄 ${items.length} items to enrich`);

    // First, ensure purchase_date column exists on asset_units (it should)
    // And add purchase_exchange_rate column if it doesn't exist
    try {
      await sequelize.query(`ALTER TABLE asset_units ADD COLUMN IF NOT EXISTS purchase_exchange_rate DECIMAL(10,4)`);
      console.log('✅ Ensured purchase_exchange_rate column exists on asset_units');
    } catch (err) {
      console.log('⚠️  Could not add column:', err.message);
    }

    // Also add to assets table for product-level reference
    try {
      await sequelize.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_exchange_rate DECIMAL(10,4)`);
      await sequelize.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_date DATE`);
      console.log('✅ Ensured purchase_exchange_rate + purchase_date columns exist on assets');
    } catch (err) {
      console.log('⚠️  Could not add columns to assets:', err.message);
    }

    let updated = 0;
    let failed = 0;
    let noMatch = 0;

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const itemId = row['Item ID'];
      const serial = String(row.SKU || '').trim();

      if (!itemId || !serial) {
        console.log(`  ⏭️  Row ${i + 1}: missing Item ID or serial`);
        continue;
      }

      // Rate limit: 1.5s between API calls
      if (i > 0) await sleep(1600);

      try {
        console.log(`  📡 [${i + 1}/${items.length}] Fetching ${serial}...`);
        const data = await fetchJSON(`${SB_BASE}/items/${itemId}.json`);
        const item = data.item;

        if (!item) {
          console.log(`    ⚠️  No item data returned`);
          failed++;
          continue;
        }

        // Extract created date
        const createdDate = item.created ? item.created.slice(0, 10) : null;

        // Extract exchange rate from custom fields
        let exchangeRate = null;
        if (item.item_details && Array.isArray(item.item_details)) {
          const erField = item.item_details.find(d => 
            d.custom_field && d.custom_field.name && d.custom_field.name.trim() === 'Exchange Rate'
          );
          if (erField && erField.value) {
            // Parse "$11.50" or "11.50"
            exchangeRate = parseFloat(String(erField.value).replace(/[^0-9.]/g, ''));
            if (isNaN(exchangeRate)) exchangeRate = null;
          }
        }

        // If no exchange rate from SalesBinder, fetch historical rate for that date
        if (!exchangeRate && createdDate) {
          console.log(`    🔍 No exchange rate in SalesBinder, fetching historical rate for ${createdDate}...`);
          exchangeRate = await getRateForDate(createdDate);
          if (exchangeRate) {
            console.log(`    💱 Historical USD/GHS rate for ${createdDate}: ${exchangeRate}`);
          }
        }

        // Update asset_unit by serial number
        const [results] = await sequelize.query(`
          UPDATE asset_units 
          SET purchase_date = :purchase_date,
              purchase_exchange_rate = :rate,
              updated_at = NOW()
          WHERE serial_number = :serial
          RETURNING id
        `, {
          replacements: {
            purchase_date: createdDate,
            rate: exchangeRate,
            serial: serial
          }
        });

        if (results.length > 0) {
          console.log(`    ✅ ${serial} → date: ${createdDate}, rate: ${exchangeRate || 'N/A'}`);
          updated++;
        } else {
          console.log(`    ❌ ${serial} — no matching unit in database`);
          noMatch++;
        }

      } catch (err) {
        console.log(`    ❌ ${serial} — API error: ${err.message}`);
        failed++;
      }
    }

    // Also update asset-level purchase_date with the earliest unit date per asset
    await sequelize.query(`
      UPDATE assets a
      SET purchase_date = sub.min_date,
          purchase_exchange_rate = sub.avg_rate,
          updated_at = NOW()
      FROM (
        SELECT asset_id, 
               MIN(purchase_date) as min_date,
               ROUND(AVG(purchase_exchange_rate), 4) as avg_rate
        FROM asset_units 
        WHERE purchase_date IS NOT NULL
        GROUP BY asset_id
      ) sub
      WHERE a.id = sub.asset_id
    `);
    console.log('✅ Updated asset-level purchase dates and exchange rates');

    console.log(`\n🎉 Enrichment complete!`);
    console.log(`   Updated: ${updated} | No match: ${noMatch} | Failed: ${failed}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
