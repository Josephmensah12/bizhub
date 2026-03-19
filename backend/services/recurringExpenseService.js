/**
 * Recurring Expense Service
 *
 * Generates monthly expense entries from active recurring expense templates.
 * Preserves the historical FX basis from the original setup.
 */

const { RecurringExpense, Expense, ExpenseCategory, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Generate expense entries for all active recurring expenses up to the target period.
 * @param {string} targetPeriod - YYYY-MM format (defaults to current month)
 * @returns {Object} { generated: number, errors: string[] }
 */
async function generateRecurringExpenses(targetPeriod = null) {
  if (!targetPeriod) {
    const now = new Date();
    targetPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const [targetYear, targetMonth] = targetPeriod.split('-').map(Number);

  const activeRecurrences = await RecurringExpense.findAll({
    where: {
      is_active: true,
      auto_post_enabled: true,
      start_date: { [Op.lte]: `${targetPeriod}-28` } // started before end of target month
    },
    include: [{ model: ExpenseCategory, as: 'category' }]
  });

  let generated = 0;
  const errors = [];

  for (const rec of activeRecurrences) {
    try {
      // Determine which periods need generation
      const startDate = new Date(rec.start_date);
      const startPeriod = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

      // If end_date is set and target is past it, skip
      if (rec.end_date) {
        const endDate = new Date(rec.end_date);
        const endPeriod = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
        if (targetPeriod > endPeriod) continue;
      }

      // Start from the later of: start_period or last_generated_period + 1
      let genYear, genMonth;
      if (rec.last_generated_period) {
        const [ly, lm] = rec.last_generated_period.split('-').map(Number);
        genMonth = lm + 1;
        genYear = ly;
        if (genMonth > 12) { genMonth = 1; genYear++; }
      } else {
        genYear = startDate.getFullYear();
        genMonth = startDate.getMonth() + 1;
      }

      // Generate expenses for each missing month up to targetPeriod
      while (genYear < targetYear || (genYear === targetYear && genMonth <= targetMonth)) {
        const period = `${genYear}-${String(genMonth).padStart(2, '0')}`;

        // Check end_date
        if (rec.end_date) {
          const endDate = new Date(rec.end_date);
          const endPeriod = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
          if (period > endPeriod) break;
        }

        // Check if already generated (idempotency)
        const existing = await Expense.findOne({
          where: {
            recurrence_group_id: rec.id,
            recognition_period: period
          }
        });

        if (!existing) {
          // Use the 1st of the month as expense_date for recurring entries
          const expenseDate = `${period}-01`;

          await Expense.create({
            expense_date: expenseDate,
            recognition_period: period,
            category_id: rec.category_id,
            description: rec.description,
            vendor_or_payee: rec.vendor_or_payee,
            amount_local: rec.amount_local,
            currency_code: rec.currency_code,
            exchange_rate_used: rec.exchange_rate_used,
            amount_usd: rec.amount_usd,
            expense_type: 'fixed_recurring',
            source_type: 'auto_generated_recurring',
            recurrence_group_id: rec.id,
            notes: `Auto-generated from recurring expense #${rec.id}`,
            created_by: rec.created_by
          });

          generated++;
        }

        // Advance to next month
        genMonth++;
        if (genMonth > 12) { genMonth = 1; genYear++; }
      }

      // Update last_generated_period
      await rec.update({ last_generated_period: targetPeriod });

    } catch (err) {
      errors.push(`Recurring #${rec.id}: ${err.message}`);
    }
  }

  return { generated, errors };
}

module.exports = { generateRecurringExpenses };
