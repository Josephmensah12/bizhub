'use strict';

/**
 * Round 2 classification: fix specific items and add more patterns.
 */

const RULES = [
  // ─── Audio (specific models) ───
  { pattern: /SAMSUNG\s*B73CD|B73CD/i, category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  { pattern: /SONY\s*HTC?\d|HTC40|HT-C|HT-S|HT-X|HT-A|HT-G/i, category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  { pattern: /SAMSUNG\s*HW-|HW-[A-Z]\d/i, category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  { pattern: /Klipsch/i, category: 'Consumer Electronics', asset_type: 'Audio Equipment' },

  // ─── Laptops (EB shorthand, HP model numbers) ───
  { pattern: /^EB\s*X?\d{3}/i, category: 'Computer', asset_type: 'Laptop' },
  { pattern: /^EB\s*[A-Z]/i, category: 'Computer', asset_type: 'Laptop' },
  { pattern: /^HP\s*\d{2}/i, category: 'Computer', asset_type: 'Laptop' },
  { pattern: /^\d{4}[A-Z].*#ABA/i, category: 'Computer', asset_type: 'Laptop' },

  // ─── Laptops (Lenovo model numbers) ───
  { pattern: /^80X\d/i, category: 'Computer', asset_type: 'Laptop' },

  // ─── Laptops (generic specs patterns) ───
  { pattern: /\d+GB\/\d+SSD|\d+GB\/\d+HDD/i, category: 'Computer', asset_type: 'Laptop' },
  { pattern: /Intel\s*Core|Core\s*2\s*Duo|Ci[357]/i, category: 'Computer', asset_type: 'Laptop' },
  { pattern: /RAM\s*\d+GB.*HDD|HDD\s*\d+GB.*RAM/i, category: 'Computer', asset_type: 'Laptop' },
  { pattern: /\d+\.?\d*"\s*LT|\d+\.?\d*"\s*laptop/i, category: 'Computer', asset_type: 'Laptop' },
  { pattern: /screen\/board/i, category: 'Computer', asset_type: 'Laptop' },
];

function classify(description) {
  if (!description) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(description.trim())) {
      return { category: rule.category, asset_type: rule.asset_type };
    }
  }
  return null;
}

module.exports = {
  async up(queryInterface) {
    // Get still-unclassified items
    const [items] = await queryInterface.sequelize.query(`
      SELECT ii.id, ii.description
      FROM invoice_items ii
      WHERE ii.asset_id IS NULL
        AND ii.category IS NULL
        AND LOWER(COALESCE(ii.description, '')) NOT LIKE '%discount%'
    `);

    console.log(`=== Round 2: ${items.length} remaining unclassified items ===`);

    let classified = 0;
    const categoryCounts = {};

    for (const item of items) {
      const result = classify(item.description);
      if (result) {
        await queryInterface.sequelize.query(`
          UPDATE invoice_items SET category = :category, asset_type = :asset_type WHERE id = :id
        `, { replacements: { category: result.category, asset_type: result.asset_type, id: item.id } });

        const key = `${result.category} > ${result.asset_type}`;
        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
        classified++;
      }
    }

    console.log(`Round 2 classified: ${classified}`);
    for (const [key, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key}: ${count}`);
    }

    // Show final remaining count
    const [remaining] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as cnt FROM invoice_items
      WHERE asset_id IS NULL AND category IS NULL
        AND LOWER(COALESCE(description, '')) NOT LIKE '%discount%'
    `);
    console.log(`\nStill unclassified (non-discount): ${remaining[0].cnt}`);
  },

  async down() {}
};
