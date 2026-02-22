/**
 * Import laptop inventory from SalesBinder Excel export into Bizhub.
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/import-laptops.js
 * 
 * This script:
 * 1. Wipes existing assets + asset_units (but preserves users, customers, invoices)
 * 2. Creates clean Asset records grouped by model
 * 3. Creates AssetUnit records for each serial number
 */

const { Sequelize, DataTypes, QueryTypes } = require('sequelize');
const XLSX = require('xlsx');
const path = require('path');

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

// ── Model name cleanup & make detection ──

const SKIP_NAMES = ['PRE-ORDER', 'CT-X636F', 'ZEN SCREEN'];

function classifyRow(row) {
  const name = (row.Name || '').trim().toUpperCase();
  const desc = (row.Description || '').trim();

  // Skip non-laptops
  if (SKIP_NAMES.includes(name)) return null;
  if (name === 'PRE-ORDER') return null;

  // Detect make and model
  let make, model;

  if (name === 'HP') {
    make = 'HP';
    model = cleanModel(desc); // desc has the real model: "PROBOOK 445 G8", "ELITEBOOK 845 G7", etc.
  } else if (name === 'DELL') {
    make = 'Dell';
    model = cleanModel(desc);
  } else if (name.includes('LATITUDE') || name.includes('INSPIRON')) {
    make = 'Dell';
    model = cleanModel(name);
  } else if (name.includes('ZBOOK') || name.includes('PROBOOK') || name.includes('ELITEBOOK')) {
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
    model = 'Laptop';
  } else if (name === 'CHROMEBOOK') {
    make = 'HP'; // Most likely HP Chromebook given the inventory
    model = 'Chromebook';
  } else {
    make = 'Unknown';
    model = cleanModel(name);
  }

  return { make, model };
}

function cleanModel(raw) {
  if (!raw) return 'Unknown';
  // Title case
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => {
      if (/^[A-Z0-9]+$/.test(w) && w.length <= 3) return w; // Keep short acronyms uppercase (G7, G8, EB)
      if (/^(G\d+|X\d+|I\d)$/i.test(w)) return w.toUpperCase(); // G7, G8, X360
      if (/^\d/.test(w)) return w; // Numbers stay as-is
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function parseMakeModel(row) {
  const info = classifyRow(row);
  if (!info) return null;
  // Group key combines make + model
  return info;
}

// ── Map condition codes ──
function mapCondition(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'A' || s === '1') return 'Renewed';  // Grade A = excellent refurb
  if (s === 'B' || s === '2' || s === '3') return 'Used';     // Grade B/C = good/fair
  if (s === 'C' || s === '5') return 'Used';
  return 'Used';
}

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    // Load Excel
    const xlsxPath = path.join(__dirname, '..', 'data', 'laptop-import.xlsx');
    const wb = XLSX.readFile(xlsxPath);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    console.log(`📄 Loaded ${rows.length} rows from Excel`);

    // Filter and classify
    const laptops = [];
    const skipped = [];
    for (const row of rows) {
      const info = classifyRow(row);
      if (!info) {
        skipped.push(row.Name);
        continue;
      }
      laptops.push({ ...row, _make: info.make, _model: info.model });
    }
    console.log(`✅ ${laptops.length} laptops to import, ${skipped.length} skipped: [${[...new Set(skipped)].join(', ')}]`);

    // Group by make+model+key specs (RAM/Storage combo creates separate products)
    const groups = {};
    for (const row of laptops) {
      const ram = row.Memory ? Math.round(row.Memory / 1024) : 0; // MB to GB
      const storage = row.HDD || 0;
      const key = `${row._make}|${row._model}|${ram}|${storage}`;
      if (!groups[key]) {
        groups[key] = {
          make: row._make,
          model: row._model,
          ram_gb: ram,
          storage_gb: storage,
          units: []
        };
      }
      groups[key].units.push(row);
    }
    console.log(`📦 ${Object.keys(groups).length} product groups`);

    // Wipe existing inventory
    console.log('🗑️  Wiping existing assets and units...');
    await sequelize.query('DELETE FROM asset_units');
    await sequelize.query('DELETE FROM assets');
    // Reset sequences
    await sequelize.query('ALTER SEQUENCE IF EXISTS assets_id_seq RESTART WITH 1').catch(() => {});
    await sequelize.query('ALTER SEQUENCE IF EXISTS asset_units_id_seq RESTART WITH 1').catch(() => {});
    console.log('✅ Existing inventory wiped');

    // Get or create asset tag counter
    let tagCounter = 1;

    const t = await sequelize.transaction();
    try {
      for (const [key, group] of Object.entries(groups)) {
        const assetTag = `INV-${String(tagCounter++).padStart(6, '0')}`;
        
        // Use first unit for defaults
        const sample = group.units[0];
        const cpu = sample['CPU Model'] || sample.CPU || null;
        const avgCost = group.units.reduce((s, u) => s + (u.Cost || 0), 0) / group.units.length;
        const avgPrice = group.units.reduce((s, u) => s + (u.Price || 0), 0) / group.units.length;

        // Determine description
        const modelDisplay = `${group.make} ${group.model}`;
        const specs = [];
        if (cpu) specs.push(cpu);
        if (group.ram_gb) specs.push(`${group.ram_gb}GB RAM`);
        if (group.storage_gb) specs.push(`${group.storage_gb}GB`);
        const specsStr = specs.length ? specs.join(' / ') : null;

        // Insert Asset
        const [assetResult] = await sequelize.query(`
          INSERT INTO assets (
            asset_tag, category, asset_type, make, model, 
            ram_gb, storage_gb, storage_type, cpu, specs,
            is_serialized, quantity, quantity_reserved, quantity_sold, quantity_returned,
            cost_amount, cost_currency, price_amount, price_currency,
            condition, status, featured,
            created_at, updated_at
          ) VALUES (
            :asset_tag, 'Computer', 'Laptop', :make, :model,
            :ram_gb, :storage_gb, 'SSD', :cpu, :specs,
            true, :quantity, 0, 0, 0,
            :cost, 'USD', :price, 'GHS',
            'Renewed', 'In Stock', false,
            NOW(), NOW()
          ) RETURNING id
        `, {
          replacements: {
            asset_tag: assetTag,
            make: group.make,
            model: group.model,
            ram_gb: group.ram_gb || null,
            storage_gb: group.storage_gb || null,
            cpu: cpu,
            specs: specsStr,
            quantity: group.units.length,
            cost: avgCost.toFixed(2),
            price: avgPrice.toFixed(2)
          },
          transaction: t
        });

        const assetId = assetResult[0].id;

        // Insert units
        for (const unit of group.units) {
          const serial = String(unit['Serial #'] || unit.SKU || '').trim();
          if (!serial) continue;

          const unitCpu = unit.CPU || null;
          const unitCpuModel = unit['CPU Model'] || null;
          const unitMemory = unit.Memory || null;
          const unitStorage = unit.HDD || null;
          const unitCost = unit.Cost || null;
          const unitPrice = unit.Price || null;

          await sequelize.query(`
            INSERT INTO asset_units (
              asset_id, serial_number, cpu, cpu_model, memory, storage,
              cost_amount, price_amount, status,
              created_at, updated_at
            ) VALUES (
              :asset_id, :serial, :cpu, :cpu_model, :memory, :storage,
              :cost, :price, 'Available',
              NOW(), NOW()
            )
          `, {
            replacements: {
              asset_id: assetId,
              serial: serial,
              cpu: unitCpu,
              cpu_model: unitCpuModel,
              memory: unitMemory,
              storage: unitStorage,
              cost: unitCost,
              price: unitPrice
            },
            transaction: t
          });
        }

        console.log(`  ✅ ${modelDisplay} (${group.ram_gb}GB/${group.storage_gb}GB) — ${group.units.length} units`);
      }

      await t.commit();
      console.log(`\n🎉 Import complete! ${laptops.length} units across ${Object.keys(groups).length} products`);
    } catch (err) {
      await t.rollback();
      throw err;
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
