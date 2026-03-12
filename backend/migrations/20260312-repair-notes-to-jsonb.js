'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Convert existing text notes to JSONB array format before changing column type
    // Wrap any existing text notes into a JSON array entry
    await queryInterface.sequelize.query(`
      UPDATE assets
      SET repair_notes = json_build_array(json_build_object(
        'text', repair_notes,
        'author', COALESCE((SELECT full_name FROM users WHERE id = assets.repair_updated_by), 'System'),
        'author_id', repair_updated_by,
        'timestamp', COALESCE(repair_updated_at, NOW())
      ))::text
      WHERE repair_notes IS NOT NULL AND repair_notes != ''
    `);
    await queryInterface.sequelize.query(`
      UPDATE asset_units
      SET repair_notes = json_build_array(json_build_object(
        'text', repair_notes,
        'author', COALESCE((SELECT full_name FROM users WHERE id = asset_units.repair_updated_by), 'System'),
        'author_id', repair_updated_by,
        'timestamp', COALESCE(repair_updated_at, NOW())
      ))::text
      WHERE repair_notes IS NOT NULL AND repair_notes != ''
    `);

    // Change column type to JSONB using raw SQL (USING clause required for text→jsonb cast)
    await queryInterface.sequelize.query(`
      ALTER TABLE assets ALTER COLUMN repair_notes TYPE JSONB USING repair_notes::jsonb;
      ALTER TABLE assets ALTER COLUMN repair_notes SET DEFAULT NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE asset_units ALTER COLUMN repair_notes TYPE JSONB USING repair_notes::jsonb;
      ALTER TABLE asset_units ALTER COLUMN repair_notes SET DEFAULT NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('assets', 'repair_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.changeColumn('asset_units', 'repair_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  }
};
