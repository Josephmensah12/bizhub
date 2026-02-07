/**
 * Smart column detection and mapping utilities
 */

const { CATEGORIES, ALL_ASSET_TYPES, getFullTaxonomy } = require('./inventoryTaxonomy');

// Fuzzy match patterns for auto-detecting columns
const COLUMN_PATTERNS = {
  category: ['category', 'cat', 'product_category', 'device_category', 'item_category'],
  asset_type: ['type', 'assettype', 'asset_type', 'device_type', 'product_type', 'item_type'],
  make: ['make', 'brand', 'manufacturer', 'vendor'],
  model: ['model', 'product', 'item', 'product_name'],
  serial_number: ['serial', 'serialnumber', 'sn', 's/n', 'serial_number', 'serialno'],
  quantity: ['quantity', 'qty', 'count', 'units', 'amount', 'num'],
  ram_gb: ['ram', 'memory', 'ramgb', 'ram_gb', 'mem'],
  storage_gb: ['storage', 'storagegb', 'storage_gb', 'disk', 'hdd', 'ssd', 'capacity'],
  storage_type: ['storagetype', 'storage_type', 'disktype', 'disk_type'],
  cpu: ['cpu', 'processor', 'proc', 'chip'],
  gpu: ['gpu', 'graphics', 'video', 'graphics_card'],
  screen_size_inches: ['screen', 'display', 'screensize', 'screen_size', 'size', 'inches'],
  resolution: ['resolution', 'res', 'display_res'],
  battery_health_percent: ['battery', 'batteryhealth', 'battery_health', 'bat'],
  major_characteristics: ['features', 'characteristics', 'tags'],
  condition: ['condition', 'state', 'quality'],
  status: ['status', 'availability', 'stock_status'],
  cost_amount: ['cost', 'purchase_price', 'buy_price', 'costamount'],
  price_amount: ['price', 'sell_price', 'selling_price', 'retail', 'priceamount'],
  cost_currency: ['cost_currency', 'costcurrency', 'purchase_currency'],
  price_currency: ['price_currency', 'pricecurrency', 'sale_currency', 'currency'],
  specs: ['specs', 'specifications', 'notes', 'description', 'details'],
  product_category: ['product_category', 'prod_category', 'productcat'],
  subcategory: ['subcategory', 'subcat', 'sub_category']
};

/**
 * Auto-detect column mappings based on header names
 */
function autoDetectColumns(headers) {
  const mappings = {};
  const normalizedHeaders = headers.map(h => ({
    original: h,
    normalized: h.toLowerCase().replace(/[^a-z0-9]/g, '')
  }));

  // Try to match each BizHub field with uploaded columns
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const header of normalizedHeaders) {
      if (patterns.some(pattern =>
        header.normalized.includes(pattern) ||
        pattern.includes(header.normalized)
      )) {
        mappings[field] = header.original;
        break;
      }
    }
  }

  return mappings;
}

/**
 * Get required fields for validation
 */
function getRequiredFields() {
  return ['category', 'asset_type', 'make', 'model'];
}

/**
 * Get conditionally required fields
 */
function getConditionalRequiredFields() {
  return {};
}

/**
 * Get field metadata for UI (async — merges custom taxonomy values)
 */
async function getFieldMetadata() {
  const { categories, allAssetTypes } = await getFullTaxonomy();

  return {
    category: {
      label: 'Category',
      required: true,
      type: 'enum',
      options: categories,
      allowOther: true,
      description: 'Primary classification (Computer, Smartphone, Consumer Electronics, Appliance)'
    },
    asset_type: {
      label: 'Asset Type',
      required: true,
      type: 'enum',
      options: allAssetTypes,
      dependsOn: 'category',
      allowOther: true,
      description: 'Specific type within category (depends on selected category)'
    },
    make: { label: 'Make', required: true, type: 'text' },
    model: { label: 'Model', required: true, type: 'text' },
    serial_number: { label: 'Serial Number', required: false, type: 'text', unique: true },
    quantity: { label: 'Quantity', required: false, type: 'integer', min: 1, default: 1, description: 'Number of units (defaults to 1)' },
    ram_gb: { label: 'RAM (GB)', required: false, type: 'number' },
    storage_gb: { label: 'Storage (GB)', required: false, type: 'number' },
    storage_type: { label: 'Storage Type', required: false, type: 'enum', options: ['HDD', 'SSD', 'NVMe', 'Other'] },
    cpu: { label: 'CPU', required: false, type: 'text' },
    gpu: { label: 'GPU', required: false, type: 'text' },
    screen_size_inches: { label: 'Screen Size (inches)', required: false, type: 'number' },
    resolution: { label: 'Resolution', required: false, type: 'text' },
    battery_health_percent: { label: 'Battery Health (%)', required: false, type: 'number', min: 0, max: 100 },
    major_characteristics: { label: 'Features/Characteristics', required: false, type: 'array' },
    condition: { label: 'Condition', required: false, type: 'enum', options: ['New', 'Open Box', 'Renewed', 'Used'] },
    status: { label: 'Status', required: false, type: 'enum', options: ['In Stock', 'Processing', 'Reserved', 'Sold', 'In Repair', 'Returned'] },
    cost_amount: { label: 'Cost Amount', required: false, type: 'number' },
    cost_currency: { label: 'Cost Currency', required: false, type: 'enum', options: ['USD', 'GHS', 'GBP'] },
    price_amount: { label: 'Price Amount', required: false, type: 'number' },
    price_currency: { label: 'Price Currency', required: false, type: 'enum', options: ['USD', 'GHS', 'GBP'] },
    specs: { label: 'Specifications/Notes', required: false, type: 'text' },
    product_category: { label: 'Product Category (Freeform)', required: false, type: 'text' },
    subcategory: { label: 'Subcategory', required: false, type: 'text' }
  };
}

module.exports = {
  autoDetectColumns,
  getRequiredFields,
  getConditionalRequiredFields,
  getFieldMetadata,
  COLUMN_PATTERNS
};
