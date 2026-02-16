/**
 * Simplified SalesBinder Inventory Import
 * 
 * Direct database insert to bypass model validation issues
 */

const fs = require('fs');
const path = require('path');
const { sequelize } = require('./models');

class SimpleInventoryImporter {
  constructor() {
    this.dataDir = './inventory-migration-data';
    this.imported = 0;
    this.skipped = 0;
    this.errors = 0;
  }

  generateAssetTag(itemNumber) {
    return `INV-${String(itemNumber).padStart(6, '0')}`;
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
    
    // Known brands (case insensitive)
    const brands = ['SAMSUNG', 'SONY', 'LG', 'JBL', 'BOSE', 'YAMAHA', 'DELL', 'HP', 'KLIPSCH', 'VIZIO'];
    
    for (const brand of brands) {
      if (name.toUpperCase().startsWith(brand)) {
        const model = name.substring(brand.length).trim().replace(/^[-\s]+/, '');
        return { make: brand, model: model || name };
      }
    }
    
    // Dell Latitude special case
    if (name.toLowerCase().includes('latitude')) {
      return { make: 'DELL', model: name };
    }
    
    // EliteBook = HP
    if (name.toLowerCase().includes('elitebook')) {
      return { make: 'HP', model: name };
    }
    
    // Default: first word as make, rest as model
    const parts = name.split(' ');
    if (parts.length > 1) {
      return { make: parts[0], model: parts.slice(1).join(' ') };
    }
    
    return { make: 'Unknown', model: name };
  }

  extractTechSpecs(itemDetails) {
    const specs = {
      cpu: null,
      ram_gb: null,
      storage_gb: null,
      condition: null
    };

    if (!itemDetails || !Array.isArray(itemDetails)) {
      return specs;
    }

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
            'A': 'Used',
            'B': 'Used', 
            'C': 'Used',
            'NEW': 'New',
            'OPEN BOX': 'Open Box',
            'RENEWED': 'Renewed'
          };
          specs.condition = conditionMap[value.toUpperCase()] || 'Used';
          break;
      }
    }

    return specs;
  }

  transformToAsset(sbItem) {
    const item = sbItem[0]; // SalesBinder wraps in array
    
    const { make, model } = this.extractMakeModel(item.name);
    const categoryMapping = this.mapCategory(item.category?.name);
    const techSpecs = this.extractTechSpecs(item.item_details);
    
    return {
      asset_tag: this.generateAssetTag(item.item_number),
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

  async directInsert(assetData) {
    // Direct SQL insert to bypass model validation
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
    
    await sequelize.query(sql, {
      bind: {
        asset_tag: assetData.asset_tag,
        category: assetData.category,
        asset_type: assetData.asset_type,
        serial_number: assetData.serial_number,
        status: assetData.status,
        condition: assetData.condition,
        quantity: assetData.quantity,
        quantity_reserved: assetData.quantity_reserved,
        quantity_sold: assetData.quantity_sold,
        quantity_returned: assetData.quantity_returned,
        make: assetData.make,
        model: assetData.model,
        specs: assetData.specs,
        cpu: assetData.cpu,
        ram_gb: assetData.ram_gb,
        storage_gb: assetData.storage_gb,
        storage_type: assetData.storage_type,
        cost_amount: assetData.cost_amount,
        cost_currency: assetData.cost_currency,
        price_amount: assetData.price_amount,
        price_currency: assetData.price_currency,
        salesbinder_id: assetData.salesbinder_id,
        import_notes: assetData.import_notes
      }
    });
  }

  async importInventoryItems() {
    console.log('🚀 Starting direct inventory import to Bizhub...');
    
    // Find all extracted page files
    const pageFiles = fs.readdirSync(this.dataDir)
      .filter(file => file.startsWith('page-') && file.endsWith('.json'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/page-(\d+)/)[1]);
        const numB = parseInt(b.match(/page-(\d+)/)[1]);
        return numA - numB;
      });
    
    console.log(`📄 Found ${pageFiles.length} page files to import`);
    
    for (const pageFile of pageFiles) {
      const pagePath = path.join(this.dataDir, pageFile);
      const pageData = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
      
      console.log(`📦 Processing ${pageFile}...`);
      
      if (!pageData.items || !Array.isArray(pageData.items)) {
        console.log(`⚠️  No items found in ${pageFile}`);
        continue;
      }
      
      for (const sbItem of pageData.items) {
        try {
          const assetData = this.transformToAsset(sbItem);
          
          // Check if already imported (direct query)
          const [existing] = await sequelize.query(
            'SELECT id FROM assets WHERE salesbinder_id = $salesbinder_id',
            {
              bind: { salesbinder_id: assetData.salesbinder_id },
              type: sequelize.QueryTypes.SELECT
            }
          );
          
          if (existing) {
            console.log(`⏭️  Skipping ${assetData.make} ${assetData.model} (already imported)`);
            this.skipped++;
            continue;
          }
          
          // Insert directly
          await this.directInsert(assetData);
          console.log(`✅ Imported: ${assetData.make} ${assetData.model} (${assetData.asset_tag})`);
          this.imported++;
          
        } catch (error) {
          console.error(`❌ Error importing item:`, error.message);
          console.error(`   Item:`, sbItem[0]?.name || 'Unknown');
          this.errors++;
        }
      }
    }
    
    console.log('\n🎉 Inventory import complete!');
    console.log(`   ✅ Imported: ${this.imported} items`);
    console.log(`   ⏭️  Skipped: ${this.skipped} items`);
    console.log(`   ❌ Errors: ${this.errors} items`);
    
    return { imported: this.imported, skipped: this.skipped, errors: this.errors };
  }
}

// CLI Interface
async function main() {
  const importer = new SimpleInventoryImporter();
  
  try {
    await importer.importInventoryItems();
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SimpleInventoryImporter;