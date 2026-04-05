module.exports = {
  async up(queryInterface, Sequelize) {
    // Add warranty columns to sourcing_batches
    await queryInterface.addColumn('sourcing_batches', 'warranty_days', {
      type: Sequelize.INTEGER, allowNull: true
    });
    await queryInterface.addColumn('sourcing_batches', 'warranty_type', {
      type: Sequelize.STRING(50), allowNull: true
    });
    await queryInterface.addColumn('sourcing_batches', 'warranty_terms', {
      type: Sequelize.TEXT, allowNull: true
    });
    await queryInterface.addColumn('sourcing_batches', 'warranty_expires_on', {
      type: Sequelize.DATEONLY, allowNull: true
    });

    // Create warranty_claims table
    await queryInterface.createTable('warranty_claims', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
      },
      sourcing_batch_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sourcing_batches', key: 'id' }
      },
      asset_unit_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'asset_units', key: 'id' }
      },
      claim_date: { type: Sequelize.DATEONLY, allowNull: false },
      defect_type: { type: Sequelize.STRING(50), allowNull: false },
      defect_description: { type: Sequelize.TEXT, allowNull: true },
      evidence_photos: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'open' },
      resolution_date: { type: Sequelize.DATEONLY, allowNull: true },
      resolution_type: { type: Sequelize.STRING(30), allowNull: true },
      refund_amount_usd: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      refund_amount_ghs: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      replacement_unit_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'asset_units', key: 'id' }
      },
      supplier_reference: { type: Sequelize.STRING(100), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });

    // Indexes on warranty_claims
    await queryInterface.addIndex('warranty_claims', ['sourcing_batch_id'], { name: 'warranty_claims_sourcing_batch_id' });
    await queryInterface.addIndex('warranty_claims', ['asset_unit_id'], { name: 'warranty_claims_asset_unit_id' });
    await queryInterface.addIndex('warranty_claims', ['status'], { name: 'warranty_claims_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('warranty_claims');

    await queryInterface.removeColumn('sourcing_batches', 'warranty_expires_on');
    await queryInterface.removeColumn('sourcing_batches', 'warranty_terms');
    await queryInterface.removeColumn('sourcing_batches', 'warranty_type');
    await queryInterface.removeColumn('sourcing_batches', 'warranty_days');
  }
};
