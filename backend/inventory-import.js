/**
 * SalesBinder Inventory Import to Bizhub Assets
 * 
 * Maps extracted SalesBinder inventory data to Bizhub Asset schema
 */

const fs = require('fs');
const path = require('path');

// Database setup
require('dotenv').config();
const { Asset } = require('./models');

class InventoryImporter {
  constructor() {
    this.dataDir = './inventory-migration-data';
    this.imported = 0;
    this.skipped = 0;
    this.errors = 0;
  }

  // Generate unique asset tag
  generateAssetTag(itemNumber) {
    return `INV-${String(itemNumber).padStart(6, '0')}`;
  }

  // Map SalesBinder category to Bizhub category/asset_type
  mapCategory(sbCategory) {
    const categoryMap = {
      'Laptop': { category: 'Computer', asset_type: 'Laptop' },
      'TELEVISION': { category: 'Consumer Electronics', asset_type: 'Television' },
      'MISCELLANEOUS': { category: 'Consumer Electronics', asset_type: 'Audio Equipment' }
    };
    
    return categoryMap[sbCategory] || { category: 'Consumer Electronics', asset_type: 'Other' };
  }

  // Extract make and model from product name
  extractMakeModel(name) {
    // Common patterns: "BRAND MODEL" or "BRAND - MODEL" or "MODEL (BRAND)"
    name = name.trim();
    
    // Known brands
    const brands = ['SAMSUNG', 'SONY', 'LG', 'JBL', 'BOSE', 'YAMAHA', 'DELL', 'HP', 'LATITUDE', 'ION', 'KLIPSCH', 'VIZIO'];
    
    // Try to find brand at start
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
    
    // Default: first word as make, rest as model
    const parts = name.split(' ');
    if (parts.length > 1) {
      return { make: parts[0], model: parts.slice(1).join(' ') };
    }
    
    return { make: 'UNKNOWN', model: name };
  }

  // Extract technical specs from SalesBinder item_details
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
          // Convert MB to GB (SalesBinder stores in MB)
          const memoryMB = parseInt(value);
          if (memoryMB && memoryMB > 0) {
            specs.ram_gb = Math.round(memoryMB / 1024);
          }
          break;
        case 'hdd':
          // Convert to GB if needed
          const storage = parseInt(value);
          if (storage && storage > 0) {
            specs.storage_gb = storage;
          }
          break;
        case 'detail condition':
        case 'detail condition ':
          // Map A/B/C to condition
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

  // Transform SalesBinder item to Bizhub Asset
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
      quantity_sold: 0, // Will be computed from invoices
      quantity_returned: 0,
      
      // Product details
      make: make,
      model: model,
      specs: item.description || null,
      
      // Technical specs (mainly for laptops)
      cpu: techSpecs.cpu,
      ram_gb: techSpecs.ram_gb,
      storage_gb: techSpecs.storage_gb,
      storage_type: techSpecs.storage_gb ? 'SSD' : null, // Assume SSD for modern laptops
      
      // Pricing (SalesBinder prices are in GHS)
      cost_amount: item.cost || null,
      cost_currency: 'GHS',
      price_amount: item.price || null,
      price_currency: 'GHS',
      
      // Import tracking
      salesbinder_id: item.id,
      
      // Notes for debugging
      import_notes: `Imported from SalesBinder item #${item.item_number}. Original name: "${item.name}"`
    };
  }

  async importInventoryItems() {
    console.log('🚀 Starting inventory import to Bizhub...');
    
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
          
          // Check if already imported
          const existing = await Asset.findOne({
            where: { salesbinder_id: assetData.salesbinder_id }
          });
          
          if (existing) {
            console.log(`⏭️  Skipping ${assetData.make} ${assetData.model} (already imported)`);
            this.skipped++;
            continue;
          }
          
          // Create asset
          const asset = await Asset.create(assetData);
          console.log(`✅ Imported: ${asset.make} ${asset.model} (${asset.asset_tag})`);
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

  async sampleTransformation() {
    console.log('🔍 Showing sample data transformation...');
    
    const sampleFile = path.join(this.dataDir, 'sample-inventory.json');
    if (!fs.existsSync(sampleFile)) {
      console.log('❌ No sample inventory found');
      return;
    }
    
    const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
    const transformed = this.transformToAsset(sample);
    
    console.log('\n📦 SalesBinder → Bizhub Transformation:');
    console.log(`Original: "${sample[0].name}"`);
    console.log(`→ Make: ${transformed.make}`);
    console.log(`→ Model: ${transformed.model}`);
    console.log(`→ Category: ${transformed.category} / ${transformed.asset_type}`);
    console.log(`→ Asset Tag: ${transformed.asset_tag}`);
    console.log(`→ Price: ${transformed.price_amount} ${transformed.price_currency}`);
    console.log(`→ Cost: ${transformed.cost_amount} ${transformed.cost_currency}`);
    
    if (transformed.cpu) console.log(`→ CPU: ${transformed.cpu}`);
    if (transformed.ram_gb) console.log(`→ RAM: ${transformed.ram_gb} GB`);
    if (transformed.storage_gb) console.log(`→ Storage: ${transformed.storage_gb} GB`);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const importer = new InventoryImporter();
  
  try {
    if (args.includes('--sample')) {
      await importer.sampleTransformation();
      return;
    }
    
    // Run import
    await importer.importInventoryItems();
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = InventoryImporter;