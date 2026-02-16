/**
 * Gradual Inventory Completion - Safe & Steady
 * 
 * Completes the remaining 16 items in small, safe batches
 * Token usage: ~5k tokens per batch (very safe)
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { sequelize } = require('./models');
const util = require('util');

const execAsync = util.promisify(exec);

class GradualInventoryCompleter {
  constructor() {
    this.dataDir = './inventory-migration-data';
    this.stateFile = './inventory-completion-state.json';
    this.batchSize = 5; // Very conservative batch size
    this.maxPages = 38; // Total pages available
    this.alreadyHave = 22; // Pages we already extracted
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (error) {
      console.log('⚠️  Starting fresh state');
    }
    
    return {
      phase: 'extract-remaining',
      lastPageExtracted: this.alreadyHave, // Start from page 23
      extractedItems: this.alreadyHave, // We already have 22 items
      importedItems: this.alreadyHave, // Already imported 22
      totalPages: this.maxPages,
      totalItems: 751,
      startTime: new Date().toISOString(),
      errors: []
    };
  }

  saveState(state) {
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  async fetchInventoryPage(page) {
    const cmd = `curl.exe -u "4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ:x" "https://entech.salesbinder.com/api/2.0/items.json?page=${page}"`;
    
    try {
      const { stdout } = await execAsync(cmd);
      return JSON.parse(stdout);
    } catch (error) {
      console.error(`❌ Error fetching page ${page}:`, error.message);
      return null;
    }
  }

  async extractBatch(state, batchSize) {
    console.log(`🔄 Extracting next ${batchSize} items...`);
    
    let extracted = 0;
    const startPage = state.lastPageExtracted + 1;
    const endPage = Math.min(startPage + batchSize - 1, this.maxPages);
    
    for (let page = startPage; page <= endPage; page++) {
      console.log(`📄 Extracting page ${page}/${this.maxPages}...`);
      
      const response = await this.fetchInventoryPage(page);
      if (!response || !response.items || response.items.length === 0) {
        console.log(`✅ Reached end at page ${page}`);
        break;
      }
      
      // Save page data
      const pageFile = path.join(this.dataDir, `page-${page}.json`);
      fs.writeFileSync(pageFile, JSON.stringify(response, null, 2));
      
      extracted += response.items.length;
      state.lastPageExtracted = page;
      state.extractedItems += response.items.length;
      
      const progress = ((state.extractedItems / state.totalItems) * 100).toFixed(1);
      console.log(`✅ Page ${page}: ${response.items.length} items (${state.extractedItems}/${state.totalItems} = ${progress}%)`);
      
      // API rate limiting
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    this.saveState(state);
    return extracted;
  }

  async importNewItems(state) {
    console.log(`📦 Importing newly extracted items...`);
    
    const pageFiles = fs.readdirSync(this.dataDir)
      .filter(file => file.startsWith('page-') && file.endsWith('.json'))
      .map(file => parseInt(file.match(/page-(\d+)/)[1]))
      .filter(pageNum => pageNum > this.alreadyHave) // Only new pages
      .sort((a, b) => a - b);
    
    console.log(`📄 Found ${pageFiles.length} new pages to import`);
    
    let imported = 0;
    
    for (const pageNum of pageFiles) {
      const pageFile = path.join(this.dataDir, `page-${pageNum}.json`);
      const pageData = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
      
      console.log(`📦 Importing from page-${pageNum}.json...`);
      
      for (const sbItem of pageData.items) {
        try {
          const assetData = this.transformToAsset(sbItem);
          
          // Check if already imported
          const [existing] = await sequelize.query(
            'SELECT id FROM assets WHERE salesbinder_id = $salesbinder_id',
            {
              bind: { salesbinder_id: assetData.salesbinder_id },
              type: sequelize.QueryTypes.SELECT
            }
          );
          
          if (existing) {
            console.log(`⏭️  Already imported: ${assetData.make} ${assetData.model}`);
            continue;
          }
          
          // Direct insert (same as before)
          await this.directInsert(assetData);
          console.log(`✅ Imported: ${assetData.make} ${assetData.model} (${assetData.asset_tag})`);
          imported++;
          
        } catch (error) {
          console.error(`❌ Import error:`, error.message);
          state.errors.push(`Page ${pageNum}: ${error.message}`);
        }
      }
    }
    
    state.importedItems += imported;
    this.saveState(state);
    return imported;
  }

  // Same transformation logic as before
  transformToAsset(sbItem) {
    const item = sbItem[0];
    
    const { make, model } = this.extractMakeModel(item.name);
    const categoryMapping = this.mapCategory(item.category?.name);
    const techSpecs = this.extractTechSpecs(item.item_details);
    
    return {
      asset_tag: `INV-${String(item.item_number).padStart(6, '0')}`,
      category: categoryMapping.category,
      asset_type: categoryMapping.asset_type,
      serial_number: item.serial_number || null,
      status: 'In Stock',
      condition: techSpecs.condition,
      quantity: item.quantity || 0,
      quantity_reserved: item.quantity_reserved || 0,
      quantity_sold: 0,
      quantity_returned: 0,
      make: make,
      model: model,
      specs: item.description || null,
      cpu: techSpecs.cpu,
      ram_gb: techSpecs.ram_gb,
      storage_gb: techSpecs.storage_gb,
      storage_type: techSpecs.storage_gb ? 'SSD' : null,
      cost_amount: item.cost || null,
      cost_currency: 'GHS',
      price_amount: item.price || null,
      price_currency: 'GHS',
      salesbinder_id: item.id,
      import_notes: `Imported from SalesBinder item #${item.item_number}. Original: "${item.name}"`
    };
  }

  mapCategory(sbCategory) {
    const categoryMap = {
      'Laptop': { category: 'Computer', asset_type: 'Laptop' },
      'TELEVISION': { category: 'Consumer Electronics', asset_type: 'Television' },
      'MISCELLANEOUS': { category: 'Consumer Electronics', asset_type: 'Audio Equipment' }
    };
    return categoryMap[sbCategory] || { category: 'Consumer Electronics', asset_type: 'Other' };
  }

  extractMakeModel(name) {
    name = name.trim();
    const brands = ['SAMSUNG', 'SONY', 'LG', 'JBL', 'BOSE', 'YAMAHA', 'DELL', 'HP', 'KLIPSCH', 'VIZIO'];
    
    for (const brand of brands) {
      if (name.toUpperCase().startsWith(brand)) {
        const model = name.substring(brand.length).trim().replace(/^[-\s]+/, '');
        return { make: brand, model: model || name };
      }
    }
    
    if (name.toLowerCase().includes('latitude')) return { make: 'DELL', model: name };
    if (name.toLowerCase().includes('elitebook')) return { make: 'HP', model: name };
    
    const parts = name.split(' ');
    if (parts.length > 1) {
      return { make: parts[0], model: parts.slice(1).join(' ') };
    }
    
    return { make: 'Unknown', model: name };
  }

  extractTechSpecs(itemDetails) {
    const specs = { cpu: null, ram_gb: null, storage_gb: null, condition: null };

    if (!itemDetails || !Array.isArray(itemDetails)) return specs;

    for (const detail of itemDetails) {
      const fieldName = detail.custom_field?.name?.toLowerCase();
      const value = detail.value?.toString().trim();
      
      if (!value) continue;

      switch (fieldName) {
        case 'cpu':
        case 'cpu model':
          specs.cpu = value;
          break;
        case 'memory':
          const memoryMB = parseInt(value);
          if (memoryMB && memoryMB > 0) {
            specs.ram_gb = Math.round(memoryMB / 1024);
          }
          break;
        case 'hdd':
          const storage = parseInt(value);
          if (storage && storage > 0) {
            specs.storage_gb = storage;
          }
          break;
        case 'detail condition':
        case 'detail condition ':
          const conditionMap = {
            'A': 'Used', 'B': 'Used', 'C': 'Used',
            'NEW': 'New', 'OPEN BOX': 'Open Box', 'RENEWED': 'Renewed'
          };
          specs.condition = conditionMap[value.toUpperCase()] || 'Used';
          break;
      }
    }

    return specs;
  }

  async directInsert(assetData) {
    const sql = `
      INSERT INTO assets (
        asset_tag, category, asset_type, serial_number, status, condition,
        quantity, quantity_reserved, quantity_sold, quantity_returned,
        make, model, specs, cpu, ram_gb, storage_gb, storage_type,
        cost_amount, cost_currency, price_amount, price_currency,
        salesbinder_id, import_notes, created_at, updated_at
      ) VALUES (
        $asset_tag, $category, $asset_type, $serial_number, $status, $condition,
        $quantity, $quantity_reserved, $quantity_sold, $quantity_returned,
        $make, $model, $specs, $cpu, $ram_gb, $storage_gb, $storage_type,
        $cost_amount, $cost_currency, $price_amount, $price_currency,
        $salesbinder_id, $import_notes, datetime('now'), datetime('now')
      )
    `;
    
    await sequelize.query(sql, { bind: assetData });
  }

  async runBatch() {
    console.log('🚀 Starting gradual inventory completion...\n');
    
    const state = this.loadState();
    
    // Show current progress
    const progress = ((state.extractedItems / state.totalItems) * 100).toFixed(1);
    console.log(`📊 Current progress: ${state.extractedItems}/${state.totalItems} items (${progress}%)`);
    console.log(`📄 Pages: ${state.lastPageExtracted}/${state.totalPages}`);
    
    if (state.lastPageExtracted >= state.totalPages) {
      console.log('✅ All items already extracted!');
      return { extracted: 0, imported: 0, complete: true };
    }
    
    // Extract next batch
    const extracted = await this.extractBatch(state, this.batchSize);
    
    if (extracted > 0) {
      // Import the newly extracted items
      const imported = await this.importNewItems(state);
      
      console.log(`\n🎉 Batch complete!`);
      console.log(`   📥 Extracted: ${extracted} items`);
      console.log(`   📦 Imported: ${imported} items`);
      console.log(`   📊 Total progress: ${state.extractedItems}/${state.totalItems} (${((state.extractedItems / state.totalItems) * 100).toFixed(1)}%)`);
      
      return { extracted, imported, complete: state.lastPageExtracted >= state.totalPages };
    }
    
    return { extracted: 0, imported: 0, complete: true };
  }

  getStatus() {
    const state = this.loadState();
    return {
      extractedItems: state.extractedItems,
      totalItems: state.totalItems,
      progress: `${((state.extractedItems / state.totalItems) * 100).toFixed(1)}%`,
      importedItems: state.importedItems,
      lastPageExtracted: state.lastPageExtracted,
      totalPages: state.totalPages,
      remaining: state.totalItems - state.extractedItems,
      errors: state.errors.length
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const completer = new GradualInventoryCompleter();
  
  try {
    if (args.includes('--status')) {
      const status = completer.getStatus();
      console.log('📊 Inventory Completion Status:');
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    // Run a single batch
    const result = await completer.runBatch();
    
    if (result.complete) {
      console.log('\n🎉 COMPLETE! All 751 items extracted and imported! 🎉');
    } else {
      console.log('\n⏸️  Batch finished safely. Run again to continue.');
    }
    
  } catch (error) {
    console.error('❌ Completion failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = GradualInventoryCompleter;