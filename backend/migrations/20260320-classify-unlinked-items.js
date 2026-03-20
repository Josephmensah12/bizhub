'use strict';

/**
 * AI-style classification: categorize all unlinked invoice_items by description.
 * Uses keyword matching against BizHub's taxonomy.
 */

// Classification rules: ordered by specificity (most specific first)
const RULES = [
  // ─── Discounts (skip — not a product) ───
  { pattern: /^discount$/i, category: null, asset_type: null },

  // ─── Appliances ───
  { pattern: /refrigerator|fridge|cuft|cu\s*ft|freezer|RF\d{2}|RT\d{2}|RS\d{2}|HFU\d/i, category: 'Appliance', asset_type: 'Refrigerator' },
  { pattern: /washing\s*machine|washer|dryer|laundry|WF\d|WD\d/i, category: 'Appliance', asset_type: 'Washing Machine' },
  { pattern: /air\s*condition|ac\s*unit|split\s*unit|inverter\s*ac/i, category: 'Appliance', asset_type: 'Air Conditioner' },
  { pattern: /microwave|oven|range|gas\s*range|stove|cooktop|dishwasher|MC\d{2}T|ME\d{2}|NE\d{2}|LTGL\d|LRG\d/i, category: 'Appliance', asset_type: 'Other' },

  // ─── TVs ───
  { pattern: /\d{2}"\s*TV|\d{2}"\s*OLED|\d{2}"\s*QLED|\d{2}"\s*LED|television|\d{2}U\d|QN\d{2}|S\d{2}[A-Z]|OLED\s*[A-Z]\d|UA\d{2}|Q\d{2}CF/i, category: 'Consumer Electronics', asset_type: 'Television' },

  // ─── Audio ───
  { pattern: /soundbar|sound\s*bar|cinema\s*sb|home\s*theatre|home\s*theater|surround/i, category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  { pattern: /JBL|speaker|bluetooth\s*speaker|bose|sonos|harman/i, category: 'Consumer Electronics', asset_type: 'Bluetooth Speaker' },
  { pattern: /headphone|earphone|earbud|airpod/i, category: 'Consumer Electronics', asset_type: 'Audio Equipment' },

  // ─── MacBooks ───
  { pattern: /macbook|mac\s*book|MBA\s*\d|MBP\s*\d|apple.*M[1-4]/i, category: 'Computer', asset_type: 'MacBook' },

  // ─── Laptops (HP specific) ───
  { pattern: /elitebook|elite\s*book|probook|pro\s*book|zbook|z\s*book|envy|pavilion|omen|HP\s*(?:EB|spectre|dragonfly)/i, category: 'Computer', asset_type: 'Laptop' },
  // ─── Laptops (Lenovo) ───
  { pattern: /thinkpad|think\s*pad|ideapad|idea\s*pad|yoga|lenovo/i, category: 'Computer', asset_type: 'Laptop' },
  // ─── Laptops (Dell) ───
  { pattern: /latitude|precision|inspiron|xps\s*\d|dell/i, category: 'Computer', asset_type: 'Laptop' },
  // ─── Laptops (generic — CPU specs indicate laptop) ───
  { pattern: /CORE\s*I[357]|AMD\s*Ryzen|i[357]-\d{4}|\/\d+G\/\d+G\//i, category: 'Computer', asset_type: 'Laptop' },
  // ─── Laptops (catch-all for common models) ───
  { pattern: /laptop|notebook|chromebook|surface\s*laptop/i, category: 'Computer', asset_type: 'Laptop' },

  // ─── Tablets ───
  { pattern: /ipad|surface\s*pro|surface\s*go|tablet|galaxy\s*tab/i, category: 'Computer', asset_type: 'Tablet' },

  // ─── Desktops ───
  { pattern: /desktop|tower|mini\s*pc|mac\s*mini|imac|optiplex|prodesk|elitedesk/i, category: 'Computer', asset_type: 'Desktop' },

  // ─── Monitors ───
  { pattern: /monitor|display\s*\d|LG\s*\d{2}[A-Z]{2}|dell.*\d{2}"/i, category: 'Computer', asset_type: 'Monitor' },

  // ─── Phones ───
  { pattern: /iphone/i, category: 'Smartphone', asset_type: 'iPhone' },
  { pattern: /galaxy\s*[SA]\d|samsung\s*galaxy/i, category: 'Smartphone', asset_type: 'Samsung Galaxy' },
  { pattern: /pixel\s*\d/i, category: 'Smartphone', asset_type: 'Google Pixel' },

  // ─── Samsung/LG generic (likely appliance or electronics) ───
  { pattern: /^SAMSUNG\s*ELECTRONICS/i, category: 'Consumer Electronics', asset_type: 'Television' },
  { pattern: /^LG\s*ELECTRONICS/i, category: 'Consumer Electronics', asset_type: 'Television' },
];

function classify(description) {
  if (!description) return { category: null, asset_type: null };
  const desc = description.trim();

  for (const rule of RULES) {
    if (rule.pattern.test(desc)) {
      return { category: rule.category, asset_type: rule.asset_type };
    }
  }

  return { category: null, asset_type: null };
}

module.exports = {
  async up(queryInterface) {
    // Get all unlinked invoice items
    const [items] = await queryInterface.sequelize.query(`
      SELECT ii.id, ii.description
      FROM invoice_items ii
      WHERE ii.asset_id IS NULL
        AND ii.category IS NULL
    `);

    console.log(`=== Classifying ${items.length} unlinked invoice items ===`);

    let classified = 0;
    let skipped = 0;
    const categoryCounts = {};

    for (const item of items) {
      const { category, asset_type } = classify(item.description);

      if (category) {
        await queryInterface.sequelize.query(`
          UPDATE invoice_items SET category = :category, asset_type = :asset_type WHERE id = :id
        `, { replacements: { category, asset_type, id: item.id } });

        const key = `${category} > ${asset_type}`;
        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
        classified++;
      } else {
        // Discount lines or truly unclassifiable
        skipped++;
      }
    }

    console.log(`Classified: ${classified}, Skipped: ${skipped} (discounts/unrecognized)`);
    console.log('Breakdown:');
    for (const [key, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key}: ${count}`);
    }

    // Show remaining unclassified (non-discount)
    const [remaining] = await queryInterface.sequelize.query(`
      SELECT DISTINCT ii.description
      FROM invoice_items ii
      WHERE ii.asset_id IS NULL AND ii.category IS NULL
        AND LOWER(ii.description) NOT LIKE '%discount%'
      LIMIT 20
    `);
    if (remaining.length > 0) {
      console.log(`\nStill unclassified (${remaining.length} unique descriptions):`);
      remaining.forEach(r => console.log(`  "${r.description}"`));
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE invoice_items SET category = NULL, asset_type = NULL WHERE asset_id IS NULL
    `);
  }
};
