'use strict';

/**
 * Token-Based Inventory Migration (Phase A)
 *
 * - Adds indexes to speed up availability queries
 * - Backfills asset status from invoice_items (resets stale counter-derived statuses)
 * - Keeps counter columns for backward safety (Phase B will remove them)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add partial index on invoice_items(asset_id) where voided_at IS NULL
    await queryInterface.addIndex('invoice_items', ['asset_id'], {
      name: 'idx_invoice_items_asset_active',
      where: { voided_at: null }
    });

    // 2. Add index on invoices(status)
    await queryInterface.addIndex('invoices', ['status'], {
      name: 'idx_invoices_status'
    });

    // 3. Backfill asset statuses from invoice_items
    // Assets with items on PAID invoices (non-voided, not fully returned) → 'Sold'
    await queryInterface.sequelize.query(`
      UPDATE assets SET status = 'Sold'
      WHERE id IN (
        SELECT DISTINCT ii.asset_id
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.status = 'PAID'
          AND ii.voided_at IS NULL
          AND ii.quantity > ii.quantity_returned_total
      )
      AND deleted_at IS NULL
    `);

    // Assets with items on active non-CANCELLED invoices (but not PAID) → 'Processing'
    await queryInterface.sequelize.query(`
      UPDATE assets SET status = 'Processing'
      WHERE id IN (
        SELECT DISTINCT ii.asset_id
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.status NOT IN ('CANCELLED', 'PAID')
          AND ii.voided_at IS NULL
      )
      AND id NOT IN (
        SELECT DISTINCT ii.asset_id
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.status = 'PAID'
          AND ii.voided_at IS NULL
          AND ii.quantity > ii.quantity_returned_total
      )
      AND deleted_at IS NULL
    `);

    // Assets with no active invoice items → 'In Stock'
    await queryInterface.sequelize.query(`
      UPDATE assets SET status = 'In Stock'
      WHERE id NOT IN (
        SELECT DISTINCT ii.asset_id
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.status != 'CANCELLED'
          AND ii.voided_at IS NULL
      )
      AND deleted_at IS NULL
      AND status IN ('Processing', 'Reserved', 'Sold')
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('invoice_items', 'idx_invoice_items_asset_active');
    await queryInterface.removeIndex('invoices', 'idx_invoices_status');
    // Status backfill is not easily reversible — would need to recompute from counter columns
  }
};
