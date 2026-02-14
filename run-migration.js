/**
 * Migration Runner
 * 
 * Simple script to run the SalesBinder migration
 * Usage: node run-migration.js
 */

require('dotenv').config()
const path = require('path')

// Add the backend directory to the module path so we can require models
process.env.NODE_PATH = path.join(__dirname, 'backend')
require('module').Module._initPaths()

const { runMigration } = require('./backend/scripts/salesbinder-migration')

console.log('🚀 Starting SalesBinder migration...')
console.log('Environment:', process.env.NODE_ENV || 'development')
console.log('Database:', process.env.DB_NAME || 'bizhub_dev')

runMigration()
  .then(() => {
    console.log('✅ Migration completed successfully!')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  })