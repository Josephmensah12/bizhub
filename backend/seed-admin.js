/**
 * Seed admin user for production (PostgreSQL-compatible)
 */
const bcrypt = require('bcrypt');
const db = require('./models');

async function seedAdmin() {
  try {
    await db.sequelize.authenticate();
    console.log('Connected to database');

    const existing = await db.User.findOne({ where: { username: 'admin' } });
    if (existing) {
      console.log('Admin user already exists, skipping');
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash('admin123', 10);
    await db.User.create({
      username: 'admin',
      email: 'admin@bizhub.local',
      password_hash: passwordHash,
      role: 'Admin',
      full_name: 'Administrator',
      is_active: true
    });

    console.log('Admin user created');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

seedAdmin();
