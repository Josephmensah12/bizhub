/**
 * Fix Invoice Discounts
 * 
 * Reads the SalesBinder CSV export and applies discount data to Bizhub invoices.
 * 
 * The CSV has "Discount" rows with negative amounts per invoice.
 * The "Grand Total" column shows the actual amount paid after discount.
 * 
 * Usage: node scripts/fix-invoice-discounts.js
 */

const fs = require('fs');
const path = require('path');
const { sequelize, Invoice, InvoiceItem } = require('../models');

// Simple CSV parser (handles quoted fields with commas)
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.length > 0 || lines.length > 0) {
        lines.push(current);
        current = '';
      }
      if (lines.length > 0) {
        yield lines.splice(0);
      }
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.length > 0 || lines.length > 0) {
    lines.push(current);
    yield lines.splice(0);
  }
}

function* parseCSVGenerator(text) {
  // Split respecting quoted fields
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
      row.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      row.push(field);
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
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCSVRows(text) {
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

async function main() {
  const csvPath = path.join(__dirname, 'invoices-export.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV file not found at:', csvPath);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSVRows(csvText);
  
  if (rows.length < 2) {
    console.error('❌ CSV appears empty');
    process.exit(1);
  }

  // Parse header
  const header = rows[0];
  const colIdx = {};
  header.forEach((h, i) => { colIdx[h] = i; });

  console.log('📋 CSV columns:', header.join(', '));
  
  // Group rows by invoice number
  const invoiceMap = new Map(); // invoiceNumber -> { items: [], discountRows: [], grandTotal, discountPercent }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) continue;

    const invoiceNum = row[colIdx['Invoice Number']];
    const itemName = row[colIdx['Item Name']];
    const unitCost = parseFloat(row[colIdx['Unit Cost']]) || 0;
    const unitPrice = parseFloat(row[colIdx['Unit Price']]) || 0;
    const totalAmount = parseFloat(row[colIdx['Total Amount']]) || 0;
    const discountPct = row[colIdx['Discounted %']]; // e.g. "30%"
    const grandTotal = parseFloat(row[colIdx['Grand Total']]) || 0;
    const quantity = parseInt(row[colIdx['Quantity']]) || 1;
    const sku = row[colIdx['Item SKU']] || '';

    if (!invoiceMap.has(invoiceNum)) {
      invoiceMap.set(invoiceNum, {
        items: [],
        discountRows: [],
        grandTotal: grandTotal,
        discountPercent: parseFloat(discountPct) || 0
      });
    }

    const inv = invoiceMap.get(invoiceNum);
    inv.grandTotal = grandTotal; // same for all rows in invoice

    if (itemName === 'Discount') {
      inv.discountRows.push({ unitCost, totalAmount }); // totalAmount is negative
    } else {
      inv.items.push({ itemName, sku, unitCost, unitPrice, totalAmount, quantity });
    }
  }

  console.log(`\n📊 Found ${invoiceMap.size} invoices in CSV\n`);

  // Connect to DB
  await sequelize.authenticate();
  console.log('✅ Database connected\n');

  // Add discount columns if they don't exist
  const qi = sequelize.getQueryInterface();
  const tableDesc = await qi.describeTable('invoices');
  
  if (!tableDesc.discount_percent) {
    console.log('➕ Adding discount_percent column to invoices...');
    await qi.addColumn('invoices', 'discount_percent', {
      type: sequelize.constructor.DECIMAL(8, 4),
      allowNull: true,
      defaultValue: 0
    });
  }
  if (!tableDesc.discount_amount) {
    console.log('➕ Adding discount_amount column to invoices...');
    await qi.addColumn('invoices', 'discount_amount', {
      type: sequelize.constructor.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: 0
    });
  }

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const [invoiceNum, csvData] of invoiceMap) {
    const t = await sequelize.transaction();
    try {
      // Find invoice by number - try with and without INV- prefix
      let invoice = await Invoice.findOne({ 
        where: { invoice_number: invoiceNum },
        transaction: t 
      });
      if (!invoice) {
        invoice = await Invoice.findOne({ 
          where: { invoice_number: `INV-${invoiceNum}` },
          transaction: t 
        });
      }
      if (!invoice) {
        // Try matching by SalesBinder reference number
        invoice = await Invoice.findOne({
          where: { 
            [sequelize.constructor.Op.or]: [
              { invoice_number: invoiceNum },
              { invoice_number: `INV-${invoiceNum}` },
              sequelize.where(
                sequelize.fn('REPLACE', sequelize.col('invoice_number'), 'INV-', ''),
                invoiceNum
              )
            ]
          },
          transaction: t
        });
      }

      if (!invoice) {
        console.log(`⚠️  Invoice ${invoiceNum} not found in database`);
        notFound++;
        await t.rollback();
        continue;
      }

      const discountPct = csvData.discountPercent;
      const grandTotal = csvData.grandTotal;
      const totalDiscount = csvData.discountRows.reduce((sum, d) => sum + Math.abs(d.totalAmount), 0);
      
      // Calculate the subtotal (sum of item prices before discount)
      const subtotalFromCSV = csvData.items.reduce((sum, item) => sum + item.totalAmount, 0);
      
      // The actual discount ratio
      const discountRatio = subtotalFromCSV > 0 ? grandTotal / subtotalFromCSV : 1;

      console.log(`📝 Invoice ${invoiceNum}: subtotal=${subtotalFromCSV} → grandTotal=${grandTotal} (${discountPct}% off, ratio=${discountRatio.toFixed(4)})`);

      // Update each invoice item - apply discount proportionally
      const invoiceItems = await InvoiceItem.findAll({ 
        where: { invoice_id: invoice.id },
        transaction: t 
      });

      // Delete any "Discount" line items that may have been imported
      for (const item of invoiceItems) {
        if (item.description === 'Discount' || item.unit_price_amount < 0) {
          console.log(`   🗑️  Removing discount line item from invoice ${invoiceNum}`);
          await item.destroy({ transaction: t });
        }
      }

      // Get remaining real items
      const realItems = invoiceItems.filter(item => 
        item.description !== 'Discount' && item.unit_price_amount >= 0
      );

      let newTotalAmount = 0;
      let newTotalCost = 0;
      let newTotalProfit = 0;

      for (const item of realItems) {
        const discountedUnitPrice = parseFloat((item.unit_price_amount * discountRatio).toFixed(2));
        const discountedLineTotal = parseFloat((discountedUnitPrice * item.quantity).toFixed(2));
        const lineCost = parseFloat(item.line_cost_amount) || 0;
        const lineProfit = parseFloat((discountedLineTotal - lineCost).toFixed(2));

        await item.update({
          unit_price_amount: discountedUnitPrice,
          line_total_amount: discountedLineTotal,
          line_profit_amount: lineProfit
        }, { transaction: t });

        newTotalAmount += discountedLineTotal;
        newTotalCost += lineCost;
        newTotalProfit += lineProfit;
      }

      // Update invoice totals
      const marginPct = newTotalAmount > 0 ? (newTotalProfit / newTotalAmount * 100) : 0;
      
      await invoice.update({
        subtotal_amount: subtotalFromCSV,
        total_amount: parseFloat(newTotalAmount.toFixed(2)),
        total_profit_amount: parseFloat(newTotalProfit.toFixed(2)),
        margin_percent: parseFloat(marginPct.toFixed(4)),
        discount_percent: discountPct,
        discount_amount: totalDiscount,
        amount_paid: parseFloat(newTotalAmount.toFixed(2)),
        balance_due: 0
      }, { transaction: t });

      await t.commit();
      updated++;
      console.log(`   ✅ Updated: total=${newTotalAmount.toFixed(2)}, cost=${newTotalCost.toFixed(2)}, profit=${newTotalProfit.toFixed(2)}, margin=${marginPct.toFixed(1)}%`);

    } catch (err) {
      await t.rollback();
      console.error(`   ❌ Error on invoice ${invoiceNum}:`, err.message);
      errors++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Updated: ${updated}`);
  console.log(`⚠️  Not found: ${notFound}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`${'='.repeat(50)}\n`);

  await sequelize.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
