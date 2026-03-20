'use strict';

/**
 * Diagnostic migration: check if invoice balance_due/status matches actual payments.
 * Fixes any discrepancies by recalculating from payment transactions.
 */
module.exports = {
  async up(queryInterface) {
    // Find invoices where balance_due doesn't match total_amount - sum(payments)
    const [mismatches] = await queryInterface.sequelize.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.total_amount,
        i.amount_paid,
        i.balance_due,
        COALESCE(pay.net_paid, 0) as actual_net_paid,
        i.total_amount - COALESCE(pay.net_paid, 0) as actual_balance_due
      FROM invoices i
      LEFT JOIN (
        SELECT
          invoice_id,
          SUM(CASE WHEN transaction_type = 'PAYMENT' THEN amount ELSE 0 END) -
          SUM(CASE WHEN transaction_type = 'REFUND' THEN amount ELSE 0 END) as net_paid
        FROM invoice_payments
        WHERE voided_at IS NULL
        GROUP BY invoice_id
      ) pay ON pay.invoice_id = i.id
      WHERE i.is_deleted = false
        AND i.status != 'CANCELLED'
        AND (
          ABS(i.amount_paid - COALESCE(pay.net_paid, 0)) > 0.01
          OR ABS(i.balance_due - (i.total_amount - COALESCE(pay.net_paid, 0))) > 0.01
        )
      ORDER BY i.invoice_date DESC
    `);

    console.log(`=== Found ${mismatches.length} invoices with payment mismatches ===`);
    for (const m of mismatches) {
      console.log(`  ${m.invoice_number}: status=${m.status} total=${m.total_amount} stored_paid=${m.amount_paid} actual_paid=${m.actual_net_paid} stored_balance=${m.balance_due} actual_balance=${m.actual_balance_due}`);
    }

    if (mismatches.length === 0) {
      console.log('All invoice balances are correct.');
      return;
    }

    // Fix the mismatches
    console.log('Fixing mismatched invoices...');
    for (const m of mismatches) {
      const netPaid = parseFloat(m.actual_net_paid) || 0;
      const totalAmount = parseFloat(m.total_amount) || 0;
      const balanceDue = Math.max(0, totalAmount - netPaid);

      let newStatus = m.status;
      if (m.status !== 'CANCELLED') {
        if (netPaid <= 0) newStatus = 'UNPAID';
        else if (netPaid >= totalAmount) newStatus = 'PAID';
        else newStatus = 'PARTIALLY_PAID';
      }

      await queryInterface.sequelize.query(`
        UPDATE invoices
        SET amount_paid = :netPaid,
            balance_due = :balanceDue,
            status = :newStatus
        WHERE id = :id
      `, {
        replacements: { netPaid, balanceDue, newStatus, id: m.id }
      });

      console.log(`  Fixed ${m.invoice_number}: amount_paid=${netPaid} balance_due=${balanceDue} status=${newStatus}`);
    }

    console.log(`Fixed ${mismatches.length} invoices.`);
  },

  async down() {}
};
