/**
 * Direct DB fix — no spreadsheet matching.
 * 
 * Logic: Any asset/unit with cost_currency='USD' and cost_amount that's
 * suspiciously high (> $500 for a used laptop) is still in GHS.
 * Convert using purchase_exchange_rate if available, otherwise use the
 * rate from the same asset's other units, otherwise default 16.
 * 
 * Also fixes asset-level costs.
 * 
 * Usage: DATABASE_URL="postgresql://..." node scripts/fix-all-costs-direct.js
 */

const { Sequelize } = require('sequelize');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

async function main() {
  await sequelize.authenticate();
  console.log('✅ Connected');

  // Show current state
  const [assets] = await sequelize.query(`
    SELECT id, asset_tag, make, model, cost_amount, cost_currency, price_amount, price_currency, quantity
    FROM assets ORDER BY asset_tag
  `);
  console.log(`\n📊 BEFORE — ${assets.length} assets:`);
  for (const a of assets) {
    console.log(`  ${a.asset_tag} | ${a.make} ${a.model} | cost: ${a.cost_currency} ${a.cost_amount} | price: ${a.price_currency} ${a.price_amount} | qty: ${a.quantity}`);
  }

  // Get all units
  const [units] = await sequelize.query(`
    SELECT u.id, u.serial_number, u.asset_id, u.cost_amount, u.price_amount, u.purchase_exchange_rate,
           a.asset_tag, a.make, a.model
    FROM asset_units u
    JOIN assets a ON a.id = u.asset_id
    ORDER BY a.asset_tag, u.serial_number
  `);
  console.log(`\n📦 ${units.length} units total`);

  // For each unit: if cost > 500 (still in GHS), convert to USD
  let fixed = 0;
  for (const u of units) {
    const cost = parseFloat(u.cost_amount) || 0;
    
    if (cost <= 0) {
      console.log(`  ⏭️  ${u.asset_tag} ${u.serial_number} — no cost, skipping`);
      continue;
    }

    if (cost <= 500) {
      console.log(`  ✅ ${u.asset_tag} ${u.serial_number} — cost $${cost} looks correct (already USD)`);
      continue;
    }

    // Cost > 500 = still in GHS, needs conversion
    // Get rate: unit's own rate > sibling units' rate > default 16
    let rate = parseFloat(u.purchase_exchange_rate) || 0;
    let rateSource = 'unit';

    if (!rate) {
      // Check sibling units
      const [siblings] = await sequelize.query(`
        SELECT purchase_exchange_rate FROM asset_units 
        WHERE asset_id = $1 AND purchase_exchange_rate IS NOT NULL AND purchase_exchange_rate > 0
        LIMIT 1
      `, { bind: [u.asset_id] });
      if (siblings.length) {
        rate = parseFloat(siblings[0].purchase_exchange_rate);
        rateSource = 'sibling';
      }
    }

    if (!rate) {
      rate = 16; // Default rate for batch
      rateSource = 'default-16';
    }

    const usdCost = parseFloat((cost / rate).toFixed(2));

    await sequelize.query(`
      UPDATE asset_units 
      SET cost_amount = $1, purchase_exchange_rate = $2, updated_at = NOW()
      WHERE id = $3
    `, { bind: [usdCost, rate, u.id] });

    console.log(`  🔧 ${u.asset_tag} ${u.serial_number} — GHS ${cost} ÷ ${rate} (${rateSource}) = USD ${usdCost}`);
    fixed++;
  }

  // Recalculate ALL asset-level costs
  await sequelize.query(`
    UPDATE assets a
    SET cost_amount = sub.avg_cost,
        cost_currency = 'USD',
        updated_at = NOW()
    FROM (
      SELECT asset_id,
             ROUND(AVG(cost_amount)::numeric, 2) as avg_cost
      FROM asset_units
      WHERE cost_amount IS NOT NULL AND cost_amount > 0
      GROUP BY asset_id
    ) sub
    WHERE a.id = sub.asset_id
  `);

  // Show final state
  const [assetsAfter] = await sequelize.query(`
    SELECT id, asset_tag, make, model, cost_amount, cost_currency, price_amount, price_currency, quantity
    FROM assets ORDER BY asset_tag
  `);
  console.log(`\n📊 AFTER — ${assetsAfter.length} assets:`);
  for (const a of assetsAfter) {
    console.log(`  ${a.asset_tag} | ${a.make} ${a.model} | cost: ${a.cost_currency} ${a.cost_amount} | price: ${a.price_currency} ${a.price_amount} | qty: ${a.quantity}`);
  }

  console.log(`\n🎉 Fixed ${fixed} units`);
  await sequelize.close();
}

main().catch(e => { console.error(e); process.exit(1); });
