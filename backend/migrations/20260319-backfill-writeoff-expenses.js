'use strict';

/**
 * Backfill: Create expense entries for all existing APPROVED write-offs
 * that don't already have a linked expense.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Get or create the "Inventory Write-Offs" category
    let [cats] = await queryInterface.sequelize.query(
      `SELECT id FROM expense_categories WHERE name = 'Inventory Write-Offs'`
    );
    let categoryId;
    if (cats.length > 0) {
      categoryId = cats[0].id;
    } else {
      await queryInterface.bulkInsert('expense_categories', [{
        name: 'Inventory Write-Offs',
        is_sensitive: false,
        is_active: true,
        sort_order: 13,
        created_at: new Date(),
        updated_at: new Date()
      }]);
      const [inserted] = await queryInterface.sequelize.query(
        `SELECT id FROM expense_categories WHERE name = 'Inventory Write-Offs'`
      );
      categoryId = inserted[0].id;
    }

    // Get all approved write-offs that don't have a linked expense yet
    const [writeOffs] = await queryInterface.sequelize.query(`
      SELECT
        wo.id,
        wo.write_off_number,
        wo.asset_id,
        wo.reason,
        wo.quantity,
        wo.total_cost_amount,
        wo.currency,
        wo.approved_at,
        wo.created_by,
        a.asset_tag,
        a.make,
        a.model
      FROM inventory_write_offs wo
      LEFT JOIN assets a ON a.id = wo.asset_id
      WHERE wo.status = 'APPROVED'
        AND wo.id NOT IN (
          SELECT write_off_id FROM expenses WHERE write_off_id IS NOT NULL
        )
      ORDER BY wo.approved_at ASC
    `);

    if (writeOffs.length === 0) {
      console.log('No write-offs to backfill.');
      return;
    }

    console.log(`Backfilling ${writeOffs.length} approved write-offs into expenses...`);

    // Try to get a rough FX rate for GHS->USD from cache
    let fxRate = 1;
    try {
      const [rateRow] = await queryInterface.sequelize.query(`
        SELECT rate FROM exchange_rate_cache
        WHERE base_currency = 'GHS' AND quote_currency = 'USD'
        ORDER BY rate_date DESC LIMIT 1
      `);
      if (rateRow.length > 0) {
        fxRate = parseFloat(rateRow[0].rate);
      }
    } catch (e) {
      // fallback to 1
    }

    const expenses = writeOffs.map(wo => {
      const amountLocal = parseFloat(wo.total_cost_amount) || 0;
      const currency = wo.currency || 'GHS';
      const rate = currency === 'USD' ? 1 : fxRate;
      const amountUsd = currency === 'USD' ? amountLocal : amountLocal * rate;

      const approvedDate = wo.approved_at
        ? new Date(wo.approved_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const d = new Date(approvedDate);
      const recognitionPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const assetLabel = [wo.asset_tag, wo.make, wo.model].filter(Boolean).join(' ').trim() || `Asset #${wo.asset_id}`;

      return {
        expense_date: approvedDate,
        recognition_period: recognitionPeriod,
        category_id: categoryId,
        description: `Write-off ${wo.write_off_number}: ${assetLabel} (${wo.reason})`,
        vendor_or_payee: null,
        amount_local: amountLocal,
        currency_code: currency,
        exchange_rate_used: rate,
        amount_usd: Math.round(amountUsd * 100) / 100,
        expense_type: 'one_time',
        source_type: 'write_off',
        write_off_id: wo.id,
        recurrence_group_id: null,
        notes: `Backfilled from write-off ${wo.write_off_number}. Qty: ${wo.quantity}, reason: ${wo.reason}`,
        created_by: wo.created_by,
        created_at: new Date(),
        updated_at: new Date()
      };
    });

    await queryInterface.bulkInsert('expenses', expenses);
    console.log(`Backfilled ${expenses.length} expense entries from write-offs.`);
  },

  async down(queryInterface) {
    // Remove all backfilled write-off expenses
    await queryInterface.sequelize.query(
      `DELETE FROM expenses WHERE source_type = 'write_off' AND notes LIKE 'Backfilled from write-off%'`
    );
  }
};
