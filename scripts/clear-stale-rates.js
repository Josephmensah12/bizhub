/**
 * Clear stale hardcoded exchange rates from cache so live rates get fetched.
 * Usage: DATABASE_URL="postgresql://..." node scripts/clear-stale-rates.js
 */
const { Sequelize } = require('sequelize');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL'); process.exit(1); }
const sequelize = new Sequelize(DATABASE_URL, { dialect: 'postgres', logging: false });

async function main() {
  await sequelize.authenticate();
  const [, meta] = await sequelize.query(`DELETE FROM exchange_rate_cache WHERE source = 'hardcoded'`);
  console.log('✅ Cleared hardcoded exchange rates from cache');
  await sequelize.close();
}
main().catch(e => { console.error(e); process.exit(1); });
