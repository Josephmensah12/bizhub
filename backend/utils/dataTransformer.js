/**
 * Data transformation utilities for import data
 */

const { normalizeCategory, normalizeAssetType, getCategoryForAssetType } = require('./inventoryTaxonomy');

/**
 * Transform RAM values like "16GB", "16 GB", "16" to numeric GB
 */
function transformRAM(value) {
  if (!value) return null;

  const str = String(value).trim().toUpperCase();
  const match = str.match(/(\d+)\s*(?:GB)?/i);

  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Transform storage values like "512GB SSD", "1TB", "512 SSD" to GB and type
 */
function transformStorage(value) {
  if (!value) return { gb: null, type: null };

  const str = String(value).trim().toUpperCase();

  // Extract GB value
  let gb = null;
  const gbMatch = str.match(/(\d+)\s*(?:GB|G\b)/i);
  const tbMatch = str.match(/(\d+)\s*(?:TB|T\b)/i);

  if (tbMatch) {
    gb = parseInt(tbMatch[1], 10) * 1024;
  } else if (gbMatch) {
    gb = parseInt(gbMatch[1], 10);
  }

  // Extract storage type
  let type = null;
  if (str.includes('NVME') || str.includes('NVM')) {
    type = 'NVMe';
  } else if (str.includes('SSD')) {
    type = 'SSD';
  } else if (str.includes('HDD')) {
    type = 'HDD';
  }

  return { gb, type };
}

/**
 * Normalize status values
 */
function normalizeStatus(value) {
  if (!value) return 'In Stock';

  const str = String(value).trim().toLowerCase();

  const statusMap = {
    'in stock': 'In Stock',
    'instock': 'In Stock',
    'stock': 'In Stock',
    'available': 'In Stock',
    'processing': 'Processing',
    'reserved': 'Reserved',
    'sold': 'Sold',
    'in repair': 'In Repair',
    'repair': 'In Repair',
    'returned': 'Returned',
    'return': 'Returned'
  };

  return statusMap[str] || 'In Stock';
}

/**
 * Normalize condition values
 */
function normalizeCondition(value) {
  if (!value) return null;

  const str = String(value).trim().toLowerCase();

  const conditionMap = {
    'new': 'New',
    'brand new': 'New',
    'open box': 'Open Box',
    'openbox': 'Open Box',
    'renewed': 'Renewed',
    'refurbished': 'Renewed',
    'refurb': 'Renewed',
    'used': 'Used',
    'second hand': 'Used',
    'secondhand': 'Used'
  };

  return conditionMap[str] || null;
}

/**
 * Normalize storage type
 */
function normalizeStorageType(value) {
  if (!value) return null;

  const str = String(value).trim().toUpperCase();

  if (str.includes('NVME') || str.includes('NVM')) return 'NVMe';
  if (str.includes('SSD')) return 'SSD';
  if (str.includes('HDD')) return 'HDD';

  return str;
}

/**
 * Normalize asset type using taxonomy
 * @deprecated Use normalizeAssetType from inventoryTaxonomy instead
 */
function normalizeAssetTypeLocal(value) {
  // Delegate to taxonomy-based normalization
  return normalizeAssetType(value);
}

/**
 * Normalize category using taxonomy
 */
function normalizeCategoryLocal(value) {
  // Delegate to taxonomy-based normalization
  return normalizeCategory(value);
}

/**
 * Parse characteristics/features from comma-separated string
 */
function parseCharacteristics(value) {
  if (!value) return [];

  const str = String(value).trim();
  return str.split(/[,;|]/).map(c => c.trim()).filter(c => c);
}

/**
 * Transform screen size to numeric
 */
function transformScreenSize(value) {
  if (!value) return null;

  const str = String(value).trim();
  const match = str.match(/(\d+\.?\d*)\s*(?:inch|")?/i);

  if (match) {
    return parseFloat(match[1]);
  }

  return null;
}

/**
 * Clean and sanitize text (prevent formula injection)
 */
function sanitizeText(value) {
  if (!value) return null;

  let str = String(value).trim();

  // Remove leading characters that could be formula injection
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    str = "'" + str;
  }

  return str;
}

/**
 * Transform quantity values
 * - Must be a positive integer >= 1
 * - Defaults to 1 if blank/null
 * - Returns null for invalid values (non-integer, decimal, < 1)
 */
function transformQuantity(value) {
  // Blank/null/undefined defaults to 1
  if (value == null || value === '' || value === undefined) {
    return 1;
  }

  const str = String(value).trim();

  // Empty string defaults to 1
  if (str === '') {
    return 1;
  }

  // Parse as number
  const num = parseFloat(str);

  // Invalid (NaN) - return null to trigger validation error
  if (isNaN(num)) {
    return null;
  }

  // Decimal values are not allowed
  if (!Number.isInteger(num)) {
    return null;
  }

  // Must be >= 1
  if (num < 1) {
    return null;
  }

  return num;
}

/**
 * Apply all transformations to a row based on mapping
 */
function transformRow(row, mapping) {
  const transformed = {};

  for (const [bizHubField, sourceColumn] of Object.entries(mapping)) {
    if (!sourceColumn || sourceColumn === '__ignore__') continue;

    const rawValue = row[sourceColumn];

    switch (bizHubField) {
      case 'ram_gb':
        transformed[bizHubField] = transformRAM(rawValue);
        break;

      case 'storage_gb':
      case 'storage_type':
        const storage = transformStorage(rawValue);
        if (bizHubField === 'storage_gb') {
          transformed.storage_gb = storage.gb;
        } else {
          transformed.storage_type = storage.type;
        }
        break;

      case 'status':
        transformed[bizHubField] = normalizeStatus(rawValue);
        break;

      case 'condition':
        transformed[bizHubField] = normalizeCondition(rawValue);
        break;

      case 'category':
        transformed[bizHubField] = normalizeCategory(rawValue);
        break;

      case 'asset_type':
        transformed[bizHubField] = normalizeAssetType(rawValue);
        // If category not set, try to infer from asset_type
        if (!transformed.category && transformed[bizHubField]) {
          transformed.category = getCategoryForAssetType(transformed[bizHubField]);
        }
        break;

      case 'major_characteristics':
        transformed[bizHubField] = parseCharacteristics(rawValue);
        break;

      case 'screen_size_inches':
        transformed[bizHubField] = transformScreenSize(rawValue);
        break;

      case 'serial_number':
      case 'make':
      case 'model':
      case 'cpu':
      case 'gpu':
      case 'resolution':
      case 'specs':
      case 'category':
      case 'subcategory':
        transformed[bizHubField] = sanitizeText(rawValue);
        break;

      case 'quantity':
        transformed[bizHubField] = transformQuantity(rawValue);
        break;

      case 'cost_amount':
      case 'price_amount':
      case 'battery_health_percent':
        const num = parseFloat(rawValue);
        transformed[bizHubField] = isNaN(num) ? null : num;
        break;

      case 'cost_currency':
        transformed[bizHubField] = sanitizeText(rawValue) || 'USD';
        break;

      case 'price_currency':
        transformed[bizHubField] = sanitizeText(rawValue) || 'GHS';
        break;

      default:
        transformed[bizHubField] = sanitizeText(rawValue);
    }
  }

  return transformed;
}

module.exports = {
  transformRAM,
  transformStorage,
  normalizeStatus,
  normalizeCondition,
  normalizeStorageType,
  normalizeAssetType: normalizeAssetTypeLocal,
  normalizeCategory: normalizeCategoryLocal,
  parseCharacteristics,
  transformScreenSize,
  sanitizeText,
  transformQuantity,
  transformRow
};
