'use strict';

/**
 * Migration: Add a PostgreSQL trigger that enforces inventory availability
 * at the database level. Prevents inserting/updating invoice_items when
 * the requested quantity exceeds available stock.
 *
 * available = asset.quantity - SUM(active reservation items)
 * Active = invoice status NOT IN ('CANCELLED','PAID') AND voided_at IS NULL
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION check_inventory_availability()
      RETURNS TRIGGER AS $$
      DECLARE
        v_on_hand     INTEGER;
        v_reserved    INTEGER;
        v_available   INTEGER;
        v_invoice_status TEXT;
      BEGIN
        -- Skip check if no asset linked (e.g. preorder conversions)
        IF NEW.asset_id IS NULL THEN
          RETURN NEW;
        END IF;

        -- Only enforce for invoices that are actively reserving (UNPAID, PARTIALLY_PAID)
        SELECT status INTO v_invoice_status
          FROM invoices
         WHERE id = NEW.invoice_id;

        IF v_invoice_status IN ('CANCELLED', 'PAID') THEN
          RETURN NEW;
        END IF;

        -- Lock the asset row to prevent concurrent modifications
        SELECT quantity INTO v_on_hand
          FROM assets
         WHERE id = NEW.asset_id
         FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Asset % not found', NEW.asset_id;
        END IF;

        -- Compute currently reserved (excluding this item if it's an UPDATE)
        SELECT COALESCE(SUM(ii.quantity), 0) INTO v_reserved
          FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.id
         WHERE ii.asset_id = NEW.asset_id
           AND i.status NOT IN ('CANCELLED', 'PAID')
           AND ii.voided_at IS NULL
           AND ii.id IS DISTINCT FROM NEW.id;

        v_available := v_on_hand - v_reserved;

        IF NEW.quantity > v_available THEN
          RAISE EXCEPTION 'Insufficient stock for asset %: % available, % requested',
            NEW.asset_id, v_available, NEW.quantity;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_check_inventory_availability ON invoice_items;

      CREATE TRIGGER trg_check_inventory_availability
        BEFORE INSERT OR UPDATE ON invoice_items
        FOR EACH ROW
        EXECUTE FUNCTION check_inventory_availability();
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_check_inventory_availability ON invoice_items;
    `);
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS check_inventory_availability();
    `);
  }
};
