/**
 * Fix Invoice Discounts
 *
 * Reads the SalesBinder CSV export and applies discount data to Bizhub invoices.
 *
 * The CSV has product line items and "Discount" rows (negative amounts) per invoice.
 * "Grand Total" shows the actual amount charged after discount.
 * "Discounted %" shows the invoice-level discount percentage.
 *
 * This script:
 *  1. Matches invoices via salesbinder_invoice_number
 *  2. Removes any "Discount" line items that were imported
 *  3. Applies discount % proportionally to each item's unit_price
 *  4. Updates invoice totals to match the CSV Grand Total
 *  5. Stores discount_percent and discount_amount on the invoice
 *  6. Fixes balance_due = total_amount - amount_paid
 *
 * Usage: node scripts/fix-invoice-discounts.js
 */

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

function info(...args) { console.log('[INFO]', ...args); }
function warn(...args) { console.log('[WARN]', ...args); }

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      row.push(field.trim());
      field = '';
      if (row.length > 1 || row[0] !== '') {
        rows.push(row);
      }
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
  }
  if (field || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  // Try the committed CSV first, fall back to Downloads
  let csvPath = path.join(__dirname, 'invoices-export.csv');
  if (!fs.existsSync(csvPath)) {
    csvPath = path.resolve('C:/Users/GALAXY BOOK3 PRO/Downloads/invoice-line_items (7).csv');
  }
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found');
    process.exit(1);
  }

  info('Reading CSV:', csvPath);
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);

  if (rows.length < 2) {
    console.error('CSV appears empty');
    process.exit(1);
  }

  // Parse header → column index map
  const header = rows[0];
  const col = {};
  header.forEach((h, i) => { col[h] = i; });
  info('Columns:', header.join(', '));

  // Group by Invoice Number
  const invoiceMap = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 5) continue;

    const invNum = r[col['Invoice Number']];
    const itemName = r[col['Item Name']];
    const unitPrice = parseFloat(r[col['Unit Price']]) || 0;
    const totalAmount = parseFloat(r[col['Total Amount']]) || 0;
    const discountPctStr = r[col['Discounted %']] || '0%';
    const grandTotal = parseFloat(r[col['Grand Total']]) || 0;

    if (!invoiceMap.has(invNum)) {
      invoiceMap.set(invNum, {
        items: [],
        discountRows: [],
        grandTotal,
        discountPercent: parseFloat(discountPctStr) || 0
      });
    }

    const inv = invoiceMap.get(invNum);
    inv.grandTotal = grandTotal;

    if (itemName === 'Discount') {
      inv.discountRows.push({ totalAmount }); // negative
    } else {
      inv.items.push({ itemName, unitPrice, totalAmount });
    }
  }

  info(`Found ${invoiceMap.size} invoices in CSV\n`);

  // Ensure discount columns exist
  const qi = sequelize.getQueryInterface();
  const tableDesc = await qi.describeTable('invoices');

  if (!tableDesc.discount_percent) {
    info('Adding discount_percent column...');
    await qi.addColumn('invoices', 'discount_percent', {
      type: sequelize.constructor.DECIMAL(5, 2),
      allowNull: true, defaultValue: null
    });
  }
  if (!tableDesc.discount_amount) {
    info('Adding discount_amount column...');
    await qi.addColumn('invoices', 'discount_amount', {
      type: sequelize.constructor.DECIMAL(12, 2),
      allowNull: true, defaultValue: null
    });
  }

  // Fetch all SalesBinder-imported invoices
  const dbInvoices = await sequelize.query(`
    SELECT id, invoice_number, salesbinder_invoice_number,
           total_amount, total_cost_amount, amount_paid, status
    FROM invoices
    WHERE salesbinder_invoice_number IS NOT NULL AND is_deleted = false
  `, { type: QueryTypes.SELECT });

  // Build lookup: salesbinder_invoice_number → db invoice
  const dbLookup = {};
  for (const inv of dbInvoices) {
    dbLookup[inv.salesbinder_invoice_number] = inv;
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let errors = 0;

  for (const [sbNum, csvData] of invoiceMap) {
    const dbInv = dbLookup[sbNum];
    if (!dbInv) {
      warn(`SB #${sbNum}: not found in DB`);
      notFound++;
      continue;
    }

    const t = await sequelize.transaction();
    try {
      const discountPct = csvData.discountPercent;
      const grandTotal = csvData.grandTotal;
      const discountAmt = csvData.discountRows.reduce(
        (sum, d) => sum + Math.abs(d.totalAmount), 0
      );

      // Undiscounted subtotal from CSV product rows
      const csvSubtotal = csvData.items.reduce((sum, item) => sum + item.totalAmount, 0);

      // Discount ratio (how much of the original price to keep)
      const ratio = csvSubtotal > 0 ? grandTotal / csvSubtotal : 1;

      // 1. Remove any "Discount" line items from DB
      const deleted = await sequelize.query(`
        DELETE FROM invoice_items
        WHERE invoice_id = :invId
          AND (LOWER(description) = 'discount' OR unit_price_amount < 0)
        RETURNING id
      `, { replacements: { invId: dbInv.id }, transaction: t, type: QueryTypes.SELECT });

      if (deleted.length > 0) {
        info(`  SB #${sbNum}: removed ${deleted.length} Discount line item(s)`);
      }

      // 2. Get real line items
      const items = await sequelize.query(`
        SELECT id, unit_price_amount, quantity, unit_cost_amount
        FROM invoice_items
        WHERE invoice_id = :invId AND voided_at IS NULL
        ORDER BY created_at
      `, { replacements: { invId: dbInv.id }, transaction: t, type: QueryTypes.SELECT });

      // 3. Apply discount to each item
      let newSubtotal = 0;
      let totalCost = 0;

      for (const item of items) {
        const origPrice = parseFloat(item.unit_price_amount);
        const qty = parseInt(item.quantity);
        const unitCost = parseFloat(item.unit_cost_amount);

        const newUnitPrice = round2(origPrice * ratio);
        const newLineTotal = round2(newUnitPrice * qty);
        const lineCost = round2(unitCost * qty);
        const lineProfit = round2(newLineTotal - lineCost);

        await sequelize.query(`
          UPDATE invoice_items
          SET unit_price_amount = :price,
              line_total_amount = :lineTotal,
              line_profit_amount = :lineProfit,
              updated_at = NOW()
          WHERE id = :id
        `, {
          replacements: {
            price: newUnitPrice, lineTotal: newLineTotal,
            lineProfit: lineProfit, id: item.id
          },
          transaction: t
        });

        newSubtotal += newLineTotal;
        totalCost += lineCost;
      }

      newSubtotal = round2(newSubtotal);
      totalCost = round2(totalCost);

      // 4. Update invoice — use Grand Total as authoritative total_amount
      //    Keep amount_paid as-is (already correct from migration)
      const totalAmount = grandTotal;
      const totalProfit = round2(totalAmount - totalCost);
      const marginPct = totalAmount > 0
        ? round2((totalProfit / totalAmount) * 100)
        : null;

      const amountPaid = parseFloat(dbInv.amount_paid) || 0;
      const balanceDue = round2(totalAmount - amountPaid);

      await sequelize.query(`
        UPDATE invoices
        SET subtotal_amount = :subtotal,
            total_amount = :totalAmount,
            total_cost_amount = :totalCost,
            total_profit_amount = :totalProfit,
            margin_percent = :marginPct,
            balance_due = :balanceDue,
            discount_percent = :discPct,
            discount_amount = :discAmt,
            updated_at = NOW()
        WHERE id = :id
      `, {
        replacements: {
          subtotal: newSubtotal,
          totalAmount, totalCost, totalProfit, marginPct,
          balanceDue,
          discPct: discountPct > 0 ? discountPct : null,
          discAmt: discountAmt > 0 ? discountAmt : null,
          id: dbInv.id
        },
        transaction: t
      });

      await t.commit();
      updated++;

      const origTotal = parseFloat(dbInv.total_amount);
      const label = discountPct > 0 ? `${discountPct}% off` : 'no discount';
      info(`  SB #${sbNum} (${dbInv.invoice_number}): ${label}, total ${origTotal} -> ${totalAmount}, balance ${balanceDue}, ${items.length} items`);

    } catch (err) {
      await t.rollback();
      warn(`  SB #${sbNum}: ERROR - ${err.message}`);
      errors++;
    }
  }

  // Report CSV invoices not in DB
  const csvNums = [...invoiceMap.keys()];
  const missing = csvNums.filter(n => !dbLookup[n]);
  if (missing.length > 0 && missing.length !== notFound) {
    warn(`CSV invoices not in DB: ${missing.join(', ')}`);
  }

  info('');
  info(`Done. Updated: ${updated}, Skipped: ${skipped}, Not found: ${notFound}, Errors: ${errors}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });
