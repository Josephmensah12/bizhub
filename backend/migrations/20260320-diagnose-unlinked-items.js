'use strict';

/**
 * Diagnostic: identify the 66 "unlinked" invoice items (asset_id is NULL or asset deleted)
 */
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT
        ii.id as item_id,
        ii.invoice_id,
        ii.asset_id,
        ii.description,
        ii.quantity,
        ii.unit_price_amount,
        ii.line_total_amount,
        i.invoice_number,
        i.invoice_date,
        i.status as invoice_status,
        a.asset_tag,
        a.make,
        a.model,
        a.deleted_at as asset_deleted_at
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN assets a ON ii.asset_id = a.id
      WHERE i.status IN ('PAID', 'PARTIALLY_PAID')
        AND i.is_deleted = false
        AND ii.voided_at IS NULL
        AND (ii.asset_id IS NULL OR a.id IS NULL OR a.deleted_at IS NOT NULL)
      ORDER BY i.invoice_date DESC
      LIMIT 80
    `);

    console.log(`=== ${rows.length} unlinked invoice items ===`);
    for (const r of rows) {
      const reason = !r.asset_id ? 'NULL asset_id' : !r.asset_tag ? 'asset not found' : 'asset deleted';
      console.log(`  ${r.invoice_number} (${r.invoice_date}) | item#${r.item_id} | asset_id=${r.asset_id} | ${reason} | desc="${(r.description || '').substring(0, 60)}" | qty=${r.quantity} total=${r.line_total_amount}`);
    }

    // Count by reason
    const [summary] = await queryInterface.sequelize.query(`
      SELECT
        CASE
          WHEN ii.asset_id IS NULL THEN 'NULL asset_id'
          WHEN a.id IS NULL THEN 'asset record missing'
          WHEN a.deleted_at IS NOT NULL THEN 'asset soft-deleted'
          ELSE 'other'
        END as reason,
        COUNT(*) as cnt,
        COALESCE(SUM(ii.line_total_amount), 0) as total_value
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN assets a ON ii.asset_id = a.id
      WHERE i.status IN ('PAID', 'PARTIALLY_PAID')
        AND i.is_deleted = false
        AND ii.voided_at IS NULL
        AND (ii.asset_id IS NULL OR a.id IS NULL OR a.deleted_at IS NOT NULL)
      GROUP BY 1
    `);
    console.log('=== Summary by reason ===');
    for (const s of summary) {
      console.log(`  ${s.reason}: ${s.cnt} items, value=${s.total_value}`);
    }
  },

  async down() {}
};
