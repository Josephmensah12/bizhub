/**
 * SalesBinder Invoice Migration Script
 * 
 * Lessons learned from customer migration:
 * - SalesBinder returns ~20 items per page by default
 * - Total pages vary by endpoint
 * - Extract first, then import (safer approach)
 * 
 * Token-safe, resumable, with progress tracking
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

// Configuration
const CONFIG = {
  BATCH_SIZE: 50, // Conservative for invoices (larger records)
  MAX_BATCHES: 200, // Safety limit  
  DATA_DIR: './invoice-migration-data',
  STATE_FILE: './invoice-migration-state.json',
  SALESBINDER_API_KEY: '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ',
  SALESBINDER_SUBDOMAIN: 'entech'
};

class InvoiceMigrator {
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
      extractedInvoices: 0,
      importedInvoices: 0,
      totalInvoices: null,
      totalPages: null,
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
    const cmd = `curl.exe -u "${CONFIG.SALESBINDER_API_KEY}:x" "https://${CONFIG.SALESBINDER_SUBDOMAIN}.salesbinder.com/api/2.0/invoices.json?page=${page}"`;
    
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (error) {
      console.error(`❌ Error fetching invoice page ${page}:`, error.message);
      this.state.errors.push(`Invoice page ${page}: ${error.message}`);
      return null;
    }
  }

  async extractAllInvoices() {
    console.log('🚀 Phase 1: Extracting ALL invoice data from SalesBinder...');
    
    let currentPage = this.state.extractedPages + 1;
    let totalExtracted = this.state.extractedInvoices;
    
    // Test first page to understand pagination
    const firstPage = await this.fetchSalesBinderPage(1);
    if (!firstPage) {
      console.error('❌ Could not fetch first page, aborting');
      return 0;
    }
    
    this.state.totalInvoices = parseInt(firstPage.count) || 0;
    this.state.totalPages = parseInt(firstPage.pages) || 0;
    
    console.log(`📊 Total invoices: ${this.state.totalInvoices}`);
    console.log(`📄 Total pages: ${this.state.totalPages}`);
    
    if (this.state.totalInvoices === 0) {
      console.log('ℹ️  No invoices found');
      return 0;
    }
    
    while (currentPage <= this.state.totalPages && currentPage <= CONFIG.MAX_BATCHES) {
      console.log(`📄 Extracting invoice page ${currentPage}/${this.state.totalPages}...`);
      
      const response = await this.fetchSalesBinderPage(currentPage);
      if (!response || !response.invoices || response.invoices.length === 0) {
        console.log('✅ Reached end of invoice data');
        break;
      }
      
      // Save page data
      const pageFile = path.join(CONFIG.DATA_DIR, `page-${currentPage}.json`);
      fs.writeFileSync(pageFile, JSON.stringify(response, null, 2));
      
      totalExtracted += response.invoices.length;
      this.state.extractedPages = currentPage;
      this.state.extractedInvoices = totalExtracted;
      
      // Track progress
      const progress = ((totalExtracted / this.state.totalInvoices) * 100).toFixed(1);
      console.log(`✅ Page ${currentPage}: ${response.invoices.length} invoices (${totalExtracted}/${this.state.totalInvoices} = ${progress}%)`);
      
      // Save state every 10 pages (invoices are larger)
      if (currentPage % 10 === 0) {
        this.saveState();
        console.log(`💾 Progress saved - ${totalExtracted} invoices extracted`);
      }
      
      currentPage++;
      
      // Longer delay for invoices (more complex data)
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`\n🎉 Invoice extraction complete!`);
    console.log(`   Total extracted: ${totalExtracted} invoices`);
    console.log(`   Pages saved: ${this.state.extractedPages}`);
    
    this.state.phase = 'ready-to-import';
    this.saveState();
    
    return totalExtracted;
  }

  getStatus() {
    const progress = this.state.totalInvoices ? 
      ((this.state.extractedInvoices / this.state.totalInvoices) * 100).toFixed(1) : 'unknown';
    
    return {
      phase: this.state.phase,
      extracted: this.state.extractedInvoices,
      total: this.state.totalInvoices,
      pages: `${this.state.extractedPages}/${this.state.totalPages}`,
      progress: `${progress}%`,
      imported: this.state.importedInvoices,
      startTime: this.state.startTime,
      lastRun: this.state.lastRunTime,
      errors: this.state.errors.length
    };
  }

  async sampleInvoiceStructure() {
    console.log('🔍 Sampling invoice structure...');
    
    const response = await this.fetchSalesBinderPage(1);
    if (response && response.invoices && response.invoices.length > 0) {
      const sample = response.invoices[0];
      console.log('📋 Sample invoice structure:');
      console.log(JSON.stringify(sample, null, 2));
      
      // Save sample for reference
      fs.writeFileSync(path.join(CONFIG.DATA_DIR, 'sample-invoice.json'), JSON.stringify(sample, null, 2));
      return sample;
    }
    
    console.log('❌ No sample invoice found');
    return null;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const migrator = new InvoiceMigrator();
  
  try {
    if (args.includes('--status')) {
      const status = migrator.getStatus();
      console.log('📊 Invoice Migration Status:');
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    if (args.includes('--sample')) {
      await migrator.sampleInvoiceStructure();
      return;
    }
    
    // Default: extract invoices
    if (migrator.state.phase === 'complete') {
      console.log('✅ Invoice migration already complete!');
      const status = migrator.getStatus();
      console.log('📊 Final Status:');
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    await migrator.extractAllInvoices();
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Review extracted invoice structure');
    console.log('2. Design Bizhub invoice import mapping');
    console.log('3. Implement import functionality');
    
  } catch (error) {
    console.error('❌ Invoice migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = InvoiceMigrator;