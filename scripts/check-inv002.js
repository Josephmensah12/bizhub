const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });

async function main() {
  await sequelize.authenticate();
  
  // All assets
  const [assets] = await sequelize.query("SELECT asset_tag, make, model, cost_amount, cost_currency, price_amount, price_currency FROM assets ORDER BY asset_tag");
  console.log('=== ALL ASSETS ===');
  assets.forEach(a => console.log(`${a.asset_tag} | ${a.make} ${a.model} | cost: ${a.cost_currency} ${a.cost_amount} | price: ${a.price_currency} ${a.price_amount}`));

  // INV-000002 units
  const [inv2] = await sequelize.query("SELECT a.id FROM assets a WHERE a.asset_tag = 'INV-000002'");
  if (inv2.length) {
    const [units] = await sequelize.query("SELECT serial_number, cost_amount, price_amount, purchase_exchange_rate, purchase_date FROM asset_units WHERE asset_id = $1", { bind: [inv2[0].id] });
    console.log('\n=== INV-000002 UNITS ===');
    units.forEach(u => console.log(`  ${u.serial_number} | cost: ${u.cost_amount} | price: ${u.price_amount} | rate: ${u.purchase_exchange_rate} | date: ${u.purchase_date}`));
  }

  // Check if columns exist
  const [cols] = await sequelize.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'asset_units' AND column_name IN ('purchase_exchange_rate', 'purchase_date')");
  console.log('\n=== COLUMNS ON asset_units ===');
  cols.forEach(c => console.log(`  ${c.column_name}`));

  const [cols2] = await sequelize.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'assets' AND column_name IN ('purchase_exchange_rate', 'purchase_date')");
  console.log('\n=== COLUMNS ON assets ===');
  cols2.forEach(c => console.log(`  ${c.column_name}`));

  await sequelize.close();
}
main().catch(e => { console.error(e); process.exit(1); });
