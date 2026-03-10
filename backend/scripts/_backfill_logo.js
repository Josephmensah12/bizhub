require('dotenv').config();
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const seq = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: process.env.DATABASE_URL?.includes('railway') ? { require: true, rejectUnauthorized: false } : undefined }
});

(async () => {
  const [profiles] = await seq.query('SELECT id, logo_storage_key, logo_data FROM company_profiles WHERE is_active = true LIMIT 1');
  if (!profiles.length) { console.log('No profile found'); await seq.close(); return; }
  const p = profiles[0];
  console.log('Profile:', p.id, '| logo_storage_key:', p.logo_storage_key, '| has logo_data:', !!p.logo_data);

  if (p.logo_storage_key && !p.logo_data) {
    const logoPath = path.join(__dirname, '..', 'uploads', 'logos', p.logo_storage_key);
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      const b64 = buf.toString('base64');
      await seq.query('UPDATE company_profiles SET logo_data = $1 WHERE id = $2', { bind: [b64, p.id] });
      console.log('Backfilled logo_data from disk (' + Math.round(b64.length / 1024) + ' KB base64)');
    } else {
      const fallback = path.join(__dirname, '..', 'assets', 'company-logo.jpeg');
      if (fs.existsSync(fallback)) {
        const buf = fs.readFileSync(fallback);
        const b64 = buf.toString('base64');
        await seq.query('UPDATE company_profiles SET logo_data = $1 WHERE id = $2', { bind: [b64, p.id] });
        console.log('Backfilled logo_data from bundled fallback (' + Math.round(b64.length / 1024) + ' KB base64)');
      } else {
        console.log('No logo file found on disk to backfill');
      }
    }
  } else if (p.logo_data) {
    console.log('logo_data already populated');
  } else {
    console.log('No logo_storage_key set');
  }
  await seq.close();
})();
