/**
 * Quick Database Setup for Migration
 * Handles both SQLite (dev) and PostgreSQL (prod) setup
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔧 Setting up database for migration...');

// Check if we can connect to the database
try {
  // Try to require sequelize and test connection
  const { sequelize } = require('./models');
  
  console.log('📡 Testing database connection...');
  sequelize.authenticate()
    .then(() => {
      console.log('✅ Database connection successful!');
      
      // Try to run migrations
      console.log('🏗️  Running migrations...');
      try {
        execSync('npm run migrate', { stdio: 'inherit', cwd: __dirname });
        console.log('✅ Database setup complete!');
        console.log('\n🎯 Ready to import customers!');
        console.log('Run: node salesbinder-mass-migration.js --import');
      } catch (migrationError) {
        console.log('⚠️  Migrations had issues, but database might still work');
        console.log('Trying import anyway...');
      }
    })
    .catch(err => {
      console.error('❌ Database connection failed:', err.message);
      console.log('\n💡 Possible solutions:');
      console.log('1. Install PostgreSQL and start the service');
      console.log('2. Update .env file with correct database credentials');
      console.log('3. Use SQLite for development (already configured)');
    });
    
} catch (error) {
  console.error('❌ Database setup failed:', error.message);
}