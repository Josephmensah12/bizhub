/**
 * SalesBinder Mass Customer Migration Script
 * 
 * Phase 1: Extract all customer data from SalesBinder and save to JSON files
 * Phase 2: Import from JSON files to Bizhub database (when ready)
 * 
 * Automated, resumable, token-safe approach
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

// Configuration
const CONFIG = {
  BATCH_SIZE: 100,
  MAX_BATCHES: 50, // Safety limit  
  DATA_DIR: './migration-data',
  STATE_FILE: './migration-state.json',
  SALESBINDER_API_KEY: '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ',
  SALESBINDER_SUBDOMAIN: 'entech'
};

class SalesBinderMigrator {
  constructor() {
    this.state = this.loadState();
    this.ensureDataDir();
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (error) {
      console.log('⚠️  Could not load state, starting fresh');
    }
    
    return {
      phase: 'extract', // extract | import | complete
      extractedPages: 0,
      extractedCustomers: 0,
      importedCustomers: 0,
      totalCustomers: null,
      lastCustomerNumber: null,
      startTime: new Date().toISOString(),
      lastRunTime: null,
      errors: []
    };
  }

  saveState() {
    this.state.lastRunTime = new Date().toISOString();
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  ensureDataDir() {
    if (!fs.existsSync(CONFIG.DATA_DIR)) {
      fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
    }
  }

  async fetchSalesBinderPage(page) {
    const cmd = `curl.exe -u "${CONFIG.SALESBINDER_API_KEY}:x" "https://${CONFIG.SALESBINDER_SUBDOMAIN}.salesbinder.com/api/2.0/customers.json?limit=${CONFIG.BATCH_SIZE}&page=${page}"`;
    
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (error) {
      console.error(`❌ Error fetching page ${page}:`, error.message);
      this.state.errors.push(`Page ${page}: ${error.message}`);
      return null;
    }
  }

  async extractAllCustomers() {
    console.log('🚀 Phase 1: Extracting ALL customer data from SalesBinder...');
    
    let currentPage = this.state.extractedPages + 1;
    let totalExtracted = this.state.extractedCustomers;
    
    while (currentPage <= CONFIG.MAX_BATCHES) {
      console.log(`📄 Extracting page ${currentPage}...`);
      
      const response = await this.fetchSalesBinderPage(currentPage);
      if (!response || !response.customers || response.customers.length === 0) {
        console.log('✅ Reached end of data');
        break;
      }
      
      // Set total on first page
      if (!this.state.totalCustomers) {
        this.state.totalCustomers = parseInt(response.count);
        console.log(`📊 Total customers to extract: ${this.state.totalCustomers}`);
      }
      
      // Save page data
      const pageFile = path.join(CONFIG.DATA_DIR, `page-${currentPage}.json`);
      fs.writeFileSync(pageFile, JSON.stringify(response, null, 2));
      
      totalExtracted += response.customers.length;
      this.state.extractedPages = currentPage;
      this.state.extractedCustomers = totalExtracted;
      
      // Track progress
      const progress = ((totalExtracted / this.state.totalCustomers) * 100).toFixed(1);
      console.log(`✅ Page ${currentPage}: ${response.customers.length} customers (${totalExtracted}/${this.state.totalCustomers} = ${progress}%)`);
      
      // Save state every 5 pages
      if (currentPage % 5 === 0) {
        this.saveState();
        console.log(`💾 Progress saved - ${totalExtracted} customers extracted`);
      }
      
      currentPage++;
      
      // Small delay to be nice to API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n🎉 Extraction complete!`);
    console.log(`   Total extracted: ${totalExtracted} customers`);
    console.log(`   Pages saved: ${this.state.extractedPages}`);
    
    this.state.phase = 'ready-to-import';
    this.saveState();
    
    return totalExtracted;
  }

  transformCustomer(salesBinderCustomer) {
    const sb = salesBinderCustomer[0]; // SalesBinder wraps in array
    
    // Split name into first/last
    const nameParts = sb.name.trim().split(' ');
    let firstName = nameParts[0];
    let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
    
    // If name looks like a business, put in company_name
    const businessKeywords = ['Ltd', 'Limited', 'Company', 'Corp', 'Inc', 'LLC', 'Enterprise', 'Services'];
    const isBusinessName = businessKeywords.some(keyword => 
      sb.name.toLowerCase().includes(keyword.toLowerCase())
    );
    
    return {
      first_name: isBusinessName ? null : firstName,
      last_name: isBusinessName ? null : lastName,  
      company_name: isBusinessName ? sb.name.trim() : null,
      phone_raw: sb.office_phone,
      email: sb.office_email,
      address: [sb.billing_address_1, sb.billing_address_2, sb.billing_city, sb.billing_region]
        .filter(Boolean).join(', ') || null,
      salesbinder_id: sb.id,
      salesbinder_customer_number: sb.customer_number,
      notes: `Imported from SalesBinder. Customer #${sb.customer_number}. Created: ${sb.created}`,
      tags: ['imported', 'salesbinder']
    };
  }

  async importToDatabase() {
    console.log('🚀 Phase 2: Importing customers to Bizhub database...');
    
    // Try to load database connection
    try {
      const { Customer } = require('./models');
      
      let imported = 0;
      let skipped = 0;
      let errors = 0;
      
      // Process each page file
      for (let page = 1; page <= this.state.extractedPages; page++) {
        const pageFile = path.join(CONFIG.DATA_DIR, `page-${page}.json`);
        
        if (!fs.existsSync(pageFile)) {
          console.log(`⏭️  Skipping missing page ${page}`);
          continue;
        }
        
        const pageData = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
        
        console.log(`📄 Processing page ${page} (${pageData.customers.length} customers)...`);
        
        for (const salesBinderCustomer of pageData.customers) {
          try {
            const customerData = this.transformCustomer(salesBinderCustomer);
            
            // Check if already exists
            const existing = await Customer.findOne({
              where: { salesbinder_id: customerData.salesbinder_id }
            });
            
            if (existing) {
              skipped++;
              continue;
            }
            
            // Create customer
            await Customer.create(customerData);
            imported++;
            
            if (imported % 50 === 0) {
              console.log(`   ✅ Imported ${imported} customers...`);
            }
            
          } catch (error) {
            console.error(`❌ Error importing customer: ${error.message}`);
            errors++;
          }
        }
      }
      
      console.log('\n🎉 Database import complete!');
      console.log(`   Imported: ${imported} customers`);
      console.log(`   Skipped: ${skipped} customers`);
      console.log(`   Errors: ${errors} customers`);
      
      this.state.phase = 'complete';
      this.state.importedCustomers = imported;
      this.saveState();
      
      return { imported, skipped, errors };
      
    } catch (error) {
      console.error('❌ Database not ready:', error.message);
      console.log('ℹ️  Run database setup first, then restart with --import');
      throw error;
    }
  }

  getStatus() {
    const progress = this.state.totalCustomers ? 
      ((this.state.extractedCustomers / this.state.totalCustomers) * 100).toFixed(1) : 'unknown';
    
    return {
      phase: this.state.phase,
      extracted: this.state.extractedCustomers,
      total: this.state.totalCustomers,
      progress: `${progress}%`,
      imported: this.state.importedCustomers,
      startTime: this.state.startTime,
      lastRun: this.state.lastRunTime,
      errors: this.state.errors.length
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const migrator = new SalesBinderMigrator();
  
  try {
    if (args.includes('--status')) {
      const status = migrator.getStatus();
      console.log('📊 Migration Status:');
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    if (args.includes('--import')) {
      if (migrator.state.phase !== 'ready-to-import' && migrator.state.phase !== 'complete') {
        console.log('❌ No extracted data found. Run extraction first.');
        return;
      }
      await migrator.importToDatabase();
      return;
    }
    
    // Default: extract data
    if (migrator.state.phase === 'complete') {
      console.log('✅ Migration already complete!');
      const status = migrator.getStatus();
      console.log('📊 Final Status:');
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    await migrator.extractAllCustomers();
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Set up database (PostgreSQL or keep SQLite)');
    console.log('2. Run: node salesbinder-mass-migration.js --import');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SalesBinderMigrator;