'use strict';

/**
 * Migration: Add Inventory Taxonomy (Category → Asset Type hierarchy)
 *
 * - Renames 'category' to 'product_category' (freeform field)
 * - Adds new 'category' enum field (Computer, Smartphone, Consumer Electronics, Appliance)
 * - Updates 'asset_type' to match taxonomy
 * - Migrates existing data
 * - Adds validation constraints
 */

const CATEGORIES = ['Computer', 'Smartphone', 'Consumer Electronics', 'Appliance'];

const TAXONOMY = {
  'Computer': ['Laptop', 'Desktop'],
  'Smartphone': ['iPhone', 'Samsung Galaxy', 'Google Pixel'],
  'Consumer Electronics': ['Bluetooth Speaker', 'Home Theatre System', 'Television'],
  'Appliance': ['Refrigerator', 'Microwave', 'Washing Machine', 'Air Conditioner']
};

const ALL_ASSET_TYPES = Object.values(TAXONOMY).flat();

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Rename existing 'category' column to 'product_category' (preserve freeform data)
    const tableInfo = await queryInterface.describeTable('assets');

    if (tableInfo.category) {
      await queryInterface.renameColumn('assets', 'category', 'product_category');
    }

    // Step 2: Add new 'category' column with enum constraint
    await queryInterface.addColumn('assets', 'category', {
      type: Sequelize.STRING(30),
      allowNull: true // Temporarily allow null for migration
    });

    // Step 3: Migrate existing data - infer category from asset_type
    // Map old asset types to new taxonomy
    const assetTypeToCategory = {};
    for (const [category, types] of Object.entries(TAXONOMY)) {
      for (const type of types) {
        assetTypeToCategory[type] = category;
      }
    }

    // Update category based on existing asset_type
    for (const [assetType, category] of Object.entries(assetTypeToCategory)) {
      await queryInterface.sequelize.query(`
        UPDATE assets
        SET category = :category
        WHERE asset_type = :assetType
      `, {
        replacements: { category, assetType }
      });
    }

    // Set default category for any remaining records
    await queryInterface.sequelize.query(`
      UPDATE assets
      SET category = 'Computer'
      WHERE category IS NULL
    `);

    // Update any non-standard asset_type values to 'Laptop' (default)
    await queryInterface.sequelize.query(`
      UPDATE assets
      SET asset_type = 'Laptop'
      WHERE asset_type NOT IN (:validTypes)
    `, {
      replacements: { validTypes: ALL_ASSET_TYPES }
    });

    // Step 4: Make category NOT NULL
    await queryInterface.changeColumn('assets', 'category', {
      type: Sequelize.STRING(30),
      allowNull: false
    });

    // Step 5: Add CHECK constraint for valid categories
    await queryInterface.sequelize.query(`
      ALTER TABLE assets ADD CONSTRAINT check_valid_category
      CHECK (category IN ('Computer', 'Smartphone', 'Consumer Electronics', 'Appliance'))
    `);

    // Step 6: Add CHECK constraint for valid asset types
    await queryInterface.sequelize.query(`
      ALTER TABLE assets ADD CONSTRAINT check_valid_asset_type
      CHECK (asset_type IN (${ALL_ASSET_TYPES.map(t => `'${t}'`).join(', ')}))
    `);

    // Step 7: Add CHECK constraint for valid category/asset_type combinations
    await queryInterface.sequelize.query(`
      ALTER TABLE assets ADD CONSTRAINT check_taxonomy_match
      CHECK (
        (category = 'Computer' AND asset_type IN ('Laptop', 'Desktop'))
        OR (category = 'Smartphone' AND asset_type IN ('iPhone', 'Samsung Galaxy', 'Google Pixel'))
        OR (category = 'Consumer Electronics' AND asset_type IN ('Bluetooth Speaker', 'Home Theatre System', 'Television'))
        OR (category = 'Appliance' AND asset_type IN ('Refrigerator', 'Microwave', 'Washing Machine', 'Air Conditioner'))
      )
    `);

    // Step 8: Create index for category + asset_type filtering
    await queryInterface.addIndex('assets', ['category'], {
      name: 'idx_assets_category'
    });

    await queryInterface.addIndex('assets', ['category', 'asset_type'], {
      name: 'idx_assets_category_asset_type'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_taxonomy_match
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_valid_asset_type
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE assets DROP CONSTRAINT IF EXISTS check_valid_category
    `);

    // Remove indexes
    await queryInterface.removeIndex('assets', 'idx_assets_category_asset_type');
    await queryInterface.removeIndex('assets', 'idx_assets_category');

    // Remove new category column
    await queryInterface.removeColumn('assets', 'category');

    // Rename product_category back to category
    const tableInfo = await queryInterface.describeTable('assets');
    if (tableInfo.product_category) {
      await queryInterface.renameColumn('assets', 'product_category', 'category');
    }
  }
};
