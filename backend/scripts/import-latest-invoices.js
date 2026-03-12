/**
 * Incremental SalesBinder → BizHub Invoice + Payment Import
 *
 * Fetches invoices with document_number > last imported, imports them with
 * line items, customers, and real payment transactions.
 *
 * Usage:
 *   node scripts/import-latest-invoices.js              # dry run
 *   node scripts/import-latest-invoices.js --execute     # insert into database
 */

require('dotenv').config();
const https = require('https');
const crypto = require('crypto');
const { Sequelize } = require('sequelize');

const API_HOST = 'entech.salesbinder.com';
const API_KEY = '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ';
const AUTH = Buffer.from(`${API_KEY}:x`).toString('base64');
const RATE_DELAY = 1600;

const mode = process.argv[2] || '--dry-run';
const isDryRun = mode !== '--execute';

const seq = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.DATABASE_URL?.includes('railway')
      ? { require: true, rejectUnauthorized: false }
      : undefined
  }
});

// ---------- Status Mapping ----------
const STATUS_MAP = {
  'paid in full': 'PAID',
  'open':         'UNPAID',
  'unpaid':       'UNPAID',
  'draft':        'UNPAID',
  'sent':         'UNPAID',
  'viewed':       'UNPAID',
  'partial':      'PARTIALLY_PAID',
  'partially paid': 'PARTIALLY_PAID',
  'overdue':      'UNPAID',
  'cancelled':    'CANCELLED',
  'void':         'CANCELLED',
  'closed':       'PAID',
};

function mapStatus(sbStatus) {
  const name = (sbStatus?.name || '').toLowerCase().trim();
  return STATUS_MAP[name] || 'UNPAID';
}

// ---------- Payment method inference ----------
function inferPaymentMethod(reference) {
  if (!reference) return 'Cash';
  const ref = reference.toLowerCase();
  if (ref.includes('momo') || ref.includes('mobile money') || ref.includes('mtn')) return 'MoMo';
  if (ref.includes('card') || ref.includes('visa') || ref.includes('mastercard')) return 'Card';
  if (ref.includes('ach') || ref.includes('bank') || ref.includes('transfer') || ref.includes('wire')) return 'ACH';
  if (ref.includes('cheque') || ref.includes('check')) return 'Other';
  return 'Cash';
}

// ---------- API Helpers ----------
function fetchJSON(path, retries = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `/api/2.0${path}`,
      method: 'GET',
      headers: { 'Authorization': `Basic ${AUTH}`, 'Accept': 'application/json' },
      timeout: 15000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        if (res.statusCode === 429 && retries > 0) {
          console.log(`  Rate limited. Waiting 10s (${retries} retries left)...`);
          await new Promise(r => setTimeout(r, 10000));
          try { resolve(await fetchJSON(path, retries - 1)); } catch (e) { reject(e); }
          return;
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${d.substring(0, 200)}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllInvoicePages() {
  const allDocs = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    process.stdout.write(`  Fetching page ${page}/${totalPages}...\r`);
    const response = await fetchJSON(`/documents.json?contextId=5&limit=100&page=${page}`);
    totalPages = parseInt(response.pages);
    if (page === 1) console.log(`  SalesBinder total: ${response.count} invoices, ${totalPages} pages`);
    allDocs.push(...response.documents.flat());
    page++;
    if (page <= totalPages) await new Promise(r => setTimeout(r, RATE_DELAY));
  }
  return allDocs;
}

// ---------- Customer Handling ----------
async function ensureCustomer(sbCustomerId, customerName, customerLookup) {
  // Already mapped?
  if (customerLookup.has(sbCustomerId)) return customerLookup.get(sbCustomerId);

  // Try to find by name
  const safeName = customerName.replace(/'/g, "''").trim();
  const [byName] = await seq.query(
    `SELECT id FROM customers WHERE LOWER(TRIM(first_name || ' ' || COALESCE(last_name, ''))) = LOWER($1) LIMIT 1`,
    { bind: [safeName] }
  );
  if (byName.length > 0) {
    customerLookup.set(sbCustomerId, byName[0].id);
    return byName[0].id;
  }

  // Create new customer
  const parts = customerName.trim().split(/\s+/);
  const firstName = parts[0] || 'Unknown';
  const lastName = parts.slice(1).join(' ') || '';
  const newId = await seq.query(
    `INSERT INTO customers (first_name, last_name, salesbinder_id, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
    { bind: [firstName, lastName, sbCustomerId] }
  );
  const customerId = newId[0][0].id;
  customerLookup.set(sbCustomerId, customerId);
  console.log(`  Created customer: ${firstName} ${lastName} (id: ${customerId})`);
  return customerId;
}

// ---------- Mapping ----------
function mapInvoice(sb, customerId) {
  const status = mapStatus(sb.status);
  const totalAmount = parseFloat(sb.total_price) || 0;
  const totalCost = parseFloat(sb.total_cost) || 0;
  const amountPaid = parseFloat(sb.total_transactions) || 0;
  const balanceDue = Math.max(0, totalAmount - amountPaid);
  const profit = totalAmount - totalCost;
  const margin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;
  const invoiceNumber = `SB-${String(sb.document_number).padStart(6, '0')}`;

  return {
    id: crypto.randomUUID(),
    invoice_number: invoiceNumber,
    customer_id: customerId,
    invoice_date: sb.issue_date ? sb.issue_date.split('T')[0] : new Date().toISOString().split('T')[0],
    status,
    currency: 'GHS',
    subtotal_amount: totalAmount,
    total_amount: totalAmount,
    total_cost_amount: totalCost,
    total_profit_amount: profit,
    margin_percent: margin,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    discount_type: 'none',
    discount_value: 0,
    discount_amount: 0,
    notes: sb.public_note || null,
    source: 'in_store',
    created_by: 1,
    updated_by: 1,
    created_at: sb.created || new Date().toISOString(),
    updated_at: sb.modified || new Date().toISOString(),
    salesbinder_id: sb.id,
    salesbinder_invoice_number: String(sb.document_number),
  };
}

function mapInvoiceItem(sbItem, invoiceId, assetId, assetUnitId) {
  const qty = parseInt(sbItem.quantity) || 1;
  const price = parseFloat(sbItem.price) || 0;
  const cost = parseFloat(sbItem.cost) || 0;
  const discountPct = parseFloat(sbItem.discount_percent) || 0;
  const discountAmt = discountPct > 0 ? (price * qty * discountPct / 100) : 0;
  const lineTotal = (price * qty) - discountAmt;
  const lineCost = cost * qty;

  return {
    id: crypto.randomUUID(),
    invoice_id: invoiceId,
    asset_id: assetId || null,
    asset_unit_id: assetUnitId || null,
    description: [sbItem.item?.name, sbItem.description].filter(Boolean).join(' - ').substring(0, 500) || sbItem.name || 'Imported item',
    quantity: qty,
    unit_price_amount: price,
    unit_cost_amount: cost,
    pre_discount_total: price * qty,
    discount_type: discountPct > 0 ? 'percentage' : 'none',
    discount_value: discountPct,
    discount_amount: discountAmt,
    line_total_amount: lineTotal,
    line_cost_amount: lineCost,
    line_profit_amount: lineTotal - lineCost,
    quantity_returned_total: 0,
    created_at: sbItem.created || new Date().toISOString(),
    updated_at: sbItem.modified || new Date().toISOString()
  };
}

// ---------- Asset Matching ----------
// Builds lookup: SalesBinder item UUID → { assetId, isSerialized, model }
async function buildAssetLookup() {
  const [rows] = await seq.query(
    `SELECT id, salesbinder_id, model, is_serialized FROM assets
     WHERE salesbinder_id IS NOT NULL AND deleted_at IS NULL`
  );
  const map = new Map();
  for (const r of rows) {
    map.set(r.salesbinder_id, { assetId: r.id, isSerialized: r.is_serialized, model: r.model });
  }
  return map;
}

// For serialized assets, find an Available unit and return its id
async function findAvailableUnit(assetId, transaction) {
  const [rows] = await seq.query(
    `SELECT id FROM asset_units WHERE asset_id = $1 AND status = 'Available' ORDER BY id LIMIT 1`,
    { bind: [assetId], transaction }
  );
  return rows.length > 0 ? rows[0].id : null;
}

// Reserve a unit (set status = Reserved)
async function reserveUnit(unitId, transaction) {
  await seq.query(
    `UPDATE asset_units SET status = 'Reserved', updated_at = NOW() WHERE id = $1`,
    { bind: [unitId], transaction }
  );
}

// Mark a unit as Sold (for PAID invoices)
async function markUnitSold(unitId, invoiceItemId, transaction) {
  await seq.query(
    `UPDATE asset_units SET status = 'Sold', sold_date = NOW(), invoice_item_id = $2, updated_at = NOW() WHERE id = $1`,
    { bind: [unitId, invoiceItemId], transaction }
  );
}

// Update asset computed status based on invoice_items
async function updateAssetStatus(assetId, transaction) {
  // Check PAID invoices
  const [[paid]] = await seq.query(
    `SELECT COUNT(*) AS cnt FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
     WHERE ii.asset_id = $1 AND i.status = 'PAID' AND ii.voided_at IS NULL AND ii.quantity > ii.quantity_returned_total`,
    { bind: [assetId], transaction }
  );
  if (parseInt(paid.cnt) > 0) {
    await seq.query(`UPDATE assets SET status = 'Sold', updated_at = NOW() WHERE id = $1`, { bind: [assetId], transaction });
    return;
  }
  // Check active invoices
  const [[active]] = await seq.query(
    `SELECT COUNT(*) AS cnt FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
     WHERE ii.asset_id = $1 AND i.status NOT IN ('CANCELLED','PAID') AND ii.voided_at IS NULL`,
    { bind: [assetId], transaction }
  );
  if (parseInt(active.cnt) > 0) {
    await seq.query(`UPDATE assets SET status = 'Processing', updated_at = NOW() WHERE id = $1`, { bind: [assetId], transaction });
    return;
  }
  await seq.query(`UPDATE assets SET status = 'In Stock', updated_at = NOW() WHERE id = $1`, { bind: [assetId], transaction });
}

// ---------- Main ----------
async function run() {
  console.log(isDryRun
    ? '=== DRY RUN — no data will be inserted ==='
    : '=== EXECUTING INCREMENTAL IMPORT ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Step 1: Get last imported invoice number
  const [[maxRow]] = await seq.query(
    "SELECT MAX(CAST(salesbinder_invoice_number AS INTEGER)) as max_num FROM invoices WHERE salesbinder_invoice_number IS NOT NULL"
  );
  const lastImported = maxRow.max_num || 0;
  console.log(`Last imported SalesBinder invoice: #${lastImported}\n`);

  // Step 2: Build customer + asset lookups
  console.log('Building lookups...');
  const [customers] = await seq.query(
    'SELECT id, salesbinder_id FROM customers WHERE salesbinder_id IS NOT NULL'
  );
  const customerLookup = new Map(customers.map(c => [c.salesbinder_id, c.id]));
  const assetLookup = await buildAssetLookup();
  console.log(`  ${customerLookup.size} customers, ${assetLookup.size} assets with SalesBinder IDs\n`);

  // Step 3: Check existing salesbinder_ids to avoid duplicates
  const [existing] = await seq.query(
    'SELECT salesbinder_id FROM invoices WHERE salesbinder_id IS NOT NULL'
  );
  const existingIds = new Set(existing.map(r => r.salesbinder_id));

  // Step 4: Fetch invoices from SalesBinder
  console.log('Fetching invoices from SalesBinder API...');
  const allDocs = await fetchAllInvoicePages();

  // Filter to new invoices only
  const newDocs = allDocs.filter(d => {
    const num = parseInt(d.document_number);
    return num > lastImported && !existingIds.has(d.id);
  });

  console.log(`\nFound ${newDocs.length} new invoices (doc# > ${lastImported})\n`);

  if (newDocs.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // Step 5: Map and display new invoices
  console.log('New invoices to import:');
  console.log('─'.repeat(100));

  const invoicesToInsert = [];
  const customersCreated = [];

  for (const sb of newDocs.sort((a, b) => parseInt(a.document_number) - parseInt(b.document_number))) {
    const docNum = sb.document_number;
    const status = mapStatus(sb.status);
    const customerName = sb.cache__customer_name || 'Unknown';
    const totalAmount = parseFloat(sb.total_price) || 0;
    const items = (sb.document_items || []).filter(i => i.delete !== 1);

    // Resolve customer
    let customerId = null;
    if (!isDryRun) {
      customerId = await ensureCustomer(sb.customer_id, customerName, customerLookup);
    } else {
      customerId = customerLookup.get(sb.customer_id) || null;
    }

    const mapped = mapInvoice(sb, customerId);

    // Check how many items can be linked to BizHub assets
    const linkable = items.filter(i => i.item_id && assetLookup.has(i.item_id)).length;
    const linkInfo = linkable > 0 ? ` [${linkable}/${items.length} linked]` : '';

    console.log(`  #${docNum} | ${sb.issue_date?.split('T')[0]} | ${status.padEnd(16)} | GHS ${totalAmount.toFixed(2).padStart(12)} | ${customerName} | ${items.length} items${linkInfo}${customerId ? '' : ' [NEW CUSTOMER]'}`);

    invoicesToInsert.push({ mapped, items: sb.document_items || [], sb });
  }

  console.log('─'.repeat(100));
  console.log(`  Total: ${invoicesToInsert.length} invoices\n`);

  if (isDryRun) {
    console.log('Dry run complete. Run with --execute to import.\n');

    // Still fetch payment info for preview
    console.log('Fetching payment transactions for preview...');
    const paidDocs = newDocs.filter(d => {
      const s = mapStatus(d.status);
      return s === 'PAID' || s === 'PARTIALLY_PAID';
    });

    for (const sb of paidDocs) {
      await new Promise(r => setTimeout(r, RATE_DELAY));
      try {
        const docResponse = await fetchJSON(`/documents/${sb.id}.json`);
        const doc = docResponse.document || docResponse;
        const txns = doc.transactions || [];
        if (txns.length > 0) {
          console.log(`  #${sb.document_number} — ${txns.length} transactions:`);
          for (const t of txns) {
            const method = inferPaymentMethod(t.reference);
            console.log(`    ${t.transaction_date?.split('T')[0] || '?'} | ${method} | GHS ${parseFloat(t.amount).toFixed(2)} | ${t.reference || 'no ref'}`);
          }
        }
      } catch (e) {
        console.log(`  #${sb.document_number} — fetch error: ${e.message}`);
      }
    }

    return;
  }

  // Step 6: Insert invoices + line items
  console.log('Inserting invoices...');

  const INVOICE_COLS = [
    'id', 'invoice_number', 'customer_id', 'invoice_date', 'status', 'currency',
    'subtotal_amount', 'total_amount', 'total_cost_amount', 'total_profit_amount',
    'margin_percent', 'amount_paid', 'balance_due', 'discount_type', 'discount_value',
    'discount_amount', 'notes', 'source', 'created_by', 'updated_by',
    'created_at', 'updated_at', 'salesbinder_id', 'salesbinder_invoice_number'
  ];

  const ITEM_COLS = [
    'id', 'invoice_id', 'asset_id', 'asset_unit_id', 'description', 'quantity',
    'unit_price_amount', 'unit_cost_amount', 'pre_discount_total',
    'discount_type', 'discount_value', 'discount_amount',
    'line_total_amount', 'line_cost_amount', 'line_profit_amount',
    'quantity_returned_total', 'created_at', 'updated_at'
  ];

  let insertedInvoices = 0;
  let insertedItems = 0;
  let failedInvoices = 0;

  for (const { mapped, items, sb } of invoicesToInsert) {
    const t = await seq.transaction();
    try {
      // Insert invoice
      const invPlaceholders = INVOICE_COLS.map((_, j) => `$${j + 1}`).join(', ');
      const invValues = INVOICE_COLS.map(col => mapped[col]);
      await seq.query(
        `INSERT INTO invoices (${INVOICE_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${invPlaceholders})`,
        { bind: invValues, transaction: t }
      );

      // Insert line items — match to BizHub assets
      const linkedAssetIds = new Set(); // track assets we need to update status for
      for (const sbItem of items) {
        if (sbItem.delete === 1) continue;

        // Match SB item_id to BizHub asset
        let assetId = null;
        let assetUnitId = null;
        const sbItemId = sbItem.item_id;
        const assetInfo = sbItemId ? assetLookup.get(sbItemId) : null;

        if (assetInfo) {
          assetId = assetInfo.assetId;
          linkedAssetIds.add(assetId);

          // For serialized assets, find and reserve/sell a unit
          if (assetInfo.isSerialized) {
            const unitId = await findAvailableUnit(assetId, t);
            if (unitId) {
              assetUnitId = unitId;
            } else {
              console.log(`    ⚠ No available unit for ${assetInfo.model} (asset ${assetId})`);
            }
          }
        }

        const item = mapInvoiceItem(sbItem, mapped.id, assetId, assetUnitId);
        const itemPlaceholders = ITEM_COLS.map((_, j) => `$${j + 1}`).join(', ');
        const itemValues = ITEM_COLS.map(col => item[col]);
        await seq.query(
          `INSERT INTO invoice_items (${ITEM_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${itemPlaceholders})`,
          { bind: itemValues, transaction: t }
        );

        // Update unit status based on invoice status
        if (assetUnitId) {
          if (mapped.status === 'PAID') {
            await markUnitSold(assetUnitId, item.id, t);
          } else if (mapped.status !== 'CANCELLED') {
            await reserveUnit(assetUnitId, t);
          }
        }

        const linkTag = assetId ? ` → asset:${assetId}${assetUnitId ? ` unit:${assetUnitId}` : ''}` : '';
        if (assetId) console.log(`    Linked: ${sbItem.item?.name || sbItem.name}${linkTag}`);

        insertedItems++;
      }

      // Update asset statuses for all linked assets
      for (const aid of linkedAssetIds) {
        await updateAssetStatus(aid, t);
      }

      await t.commit();
      insertedInvoices++;
      console.log(`  ✓ ${mapped.invoice_number} (${mapped.status})`);
    } catch (e) {
      await t.rollback();
      failedInvoices++;
      console.log(`  ✗ ${mapped.invoice_number}: ${e.message.split('\n')[0]}`);
    }
  }

  console.log(`\nInvoices: ${insertedInvoices} inserted, ${failedInvoices} failed, ${insertedItems} line items\n`);

  // Step 7: Fetch and insert real payment transactions
  console.log('Fetching payment transactions from SalesBinder...');

  const PAYMENT_COLS = [
    'id', 'invoice_id', 'transaction_type', 'payment_date', 'amount',
    'currency', 'payment_method', 'comment', 'salesbinder_transaction_id', 'created_at'
  ];

  let insertedPayments = 0;
  let paymentErrors = 0;

  for (const { mapped, sb } of invoicesToInsert) {
    const amountPaid = parseFloat(sb.total_transactions) || 0;
    if (amountPaid <= 0) continue;

    await new Promise(r => setTimeout(r, RATE_DELAY));

    try {
      const docResponse = await fetchJSON(`/documents/${sb.id}.json`);
      const doc = docResponse.document || docResponse;
      const transactions = doc.transactions || [];

      if (transactions.length === 0) {
        // Create synthetic payment as fallback
        const payId = crypto.randomUUID();
        await seq.query(
          `INSERT INTO invoice_payments (id, invoice_id, transaction_type, payment_date, amount, currency, payment_method, comment, created_at)
           VALUES ($1, $2, 'PAYMENT', $3, $4, 'GHS', 'Cash', $5, NOW())`,
          { bind: [payId, mapped.id, mapped.invoice_date, amountPaid, 'Migrated from SalesBinder'] }
        );
        insertedPayments++;
        console.log(`  ${mapped.invoice_number}: synthetic payment GHS ${amountPaid.toFixed(2)} (no transactions found)`);
        continue;
      }

      // Insert real transactions
      for (const txn of transactions) {
        const amount = parseFloat(txn.amount || 0);
        if (amount === 0) continue;

        const txnDate = txn.transaction_date || txn.created;
        const reference = txn.reference || '';
        const method = inferPaymentMethod(reference);
        const isRefund = amount < 0;

        const payment = {
          id: crypto.randomUUID(),
          invoice_id: mapped.id,
          transaction_type: isRefund ? 'REFUND' : 'PAYMENT',
          payment_date: txnDate ? txnDate.split('T')[0] : mapped.invoice_date,
          amount: Math.abs(amount),
          currency: 'GHS',
          payment_method: method,
          comment: reference || 'Payment from SalesBinder',
          salesbinder_transaction_id: txn.id,
          created_at: new Date().toISOString()
        };

        try {
          const placeholders = PAYMENT_COLS.map((_, j) => `$${j + 1}`).join(', ');
          const values = PAYMENT_COLS.map(col => payment[col]);
          await seq.query(
            `INSERT INTO invoice_payments (${PAYMENT_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
            { bind: values }
          );
          insertedPayments++;
          console.log(`  ${mapped.invoice_number}: ${method} GHS ${Math.abs(amount).toFixed(2)} | ${reference || 'no ref'}`);
        } catch (e) {
          paymentErrors++;
          console.log(`  ${mapped.invoice_number}: payment error — ${e.message.split('\n')[0]}`);
        }
      }
    } catch (e) {
      paymentErrors++;
      console.log(`  ${mapped.invoice_number}: fetch error — ${e.message}`);

      // Fallback: create synthetic payment
      try {
        const payId = crypto.randomUUID();
        await seq.query(
          `INSERT INTO invoice_payments (id, invoice_id, transaction_type, payment_date, amount, currency, payment_method, comment, created_at)
           VALUES ($1, $2, 'PAYMENT', $3, $4, 'GHS', 'Cash', $5, NOW())`,
          { bind: [payId, mapped.id, mapped.invoice_date, amountPaid, 'Migrated from SalesBinder'] }
        );
        insertedPayments++;
        console.log(`  ${mapped.invoice_number}: fallback synthetic GHS ${amountPaid.toFixed(2)}`);
      } catch (e2) {
        console.log(`  ${mapped.invoice_number}: fallback payment also failed — ${e2.message.split('\n')[0]}`);
      }
    }
  }

  console.log(`\nPayments: ${insertedPayments} inserted, ${paymentErrors} errors\n`);

  // Step 8: Summary
  console.log('=== IMPORT COMPLETE ===');
  const [[invCount]] = await seq.query('SELECT COUNT(*) as count FROM invoices');
  const [[itemCount]] = await seq.query('SELECT COUNT(*) as count FROM invoice_items');
  const [[payCount]] = await seq.query('SELECT COUNT(*) as count FROM invoice_payments');
  const [[maxNum]] = await seq.query(
    "SELECT MAX(CAST(salesbinder_invoice_number AS INTEGER)) as max_num FROM invoices WHERE salesbinder_invoice_number IS NOT NULL"
  );
  console.log(`  Database totals:`);
  console.log(`    Invoices:        ${invCount.count}`);
  console.log(`    Line items:      ${itemCount.count}`);
  console.log(`    Payments:        ${payCount.count}`);
  console.log(`    Latest SB#:      ${maxNum.max_num}`);

  // Verify new invoices
  const [newInvs] = await seq.query(
    `SELECT i.invoice_number, i.status, i.total_amount, i.amount_paid, c.first_name, c.last_name
     FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
     WHERE CAST(i.salesbinder_invoice_number AS INTEGER) > $1
     ORDER BY i.salesbinder_invoice_number`,
    { bind: [lastImported] }
  );
  console.log(`\n  Newly imported invoices:`);
  for (const inv of newInvs) {
    console.log(`    ${inv.invoice_number} | ${inv.first_name || '?'} ${inv.last_name || ''} | ${inv.status} | GHS ${parseFloat(inv.total_amount).toFixed(2)} | Paid: GHS ${parseFloat(inv.amount_paid).toFixed(2)}`);
  }
}

async function main() {
  try {
    await seq.authenticate();
    console.log('Database connected.\n');
    await run();
  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await seq.close();
  }
}

main();
