require('dotenv').config();
const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');
const seq = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: process.env.DATABASE_URL?.includes('railway') ? { require: true, rejectUnauthorized: false } : undefined }
});

const NEW_PASSWORD = 'Admin@123';

(async () => {
  await seq.authenticate();

  const [admins] = await seq.query("SELECT id, username, email, role FROM users WHERE LOWER(role) IN ('admin','super_admin') ORDER BY created_at");
  console.log('Admin users:');
  admins.forEach(a => console.log(`  ${a.username} | ${a.email} | ${a.role}`));

  if (!admins.length) { console.log('No admin found'); await seq.close(); return; }

  const target = admins[0];
  const hash = await bcrypt.hash(NEW_PASSWORD, 12);

  await seq.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', { bind: [hash, target.id] });
  console.log(`\nPassword reset for: ${target.username} (${target.email})`);
  console.log(`New password: ${NEW_PASSWORD}`);

  await seq.close();
})();
