/**
 * SalesBinder Inventory Migration Script
 * 
 * Migrates all 751 items from SalesBinder to Bizhub
 * Token-safe approach: Extract → Import
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

const CONFIG = {
  DATA_DIR: './inventory-migration-data',
  STATE_FILE: './inventory-migration-state.json',
  SALESBINDER_API_KEY: '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ',
  SALESBINDER_SUBDOMAIN: 'entech'
};

class InventoryMigrator {
  constructor() {
    this.state = this.loadState();
    this.ensureDataDir();
  }

  loadState() {
    if (fs.existsSync(CONFIG.STATE_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      } catch (e) {}
    }
    
    return {
      phase: 'extract',
      extractedPages: 0,
      extractedItems: 0,
      totalItems: null,
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

  async fetchInventoryPage(page) {
    const cmd = `curl.exe -u "${CONFIG.SALESBINDER_API_KEY}:x" "https://${CONFIG.SALESBINDER_SUBDOMAIN}.salesbinder.com/api/2.0/items.json?page=${page}"`;
    
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (error) {
      console.error(`❌ Error fetching inventory page ${page}:`, error.message);
      this.state.errors.push(`Inventory page ${page}: ${error.message}`);
      return null;
    }
  }

  async extractAllInventory() {
    console.log('🚀 Extracting ALL inventory from SalesBinder...');
    
    // Get pagination info from first page
    const firstPage = await this.fetchInventoryPage(1);
    if (!firstPage) {
      console.error('❌ Could not fetch first inventory page');
      return 0;
    }

    this.state.totalItems = parseInt(firstPage.count) || 0;
    this.state.totalPages = parseInt(firstPage.pages) || 0;
    
    console.log(`📦 Total inventory items: ${this.state.totalItems}`);
    console.log(`📄 Total pages: ${this.state.totalPages}`);
    
    let currentPage = this.state.extractedPages + 1;
    let totalExtracted = this.state.extractedItems;
    
    while (currentPage <= this.state.totalPages) {
      console.log(`📄 Extracting inventory page ${currentPage}/${this.state.totalPages}...`);
      
      const response = await this.fetchInventoryPage(currentPage);
      if (!response || !response.items || response.items.length === 0) {
        console.log('✅ Reached end of inventory data');
        break;
      }
      
      // Save page data
      const pageFile = path.join(CONFIG.DATA_DIR, `page-${currentPage}.json`);
      fs.writeFileSync(pageFile, JSON.stringify(response, null, 2));
      
      totalExtracted += response.items.length;
      this.state.extractedPages = currentPage;
      this.state.extractedItems = totalExtracted;
      
      const progress = ((totalExtracted / this.state.totalItems) * 100).toFixed(1);
      console.log(`✅ Page ${currentPage}: ${response.items.length} items (${totalExtracted}/${this.state.totalItems} = ${progress}%)`);
      
      // Save state every 10 pages
      if (currentPage % 10 === 0) {
        this.saveState();
        console.log(`💾 Progress saved - ${totalExtracted} items extracted`);
      }
      
      currentPage++;
      
      // API rate limiting - be nice
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    console.log(`\n🎉 Inventory extraction complete!`);
    console.log(`   Total extracted: ${totalExtracted} items`);
    console.log(`   Pages saved: ${this.state.extractedPages}`);
    
    this.state.phase = 'ready-to-import';
    this.saveState();
    
    return totalExtracted;
  }

  getStatus() {
    const progress = this.state.totalItems ? 
      ((this.state.extractedItems / this.state.totalItems) * 100).toFixed(1) : 'unknown';
    
    return {
      phase: this.state.phase,
      extracted: this.state.extractedItems,
      total: this.state.totalItems,
      pages: `${this.state.extractedPages}/${this.state.totalPages}`,
      progress: `${progress}%`,
      startTime: this.state.startTime,
      lastRun: this.state.lastRunTime,
      errors: this.state.errors.length
    };
  }

  async sampleInventoryStructure() {
    console.log('🔍 Sampling inventory structure...');
    
    const response = await this.fetchInventoryPage(1);
    if (response && response.items && response.items.length > 0) {
      const sample = response.items[0];
      console.log('📦 Sample inventory item:');
      console.log(JSON.stringify(sample, null, 2));
      
      fs.writeFileSync(path.join(CONFIG.DATA_DIR, 'sample-inventory.json'), JSON.stringify(sample, null, 2));
      return sample;
    }
    
    console.log('❌ No sample inventory found');
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const migrator = new InventoryMigrator();
  
  try {
    if (args.includes('--status')) {
      const status = migrator.getStatus();
      console.log('📊 Inventory Migration Status:');
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    if (args.includes('--sample')) {
      await migrator.sampleInventoryStructure();
      return;
    }
    
    // Extract all inventory
    await migrator.extractAllInventory();
    
  } catch (error) {
    console.error('❌ Inventory migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = InventoryMigrator;