/**
 * Inventory Taxonomy - Single Source of Truth
 *
 * Defines the 2-level hierarchy: Category → Asset Type
 * Used by: UI dropdowns, backend validation, bulk import
 */

const TAXONOMY = {
  'Computer': ['Laptop', 'Desktop', 'MacBook', 'Tablet', 'Monitor', 'Storage Device', 'Memory', 'Other'],
  'Smartphone': ['iPhone', 'Samsung Galaxy', 'Google Pixel', 'Other'],
  'Consumer Electronics': ['Bluetooth Speaker', 'Home Theatre System', 'Television', 'Audio Equipment', 'Other'],
  'Appliance': ['Refrigerator', 'Washing Machine', 'Air Conditioner', 'Other']
};

// Get all categories
const CATEGORIES = Object.keys(TAXONOMY);

// Get all asset types (flat list, deduplicated)
const ALL_ASSET_TYPES = [...new Set(Object.values(TAXONOMY).flat())];

// Normalization maps for flexible input handling
const CATEGORY_NORMALIZATION = {
  // Computer
  'computer': 'Computer',
  'computers': 'Computer',
  'pc': 'Computer',
  'pcs': 'Computer',

  // Smartphone
  'smartphone': 'Smartphone',
  'smartphones': 'Smartphone',
  'phone': 'Smartphone',
  'phones': 'Smartphone',
  'mobile': 'Smartphone',
  'mobile phone': 'Smartphone',
  'cell phone': 'Smartphone',
  'cellphone': 'Smartphone',

  // Consumer Electronics
  'consumer electronics': 'Consumer Electronics',
  'consumerelectronics': 'Consumer Electronics',
  'consumer_electronics': 'Consumer Electronics',
  'electronics': 'Consumer Electronics',
  'ce': 'Consumer Electronics',

  // Appliance
  'appliance': 'Appliance',
  'appliances': 'Appliance',
  'home appliance': 'Appliance',
  'home appliances': 'Appliance',
  'homeappliance': 'Appliance'
};

const ASSET_TYPE_NORMALIZATION = {
  // Computer types
  'laptop': 'Laptop',
  'laptops': 'Laptop',
  'notebook': 'Laptop',
  'notebooks': 'Laptop',
  'desktop': 'Desktop',
  'desktops': 'Desktop',
  'pc': 'Desktop',

  // Smartphone types
  'iphone': 'iPhone',
  'apple iphone': 'iPhone',
  'apple': 'iPhone',
  'samsung galaxy': 'Samsung Galaxy',
  'samsung': 'Samsung Galaxy',
  'galaxy': 'Samsung Galaxy',
  'google pixel': 'Google Pixel',
  'pixel': 'Google Pixel',
  'google': 'Google Pixel',

  // Computer types (extended)
  'macbook': 'MacBook',
  'mac book': 'MacBook',
  'macbooks': 'MacBook',
  'tablet': 'Tablet',
  'tablets': 'Tablet',
  'surface': 'Tablet',
  'microsoft surface': 'Tablet',
  'ipad': 'Tablet',
  'monitor': 'Monitor',
  'monitors': 'Monitor',
  'display': 'Monitor',
  'storage device': 'Storage Device',
  'storage': 'Storage Device',
  'hard drive': 'Storage Device',
  'hard drives': 'Storage Device',
  'ssd': 'Storage Device',
  'hdd': 'Storage Device',
  'memory': 'Memory',
  'ram': 'Memory',
  'ddr4': 'Memory',
  'ddr5': 'Memory',

  // Consumer Electronics types
  'bluetooth speaker': 'Bluetooth Speaker',
  'bluetoothspeaker': 'Bluetooth Speaker',
  'bt speaker': 'Bluetooth Speaker',
  'speaker': 'Bluetooth Speaker',
  'home theatre system': 'Home Theatre System',
  'home theatre': 'Home Theatre System',
  'hometheatre': 'Home Theatre System',
  'home theater': 'Home Theatre System',
  'home theater system': 'Home Theatre System',
  'theatre': 'Home Theatre System',
  'theater': 'Home Theatre System',
  'television': 'Television',
  'tv': 'Television',
  'tvs': 'Television',

  // Consumer Electronics types (extended)
  'audio equipment': 'Audio Equipment',
  'audio': 'Audio Equipment',
  'headphones': 'Audio Equipment',
  'earbuds': 'Audio Equipment',
  'airpods': 'Audio Equipment',
  'soundbar': 'Audio Equipment',

  // Appliance types
  'refrigerator': 'Refrigerator',
  'fridge': 'Refrigerator',
  'fridges': 'Refrigerator',
  'washing machine': 'Washing Machine',
  'washingmachine': 'Washing Machine',
  'washer': 'Washing Machine',
  'air conditioner': 'Air Conditioner',
  'airconditioner': 'Air Conditioner',
  'ac': 'Air Conditioner',
  'a/c': 'Air Conditioner',
  'aircon': 'Air Conditioner',

  // Other (generic)
  'other': 'Other'
};

/**
 * Normalize category input to canonical value
 * @param {string} input - Raw category input
 * @returns {string|null} Canonical category or null if invalid
 */
function normalizeCategory(input) {
  if (!input) return null;

  const normalized = String(input).trim().toLowerCase();

  // Check direct match first
  if (CATEGORIES.map(c => c.toLowerCase()).includes(normalized)) {
    return CATEGORIES.find(c => c.toLowerCase() === normalized);
  }

  // Check normalization map
  return CATEGORY_NORMALIZATION[normalized] || null;
}

/**
 * Normalize asset type input to canonical value
 * @param {string} input - Raw asset type input
 * @returns {string|null} Canonical asset type or null if invalid
 */
function normalizeAssetType(input) {
  if (!input) return null;

  const normalized = String(input).trim().toLowerCase();

  // Check direct match first
  if (ALL_ASSET_TYPES.map(t => t.toLowerCase()).includes(normalized)) {
    return ALL_ASSET_TYPES.find(t => t.toLowerCase() === normalized);
  }

  // Check normalization map
  return ASSET_TYPE_NORMALIZATION[normalized] || null;
}

/**
 * Get asset types for a given category
 * @param {string} category - Category name
 * @returns {string[]} Array of valid asset types
 */
function getAssetTypesForCategory(category) {
  const normalizedCategory = normalizeCategory(category);
  if (!normalizedCategory) return [];
  return TAXONOMY[normalizedCategory] || [];
}

/**
 * Get category for an asset type
 * @param {string} assetType - Asset type name
 * @returns {string|null} Category name or null if not found
 */
function getCategoryForAssetType(assetType) {
  const normalizedType = normalizeAssetType(assetType);
  if (!normalizedType) return null;

  for (const [category, types] of Object.entries(TAXONOMY)) {
    if (types.includes(normalizedType)) {
      return category;
    }
  }
  return null;
}

/**
 * Validate category/assetType combination
 * @param {string} category - Category name
 * @param {string} assetType - Asset type name
 * @returns {Object} { valid: boolean, error?: string, normalizedCategory?, normalizedAssetType? }
 */
function validateTaxonomy(category, assetType) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedAssetType = normalizeAssetType(assetType);

  if (!normalizedCategory) {
    return {
      valid: false,
      error: `Invalid category: "${category}". Allowed: ${CATEGORIES.join(', ')}`
    };
  }

  if (!normalizedAssetType) {
    return {
      valid: false,
      error: `Invalid asset type: "${assetType}". Allowed: ${ALL_ASSET_TYPES.join(', ')}`
    };
  }

  const validTypes = TAXONOMY[normalizedCategory];
  if (!validTypes.includes(normalizedAssetType)) {
    return {
      valid: false,
      error: `Asset Type "${normalizedAssetType}" is not valid for Category "${normalizedCategory}". Valid types: ${validTypes.join(', ')}`
    };
  }

  return {
    valid: true,
    normalizedCategory,
    normalizedAssetType
  };
}

/**
 * Check if a category is valid
 */
function isValidCategory(category) {
  return normalizeCategory(category) !== null;
}

/**
 * Check if an asset type is valid (regardless of category)
 */
function isValidAssetType(assetType) {
  return normalizeAssetType(assetType) !== null;
}

/**
 * Get full taxonomy object for API/frontend
 */
function getTaxonomy() {
  return {
    taxonomy: TAXONOMY,
    categories: CATEGORIES,
    allAssetTypes: ALL_ASSET_TYPES
  };
}

// --- Async functions that merge hardcoded + custom DB values ---

/**
 * Get full taxonomy merged with custom values from DB
 * @returns {Object} { taxonomy, categories, allAssetTypes }
 */
async function getFullTaxonomy() {
  // Lazy-require to avoid circular dependency at module load
  const { CustomTaxonomyValue } = require('../models');

  const customValues = await CustomTaxonomyValue.findAll({ order: [['value', 'ASC']] });

  // Start with a deep copy of hardcoded taxonomy
  const merged = {};
  for (const [cat, types] of Object.entries(TAXONOMY)) {
    merged[cat] = [...types];
  }

  // Add custom categories and asset types
  for (const cv of customValues) {
    if (cv.value_type === 'category') {
      if (!merged[cv.value]) {
        merged[cv.value] = [];
      }
    } else if (cv.value_type === 'asset_type' && cv.parent_category) {
      if (!merged[cv.parent_category]) {
        merged[cv.parent_category] = [];
      }
      if (!merged[cv.parent_category].includes(cv.value)) {
        merged[cv.parent_category].push(cv.value);
      }
    }
  }

  const categories = Object.keys(merged);
  const allAssetTypes = [...new Set(Object.values(merged).flat())];

  return { taxonomy: merged, categories, allAssetTypes };
}

/**
 * Create a custom taxonomy value (trims, case-insensitive duplicate check)
 * @param {string} valueType - 'category' or 'asset_type'
 * @param {string} value - The display value
 * @param {string|null} parentCategory - Required for asset_type
 * @param {number|null} userId - Creator user ID
 * @returns {string} The canonical (saved) value
 */
async function createCustomValue(valueType, value, parentCategory, userId) {
  const { CustomTaxonomyValue } = require('../models');

  const trimmed = String(value).trim();
  if (!trimmed || trimmed.length > 60) {
    throw new Error('Value must be between 1 and 60 characters');
  }

  if (valueType === 'asset_type' && !parentCategory) {
    throw new Error('parent_category is required for asset_type values');
  }

  // Check against hardcoded values (case-insensitive)
  if (valueType === 'category') {
    const existing = CATEGORIES.find(c => c.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
  } else if (valueType === 'asset_type') {
    const existing = ALL_ASSET_TYPES.find(t => t.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
  }

  // Check against existing custom values (case-insensitive via DB)
  const { sequelize } = require('../models');
  const existingCustom = await CustomTaxonomyValue.findOne({
    where: sequelize.and(
      { value_type: valueType },
      sequelize.where(sequelize.fn('LOWER', sequelize.col('value')), trimmed.toLowerCase())
    )
  });

  if (existingCustom) {
    return existingCustom.value;
  }

  // Create new custom value
  const created = await CustomTaxonomyValue.create({
    value_type: valueType,
    value: trimmed,
    parent_category: parentCategory || null,
    created_by: userId || null
  });

  return created.value;
}

/**
 * Validate category/assetType combination against merged taxonomy (async)
 */
async function validateTaxonomyAsync(category, assetType) {
  const { taxonomy, categories, allAssetTypes } = await getFullTaxonomy();

  // Try normalization first (hardcoded only)
  let resolvedCategory = normalizeCategory(category) || category;
  let resolvedAssetType = normalizeAssetType(assetType) || assetType;

  // Check category exists in merged taxonomy
  const matchedCategory = categories.find(c => c.toLowerCase() === String(resolvedCategory).trim().toLowerCase());
  if (!matchedCategory) {
    return {
      valid: false,
      error: `Invalid category: "${category}". Allowed: ${categories.join(', ')}`
    };
  }

  // Check asset type exists in merged taxonomy
  const matchedAssetType = allAssetTypes.find(t => t.toLowerCase() === String(resolvedAssetType).trim().toLowerCase());
  if (!matchedAssetType) {
    return {
      valid: false,
      error: `Invalid asset type: "${assetType}". Allowed: ${allAssetTypes.join(', ')}`
    };
  }

  // Check combination
  const validTypes = taxonomy[matchedCategory] || [];
  if (!validTypes.map(t => t.toLowerCase()).includes(matchedAssetType.toLowerCase())) {
    return {
      valid: false,
      error: `Asset Type "${matchedAssetType}" is not valid for Category "${matchedCategory}". Valid types: ${validTypes.join(', ')}`
    };
  }

  return {
    valid: true,
    normalizedCategory: matchedCategory,
    normalizedAssetType: matchedAssetType
  };
}

/**
 * Check if a category is valid (async, checks merged taxonomy)
 */
async function isValidCategoryAsync(value) {
  const { categories } = await getFullTaxonomy();
  const normalized = normalizeCategory(value);
  if (normalized) return true;
  return categories.some(c => c.toLowerCase() === String(value).trim().toLowerCase());
}

/**
 * Check if an asset type is valid (async, checks merged taxonomy)
 */
async function isValidAssetTypeAsync(value) {
  const { allAssetTypes } = await getFullTaxonomy();
  const normalized = normalizeAssetType(value);
  if (normalized) return true;
  return allAssetTypes.some(t => t.toLowerCase() === String(value).trim().toLowerCase());
}

module.exports = {
  TAXONOMY,
  CATEGORIES,
  ALL_ASSET_TYPES,
  normalizeCategory,
  normalizeAssetType,
  getAssetTypesForCategory,
  getCategoryForAssetType,
  validateTaxonomy,
  isValidCategory,
  isValidAssetType,
  getTaxonomy,
  getFullTaxonomy,
  createCustomValue,
  validateTaxonomyAsync,
  isValidCategoryAsync,
  isValidAssetTypeAsync
};
