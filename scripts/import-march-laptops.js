/**
 * Import "laptop stock march found.xlsx" (137 rows, 23 products) into BizHub.
 *
 * - Parses Excel custom fields (memory, storage, CPU, condition, exchange rate)
 * - Fetches per-unit purchase date + cost/price from SalesBinder API
 * - Bootstraps condition_statuses (Grade A/B/C/D, Unknown, Salvage)
 * - Groups rows into products by make|model|ram|storage
 * - Upserts Assets (products) + AssetUnits (individual serial units)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/import-march-laptops.js
 *   DATABASE_URL="postgresql://..." node scripts/import-march-laptops.js --dry-run
 *   DATABASE_URL="postgresql://..." node scripts/import-march-laptops.js --skip-api
 */

const { Sequelize } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');
const https = require('https');

// ── CLI flags ──
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_API = process.argv.includes('--skip-api');

if (DRY_RUN) console.log('🏜️  DRY RUN — no database writes\n');

// ── Database ──
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: Set DATABASE_URL environment variable');
  process.exit(1);
}
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

// ── SalesBinder API ──
const SB_API_KEY = '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ';
const SB_BASE = 'https://entech.salesbinder.com/api/2.0';
const AUTH_HEADER = 'Basic ' + Buffer.from(SB_API_KEY + ':x').toString('base64');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

// ── Custom Fields parser ──
// Format: "Exchange Rate  : 15.5,\r\nMemory: 16384,\r\nHDD: 256,\r\n..."
function parseCustomFields(raw) {
  if (!raw) return {};
  const result = {};
  // Split on newlines (handle \r\n, \n)
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.replace(/,\s*$/, '').trim(); // strip trailing comma
    if (!trimmed) continue;
    // Split on first colon (key may have spaces, value may have colons)
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    result[key] = val;
  }
  return result;
}

// ── Classification (reused from import-laptops.js) ──

function classifyRow(row) {
  const name = (row.Name || '').trim().toUpperCase();
  const desc = (row.Description || '').trim();

  let make, model;

  if (name === 'HP') {
    make = 'HP';
    model = cleanModel(desc);
  } else if (name === 'DELL') {
    make = 'Dell';
    model = cleanModel(desc);
  } else if (name === 'APPLE' || name.includes('MACBOOK')) {
    make = 'Apple';
    model = cleanModel(name.includes('MACBOOK') ? name : desc || 'MacBook');
  } else if (name.includes('LATITUDE') || name.includes('INSPIRON')) {
    make = 'Dell';
    model = cleanModel(name);
  } else if (name.includes('ZBOOK') || name.includes('PROBOOK') || name.includes('ELITEBOOK') || name.startsWith('EB ')) {
    make = 'HP';
    model = cleanModel(name);
  } else if (name.includes('SURFACE')) {
    make = 'Microsoft';
    model = cleanModel(name);
  } else if (name.includes('GALAXY')) {
    make = 'Samsung';
    model = cleanModel(name);
  } else if (name.includes('YOGA')) {
    make = 'Lenovo';
    model = cleanModel(name);
  } else if (name === 'NOTEBOOK') {
    make = 'Generic';
    model = 'Notebook';
  } else if (name === 'ASUS') {
    make = 'Asus';
    model = cleanModel(desc || 'Laptop');
  } else if (name === 'CHROMEBOOK') {
    make = 'HP';
    model = 'Chromebook';
  } else if (name === 'ZEN SCREEN') {
    // Portable monitor — still import it as a laptop-adjacent item
    make = 'Asus';
    model = 'ZenScreen';
  } else {
    make = 'Unknown';
    model = cleanModel(name);
  }

  return { make, model };
}

function cleanModel(raw) {
  if (!raw) return 'Unknown';
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => {
      if (/^[A-Z0-9]+$/.test(w) && w.length <= 3) return w; // G7, G8, EB
      if (/^(G\d+|X\d+|I\d)$/i.test(w)) return w.toUpperCase();
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

// ── Condition mapping ──
// Detail Condition values: A, B, C, D, 1, 5
// Excel Condition column: "Unknown ", "Salvage"
const GRADE_MAP = {
  'A': 'Grade A',
  '1': 'Grade A',
  'B': 'Grade B',
  'C': 'Grade C',
  'D': 'Grade D',
  '5': 'Grade D'
};

// ── Condition status bootstrap definitions ──
const CONDITION_DEFS = [
  { name: 'Grade A', valuation_rule: 'percentage_of_cost', valuation_value: 100, color: '#22c55e', sort_order: 10 },
  { name: 'Grade B', valuation_rule: 'percentage_of_cost', valuation_value: 85,  color: '#3b82f6', sort_order: 20 },
  { name: 'Grade C', valuation_rule: 'percentage_of_cost', valuation_value: 70,  color: '#f59e0b', sort_order: 30 },
  { name: 'Grade D', valuation_rule: 'percentage_of_cost', valuation_value: 50,  color: '#ef4444', sort_order: 40 },
  { name: 'Unknown', valuation_rule: 'percentage_of_cost', valuation_value: 75,  color: '#6b7280', sort_order: 50 },
  { name: 'Salvage', valuation_rule: 'percentage_of_cost', valuation_value: 20,  color: '#991b1b', sort_order: 60 }
];

// ── Main ──
async function main() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database');

    // ──────────────── 1. Parse Excel ────────────────
    const xlsxPath = path.join(__dirname, '..', 'laptop stock march found.xlsx');
    const wb = XLSX.readFile(xlsxPath);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    console.log(`Loaded ${rows.length} rows from Excel\n`);

    // Enrich each row with parsed custom fields
    for (const row of rows) {
      const cf = parseCustomFields(row['Custom Fields']);
      row._cf = cf;
      row._memory_mb = cf.Memory ? parseInt(cf.Memory) : null;
      row._storage_gb = cf.HDD && cf.HDD !== 'NONE' ? parseInt(cf.HDD) : null;
      row._cpu = cf.CPU || null;
      row._cpu_model = cf['CPU Model'] || null;
      row._detail_condition = cf['Detail Condition'] ? cf['Detail Condition'].trim() : null;
      row._exchange_rate = null;
      if (cf['Exchange Rate']) {
        // Parse "$11.50", "GHC 16.00", "15.5", "16"
        const parsed = parseFloat(String(cf['Exchange Rate']).replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed) && parsed > 0) row._exchange_rate = parsed;
      }
    }

    // ──────────────── 2. Fetch SalesBinder data ────────────────
    const sbCache = {}; // itemId → { created, cost, price, exchange_rate, detail_condition }
    const CACHE_FILE = path.join(__dirname, '.sb-march-cache.json');

    // Try to load cache from disk
    try {
      const fs = require('fs');
      if (fs.existsSync(CACHE_FILE)) {
        const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        Object.assign(sbCache, cached);
        console.log(`Loaded ${Object.keys(sbCache).length} cached SalesBinder responses`);
      }
    } catch (e) { /* no cache */ }

    if (!SKIP_API) {
      const uniqueItemIds = [...new Set(rows.map(r => r['Item ID']).filter(Boolean))];
      const toFetch = uniqueItemIds.filter(id => !sbCache[id]);
      console.log(`SalesBinder: ${uniqueItemIds.length} unique items, ${toFetch.length} to fetch\n`);

      for (let i = 0; i < toFetch.length; i++) {
        const itemId = toFetch[i];
        if (i > 0) await sleep(1600);

        try {
          process.stdout.write(`  [${i + 1}/${toFetch.length}] Fetching ${itemId.slice(0, 8)}...`);
          const data = await fetchJSON(`${SB_BASE}/items/${itemId}.json`);
          const item = data.item;

          if (!item) {
            console.log(' no data');
            continue;
          }

          const entry = {
            created: item.created ? item.created.slice(0, 10) : null,
            cost: item.cost ? parseFloat(item.cost) : null,
            price: item.price ? parseFloat(item.price) : null,
            exchange_rate: null,
            detail_condition: null
          };

          // Extract custom fields from SalesBinder item_details
          if (item.item_details && Array.isArray(item.item_details)) {
            for (const d of item.item_details) {
              const fname = d.custom_field && d.custom_field.name ? d.custom_field.name.trim() : '';
              if (fname === 'Exchange Rate' && d.value) {
                const rate = parseFloat(String(d.value).replace(/[^0-9.]/g, ''));
                if (!isNaN(rate) && rate > 0) entry.exchange_rate = rate;
              }
              if (fname === 'Detail Condition' && d.value) {
                entry.detail_condition = String(d.value).trim();
              }
            }
          }

          sbCache[itemId] = entry;
          console.log(` date=${entry.created} cost=${entry.cost} rate=${entry.exchange_rate || 'N/A'}`);
        } catch (err) {
          console.log(` ERROR: ${err.message}`);
        }
      }

      // Save cache to disk
      try {
        const fs = require('fs');
        fs.writeFileSync(CACHE_FILE, JSON.stringify(sbCache, null, 2));
        console.log(`\nCached ${Object.keys(sbCache).length} SalesBinder responses to disk`);
      } catch (e) { /* ignore */ }
    } else {
      console.log('Skipping SalesBinder API (--skip-api)\n');
    }

    // Merge SalesBinder data into rows
    for (const row of rows) {
      const sb = sbCache[row['Item ID']] || {};
      row._sb_created = sb.created || null;
      // SalesBinder cost is in GHS — convert to USD using exchange rate
      const rate = sb.exchange_rate || row._exchange_rate;
      row._sb_cost = (sb.cost && rate) ? parseFloat((sb.cost / rate).toFixed(2)) : null;
      row._sb_price = sb.price || null; // price is already in GHS (price_currency = GHS)
      // Prefer SalesBinder exchange rate over Excel custom field
      if (sb.exchange_rate) row._exchange_rate = sb.exchange_rate;
      // Prefer SalesBinder detail condition over Excel custom field
      if (sb.detail_condition) row._detail_condition = sb.detail_condition;
    }

    // ──────────────── 3. Bootstrap condition statuses ────────────────
    console.log('\n── Condition Statuses ──');
    const conditionMap = {}; // name → id

    if (!DRY_RUN) {
      for (const def of CONDITION_DEFS) {
        const [existing] = await sequelize.query(
          `SELECT id FROM condition_statuses WHERE name = :name`,
          { replacements: { name: def.name } }
        );
        if (existing.length > 0) {
          conditionMap[def.name] = existing[0].id;
          console.log(`  ${def.name}: exists (id=${existing[0].id})`);
        } else {
          const [inserted] = await sequelize.query(
            `INSERT INTO condition_statuses (name, valuation_rule, valuation_value, color, sort_order, is_default, created_at, updated_at)
             VALUES (:name, :rule, :val, :color, :sort, false, NOW(), NOW())
             RETURNING id`,
            { replacements: { name: def.name, rule: def.valuation_rule, val: def.valuation_value, color: def.color, sort: def.sort_order } }
          );
          conditionMap[def.name] = inserted[0].id;
          console.log(`  ${def.name}: created (id=${inserted[0].id})`);
        }
      }
    } else {
      CONDITION_DEFS.forEach((d, i) => {
        conditionMap[d.name] = 100 + i; // fake IDs
        console.log(`  ${d.name}: would create`);
      });
    }

    // Helper: resolve condition_status_id for a row
    function resolveConditionId(row) {
      // Priority 1: Detail Condition from SalesBinder or Excel custom fields
      if (row._detail_condition && GRADE_MAP[row._detail_condition]) {
        return conditionMap[GRADE_MAP[row._detail_condition]];
      }
      // Priority 2: Excel Condition column (with trailing space)
      const excelCond = (row['Condition '] || row.Condition || '').trim();
      if (excelCond === 'Salvage') return conditionMap['Salvage'];
      return conditionMap['Unknown'];
    }

    // ──────────────── 4. Classify & group into products ────────────────
    console.log('\n── Classifying rows ──');
    const groups = {};
    for (const row of rows) {
      const info = classifyRow(row);
      row._make = info.make;
      row._model = info.model;

      const ramGb = row._memory_mb ? Math.round(row._memory_mb / 1024) : 0;
      const storageGb = row._storage_gb || 0;
      const key = `${info.make}|${info.model}|${ramGb}|${storageGb}`;

      if (!groups[key]) {
        groups[key] = { make: info.make, model: info.model, ram_gb: ramGb, storage_gb: storageGb, units: [] };
      }
      groups[key].units.push(row);
    }

    const productKeys = Object.keys(groups);
    console.log(`${rows.length} rows → ${productKeys.length} product groups\n`);

    // ──────────────── 5 & 6. Upsert Assets + AssetUnits ────────────────
    console.log('── Upserting Assets & Units ──');
    let assetsCreated = 0, assetsUpdated = 0;
    let unitsCreated = 0, unitsUpdated = 0, unitsSkipped = 0;
    let tagCounter = 1;

    // Find the next available asset_tag number
    if (!DRY_RUN) {
      const [maxTag] = await sequelize.query(
        `SELECT asset_tag FROM assets WHERE asset_tag LIKE 'LAP-%' ORDER BY asset_tag DESC LIMIT 1`
      );
      if (maxTag.length > 0) {
        const num = parseInt(maxTag[0].asset_tag.replace('LAP-', ''));
        if (!isNaN(num)) tagCounter = num + 1;
      }
    }

    const t = DRY_RUN ? null : await sequelize.transaction();

    try {
      for (const key of productKeys) {
        const group = groups[key];
        const { make, model, ram_gb, storage_gb } = group;
        const unitCount = group.units.length;

        // Compute product-level defaults from units
        const sample = group.units[0];
        const cpu = sample._cpu || null;
        const cpuModel = sample._cpu_model || null;
        const cpuDisplay = cpuModel ? `${cpu || ''} ${cpuModel}`.trim() : cpu;

        // Average cost/price from SalesBinder data (fall back to Excel)
        const costs = group.units.map(u => u._sb_cost || u.Cost || 0).filter(v => v > 0);
        const prices = group.units.map(u => u._sb_price || u.Price || 0).filter(v => v > 0);
        const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
        const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

        // Earliest purchase date
        const dates = group.units.map(u => u._sb_created).filter(Boolean).sort();
        const purchaseDate = dates.length ? dates[0] : null;

        // Most common exchange rate
        const rates = group.units.map(u => u._exchange_rate).filter(Boolean);
        const purchaseRate = rates.length ? rates[0] : null;

        // Specs string
        const specs = [cpuDisplay, ram_gb ? `${ram_gb}GB RAM` : null, storage_gb ? `${storage_gb}GB SSD` : null]
          .filter(Boolean).join(' / ') || null;

        // Check if asset already exists
        let assetId = null;
        if (!DRY_RUN) {
          const [existing] = await sequelize.query(
            `SELECT id FROM assets
             WHERE make = :make AND model = :model
               AND COALESCE(ram_gb, 0) = :ram AND COALESCE(storage_gb, 0) = :storage
               AND deleted_at IS NULL
             LIMIT 1`,
            { replacements: { make, model, ram: ram_gb, storage: storage_gb }, transaction: t }
          );

          if (existing.length > 0) {
            assetId = existing[0].id;
            await sequelize.query(
              `UPDATE assets SET is_serialized = true, updated_at = NOW() WHERE id = :id`,
              { replacements: { id: assetId }, transaction: t }
            );
            assetsUpdated++;
          } else {
            const assetTag = `LAP-${String(tagCounter++).padStart(3, '0')}`;
            const [inserted] = await sequelize.query(
              `INSERT INTO assets (
                asset_tag, category, asset_type, make, model,
                ram_gb, storage_gb, storage_type, cpu, specs,
                is_serialized, quantity, quantity_reserved, quantity_sold, quantity_returned,
                cost_amount, cost_currency, price_amount, price_currency,
                condition, status, featured,
                purchase_date, purchase_exchange_rate,
                salesbinder_id,
                created_at, updated_at
              ) VALUES (
                :tag, 'Computer', 'Laptop', :make, :model,
                :ram, :storage, 'SSD', :cpu, :specs,
                true, :qty, 0, 0, 0,
                :cost, 'USD', :price, 'GHS',
                'Renewed', 'In Stock', false,
                :purchase_date, :purchase_rate,
                :sb_id,
                NOW(), NOW()
              ) RETURNING id`,
              {
                replacements: {
                  tag: assetTag, make, model,
                  ram: ram_gb || null, storage: storage_gb || null,
                  cpu: cpuDisplay, specs,
                  qty: unitCount,
                  cost: avgCost > 0 ? avgCost.toFixed(2) : null,
                  price: avgPrice > 0 ? avgPrice.toFixed(2) : null,
                  purchase_date: purchaseDate,
                  purchase_rate: purchaseRate,
                  sb_id: sample['Item ID'] || null
                },
                transaction: t
              }
            );
            assetId = inserted[0].id;
            assetsCreated++;
          }
        }

        // Insert/update units
        for (const unit of group.units) {
          const serial = String(unit['Serial #'] || '').trim();
          if (!serial) { unitsSkipped++; continue; }

          // Cost: prefer SalesBinder (already converted to USD), else convert Excel Cost from GHS
          let unitCost = unit._sb_cost || null;
          if (!unitCost && unit.Cost && unit._exchange_rate) {
            unitCost = parseFloat((unit.Cost / unit._exchange_rate).toFixed(2));
          }
          const unitPrice = unit._sb_price || unit.Price || null;
          const conditionId = resolveConditionId(unit);

          if (!DRY_RUN) {
            // Check if unit exists by serial
            const [existingUnit] = await sequelize.query(
              `SELECT id FROM asset_units WHERE serial_number = :serial LIMIT 1`,
              { replacements: { serial }, transaction: t }
            );

            if (existingUnit.length > 0) {
              await sequelize.query(
                `UPDATE asset_units SET
                  asset_id = :asset_id,
                  cpu = :cpu, cpu_model = :cpu_model,
                  memory = :memory, storage = :storage,
                  cost_amount = :cost, price_amount = :price,
                  condition_status_id = :cond_id,
                  purchase_date = :pdate, purchase_exchange_rate = :prate,
                  updated_at = NOW()
                WHERE id = :id`,
                {
                  replacements: {
                    id: existingUnit[0].id,
                    asset_id: assetId,
                    cpu: unit._cpu, cpu_model: unit._cpu_model,
                    memory: unit._memory_mb, storage: unit._storage_gb,
                    cost: unitCost, price: unitPrice,
                    cond_id: conditionId,
                    pdate: unit._sb_created, prate: unit._exchange_rate
                  },
                  transaction: t
                }
              );
              unitsUpdated++;
            } else {
              await sequelize.query(
                `INSERT INTO asset_units (
                  asset_id, serial_number, cpu, cpu_model, memory, storage,
                  cost_amount, price_amount, condition_status_id,
                  status, purchase_date, purchase_exchange_rate,
                  created_at, updated_at
                ) VALUES (
                  :asset_id, :serial, :cpu, :cpu_model, :memory, :storage,
                  :cost, :price, :cond_id,
                  'Available', :pdate, :prate,
                  NOW(), NOW()
                )`,
                {
                  replacements: {
                    asset_id: assetId,
                    serial, cpu: unit._cpu, cpu_model: unit._cpu_model,
                    memory: unit._memory_mb, storage: unit._storage_gb,
                    cost: unitCost, price: unitPrice,
                    cond_id: conditionId,
                    pdate: unit._sb_created, prate: unit._exchange_rate
                  },
                  transaction: t
                }
              );
              unitsCreated++;
            }
          } else {
            unitsCreated++;
          }
        }

        const condName = resolveConditionId(sample);
        console.log(`  ${make} ${model} (${ram_gb}GB/${storage_gb}GB) — ${unitCount} units${DRY_RUN ? '' : ` [asset #${assetId}]`}`);
      }

      // ──────────────── 7. Update asset quantities ────────────────
      if (!DRY_RUN) {
        await sequelize.query(
          `UPDATE assets a SET
            quantity = sub.total,
            updated_at = NOW()
          FROM (
            SELECT asset_id, COUNT(*) as total
            FROM asset_units
            GROUP BY asset_id
          ) sub
          WHERE a.id = sub.asset_id AND a.is_serialized = true`,
          { transaction: t }
        );
        console.log('\nUpdated asset quantities from unit counts');
      }

      if (t) await t.commit();

      // ──────────────── 8. Report ────────────────
      console.log('\n════════════════════════════════════');
      console.log('  IMPORT SUMMARY');
      console.log('════════════════════════════════════');
      console.log(`  Total Excel rows:    ${rows.length}`);
      console.log(`  Product groups:      ${productKeys.length}`);
      console.log(`  Assets created:      ${assetsCreated}`);
      console.log(`  Assets updated:      ${assetsUpdated}`);
      console.log(`  Units created:       ${unitsCreated}`);
      console.log(`  Units updated:       ${unitsUpdated}`);
      console.log(`  Units skipped:       ${unitsSkipped}`);
      if (DRY_RUN) console.log(`\n  ** DRY RUN — nothing written **`);
      console.log('════════════════════════════════════\n');

      // Per-product breakdown
      console.log('Per-product breakdown:');
      for (const key of productKeys) {
        const g = groups[key];
        const conditions = {};
        for (const u of g.units) {
          const cname = u._detail_condition ? (GRADE_MAP[u._detail_condition] || 'Unknown') : ((u['Condition '] || '').trim() || 'Unknown');
          conditions[cname] = (conditions[cname] || 0) + 1;
        }
        const condStr = Object.entries(conditions).map(([k, v]) => `${k}:${v}`).join(' ');
        console.log(`  ${g.make} ${g.model} ${g.ram_gb}GB/${g.storage_gb}GB — ${g.units.length} units [${condStr}]`);
      }

    } catch (err) {
      if (t) await t.rollback();
      throw err;
    }

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
