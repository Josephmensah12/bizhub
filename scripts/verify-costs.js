const { Sequelize } = require('sequelize');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

async function main() {
  await sequelize.authenticate();
  
  // Check assets
  const [assets] = await sequelize.query('SELECT asset_tag, make, model, cost_amount, cost_currency, price_amount, price_currency, quantity FROM assets ORDER BY asset_tag');
  console.log('=== ASSETS ===');
  for (const a of assets) {
    console.log(`${a.asset_tag} | ${a.make} ${a.model} | Cost: ${a.cost_currency} ${a.cost_amount} | Price: ${a.price_currency} ${a.price_amount} | Qty: ${a.quantity}`);
  }

  // Check units for INV-000002
  const [inv2] = await sequelize.query("SELECT id FROM assets WHERE asset_tag = 'INV-000002'");
  if (inv2.length) {
    const [units] = await sequelize.query('SELECT serial_number, cost_amount, price_amount, purchase_exchange_rate FROM asset_units WHERE asset_id = $1', { bind: [inv2[0].id] });
    console.log('\n=== INV-000002 UNITS ===');
    for (const u of units) {
      console.log(`  ${u.serial_number} | Cost: ${u.cost_amount} | Price: ${u.price_amount} | Rate: ${u.purchase_exchange_rate}`);
    }
  }

  // Check exchange rate cache
  const [rates] = await sequelize.query('SELECT * FROM exchange_rate_cache ORDER BY rate_date DESC LIMIT 5');
  console.log('\n=== CACHED RATES ===');
  for (const r of rates) {
    console.log(`  ${r.base_currency}/${r.quote_currency} = ${r.rate} (${r.source}, ${r.rate_date})`);
  }

  await sequelize.close();
}
main().catch(e => { console.error(e); process.exit(1); });
