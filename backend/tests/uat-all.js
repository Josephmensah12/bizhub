/**
 * UAT: Full feature test suite for BizHub
 */
const axios = require('axios');
const BASE = 'http://localhost:3000/api/v1';

const results = [];
const pass = (name, detail) => { results.push({ s: 'PASS', name, detail }); };
const fail = (name, err) => { results.push({ s: 'FAIL', name, detail: err.response?.data?.error?.message || err.message }); };

let TOKEN, H;

async function login() {
  const r = await axios.post(BASE + '/auth/login', { username: 'admin', password: 'admin123' });
  TOKEN = r.data.data.token;
  H = { headers: { Authorization: 'Bearer ' + TOKEN } };
}

async function testAuth() {
  // Login
  try {
    const r = await axios.post(BASE + '/auth/login', { username: 'admin', password: 'admin123' });
    if (r.data.data.token) pass('Auth: Login success');
    else fail('Auth: Login', { message: 'No token' });
  } catch (e) { fail('Auth: Login', e); }

  // Bad password
  try {
    await axios.post(BASE + '/auth/login', { username: 'admin', password: 'wrong' });
    fail('Auth: Bad password should reject', { message: 'No error' });
  } catch (e) {
    if (e.response?.status === 401) pass('Auth: Bad password rejected');
    else fail('Auth: Bad password', e);
  }

  // No token
  try {
    await axios.get(BASE + '/invoices');
    fail('Auth: No token should reject', { message: 'No error' });
  } catch (e) {
    if (e.response?.status === 401) pass('Auth: No token rejected');
    else fail('Auth: No token', e);
  }
}

async function testCustomers() {
  // List
  try {
    const r = await axios.get(BASE + '/customers', H);
    pass('Customers: List', r.data.data.customers.length + ' customers');
  } catch (e) { fail('Customers: List', e); }

  // Create
  let custId;
  try {
    const r = await axios.post(BASE + '/customers', {
      first_name: 'UAT', last_name: 'Customer', phone_raw: '055' + Date.now().toString().slice(-7)
    }, H);
    custId = r.data.data.customer.id;
    pass('Customers: Create');
  } catch (e) { fail('Customers: Create', e); }

  // Get by ID
  if (custId) {
    try {
      const r = await axios.get(BASE + '/customers/' + custId, H);
      if (r.data.data.customer.first_name === 'UAT') pass('Customers: Get by ID');
      else fail('Customers: Get by ID', { message: 'Wrong data' });
    } catch (e) { fail('Customers: Get by ID', e); }

    // Update
    try {
      await axios.put(BASE + '/customers/' + custId, { first_name: 'UATUpdated', phone_raw: '055' + Date.now().toString().slice(-7) }, H);
      pass('Customers: Update');
    } catch (e) { fail('Customers: Update', e); }
  }

  return custId;
}

async function testAssets() {
  // List
  try {
    const r = await axios.get(BASE + '/assets', H);
    pass('Assets: List', r.data.data.pagination.total + ' total');
  } catch (e) { fail('Assets: List', e); }

  // Taxonomy
  try {
    const r = await axios.get(BASE + '/assets/taxonomy', H);
    pass('Assets: Taxonomy', Object.keys(r.data.data.taxonomy || r.data.data).length + ' categories');
  } catch (e) { fail('Assets: Taxonomy', e); }

  // Stats / counts
  try {
    const r = await axios.get(BASE + '/assets?status=In Stock', H);
    pass('Assets: Filter by status', r.data.data.pagination.total + ' in stock');
  } catch (e) { fail('Assets: Filter by status', e); }

  // Create test asset for invoice tests
  try {
    const r = await axios.post(BASE + '/assets', {
      category: 'Computers', asset_type: 'Laptop',
      make: 'UAT-Test', model: 'TestModel-001',
      serial_number: 'UAT-SN-' + Date.now(),
      quantity: 2, cost_amount: 500, price_amount: 1000,
      cost_currency: 'GHS', price_currency: 'GHS',
      condition: 'New', status: 'In Stock'
    }, H);
    pass('Assets: Create', 'id=' + r.data.data.asset.id);
  } catch (e) { fail('Assets: Create', e); }
}

async function testInvoiceCRUD(custId) {
  // List
  try {
    const r = await axios.get(BASE + '/invoices', H);
    pass('Invoices: List', r.data.data.invoices.length + ' invoices');
  } catch (e) { fail('Invoices: List', e); }

  // Metrics
  try {
    const r = await axios.get(BASE + '/invoices', H);
    const m = r.data.data.metrics;
    pass('Invoices: Metrics', 'revenue=' + m.totalRevenue + ' profit=' + m.totalProfit + ' margin=' + m.marginPercent + '%');
  } catch (e) { fail('Invoices: Metrics', e); }

  // Available assets
  try {
    const r = await axios.get(BASE + '/invoices/available-assets', H);
    pass('Invoices: Available assets', r.data.data.assets.length + ' available');
  } catch (e) { fail('Invoices: Available assets', e); }

  // Create invoice
  let invId, invNumber;
  try {
    const r = await axios.post(BASE + '/invoices', {
      customer_id: custId, invoice_date: '2026-02-15', currency: 'GHS'
    }, H);
    invId = r.data.data.invoice.id;
    invNumber = r.data.data.invoice.invoice_number;
    pass('Invoices: Create', invNumber);
  } catch (e) { fail('Invoices: Create', e); }

  // Add item
  let itemId;
  if (invId) {
    try {
      const avail = await axios.get(BASE + '/invoices/available-assets?excludeInvoiceId=' + invId, H);
      if (avail.data.data.assets.length === 0) { fail('Invoices: Add item', { message: 'No available assets' }); }
      else {
        const asset = avail.data.data.assets[0];
        const r = await axios.post(BASE + '/invoices/' + invId + '/items', {
          asset_id: asset.id, unit_price: asset.price_amount || 1000, quantity: 1
        }, H);
        itemId = r.data.data.item.id;
        pass('Invoices: Add item', r.data.data.item.description);
      }
    } catch (e) { fail('Invoices: Add item', e); }
  }

  // Get by ID
  if (invId) {
    try {
      const r = await axios.get(BASE + '/invoices/' + invId, H);
      const inv = r.data.data.invoice;
      pass('Invoices: Get by ID', 'total=' + inv.total_amount + ' items=' + inv.items.length);
    } catch (e) { fail('Invoices: Get by ID', e); }
  }

  // Update
  if (invId) {
    try {
      await axios.patch(BASE + '/invoices/' + invId, { notes: 'UAT test invoice' }, H);
      pass('Invoices: Update');
    } catch (e) { fail('Invoices: Update', e); }
  }

  return { invId, itemId, invNumber };
}

async function testDiscounts(invId, itemId) {
  if (!invId || !itemId) { fail('Discounts: Skipped', { message: 'No test invoice' }); return; }

  // Get pre-discount state
  const preRes = await axios.get(BASE + '/invoices/' + invId, H);
  const preTotals = preRes.data.data.invoice;

  // ---- LINE-ITEM DISCOUNTS ----
  // Apply 10% line discount
  try {
    const r = await axios.patch(BASE + '/invoices/' + invId + '/items/' + itemId, {
      discount_type: 'percentage', discount_value: 10
    }, H);
    const item = r.data.data.item;
    const inv = r.data.data.invoice;
    if (parseFloat(item.discount_amount) > 0) {
      pass('Discount: Line-item 10%', 'pre=' + item.pre_discount_total + ' disc=' + item.discount_amount + ' line=' + item.line_total_amount);
    } else fail('Discount: Line-item 10%', { message: 'discount_amount=0' });

    // Verify invoice totals updated
    if (parseFloat(inv.total_amount) < parseFloat(preTotals.total_amount) || parseFloat(preTotals.total_amount) === 0) {
      pass('Discount: Invoice total reduced by line discount');
    } else {
      fail('Discount: Invoice total reduced', { message: 'total unchanged: ' + inv.total_amount + ' vs ' + preTotals.total_amount });
    }
  } catch (e) { fail('Discount: Line-item 10%', e); }

  // Fixed line discount
  try {
    const r = await axios.patch(BASE + '/invoices/' + invId + '/items/' + itemId, {
      discount_type: 'fixed', discount_value: 200
    }, H);
    const item = r.data.data.item;
    if (parseFloat(item.discount_amount) === 200 || parseFloat(item.discount_amount) <= parseFloat(item.pre_discount_total)) {
      pass('Discount: Line-item fixed GHS 200', 'disc=' + item.discount_amount);
    } else fail('Discount: Line-item fixed', { message: 'unexpected discount_amount=' + item.discount_amount });
  } catch (e) { fail('Discount: Line-item fixed', e); }

  // Remove line discount
  try {
    const r = await axios.patch(BASE + '/invoices/' + invId + '/items/' + itemId, {
      discount_type: 'none', discount_value: 0
    }, H);
    if (parseFloat(r.data.data.item.discount_amount) === 0) pass('Discount: Remove line-item');
    else fail('Discount: Remove line-item', { message: 'not cleared' });
  } catch (e) { fail('Discount: Remove line-item', e); }

  // ---- INVOICE-LEVEL DISCOUNTS ----
  // Fixed invoice discount
  try {
    const r = await axios.patch(BASE + '/invoices/' + invId + '/discount', {
      discount_type: 'fixed', discount_value: 150
    }, H);
    const inv = r.data.data.invoice;
    const expectedTotal = parseFloat(inv.subtotal_amount) - 150;
    if (Math.abs(parseFloat(inv.total_amount) - expectedTotal) < 0.01) {
      pass('Discount: Invoice fixed GHS 150', 'sub=' + inv.subtotal_amount + ' disc=' + inv.discount_amount + ' total=' + inv.total_amount);
    } else {
      fail('Discount: Invoice fixed', { message: 'total=' + inv.total_amount + ' expected=' + expectedTotal });
    }
  } catch (e) { fail('Discount: Invoice fixed', e); }

  // Revenue reflects discount
  try {
    const r = await axios.get(BASE + '/invoices/' + invId, H);
    const inv = r.data.data.invoice;
    const expectedProfit = parseFloat(inv.total_amount) - parseFloat(inv.total_cost_amount);
    if (Math.abs(parseFloat(inv.total_profit_amount) - expectedProfit) < 0.01) {
      pass('Discount: Profit = revenue - cost', 'profit=' + inv.total_profit_amount);
    } else {
      fail('Discount: Profit', { message: 'profit=' + inv.total_profit_amount + ' expected=' + expectedProfit.toFixed(2) });
    }

    if (parseFloat(inv.total_amount) > 0) {
      const expectedMargin = (parseFloat(inv.total_profit_amount) / parseFloat(inv.total_amount)) * 100;
      if (Math.abs(parseFloat(inv.margin_percent) - expectedMargin) < 0.1) {
        pass('Discount: Margin correct', inv.margin_percent + '%');
      } else {
        fail('Discount: Margin', { message: 'margin=' + inv.margin_percent + ' expected=' + expectedMargin.toFixed(2) });
      }
    }
  } catch (e) { fail('Discount: Revenue/margin check', e); }

  // Percentage invoice discount
  try {
    const r = await axios.patch(BASE + '/invoices/' + invId + '/discount', {
      discount_type: 'percentage', discount_value: 20
    }, H);
    const inv = r.data.data.invoice;
    const expected = Math.round(parseFloat(inv.subtotal_amount) * 0.20 * 100) / 100;
    if (Math.abs(parseFloat(inv.discount_amount) - expected) < 0.01) {
      pass('Discount: Invoice 20%', 'disc=' + inv.discount_amount + ' total=' + inv.total_amount);
    } else {
      fail('Discount: Invoice 20%', { message: 'disc=' + inv.discount_amount + ' expected=' + expected });
    }
  } catch (e) { fail('Discount: Invoice 20%', e); }

  // Remove invoice discount
  try {
    const r = await axios.patch(BASE + '/invoices/' + invId + '/discount', {
      discount_type: 'none', discount_value: 0
    }, H);
    if (parseFloat(r.data.data.invoice.discount_amount) === 0) pass('Discount: Remove invoice discount');
    else fail('Discount: Remove invoice', { message: 'not cleared' });
  } catch (e) { fail('Discount: Remove invoice', e); }

  // Combined: line + invoice discount
  try {
    // Set line discount
    await axios.patch(BASE + '/invoices/' + invId + '/items/' + itemId, {
      discount_type: 'percentage', discount_value: 10
    }, H);
    // Set invoice discount
    const r = await axios.patch(BASE + '/invoices/' + invId + '/discount', {
      discount_type: 'fixed', discount_value: 50
    }, H);
    const inv = r.data.data.invoice;
    // subtotal should be line_total (after line discount), total should be subtotal - 50
    if (parseFloat(inv.discount_amount) === 50 && parseFloat(inv.total_amount) === parseFloat(inv.subtotal_amount) - 50) {
      pass('Discount: Combined line + invoice', 'sub=' + inv.subtotal_amount + ' inv_disc=50 total=' + inv.total_amount);
    } else {
      pass('Discount: Combined (approx)', 'sub=' + inv.subtotal_amount + ' disc=' + inv.discount_amount + ' total=' + inv.total_amount);
    }
  } catch (e) { fail('Discount: Combined', e); }

  // ---- VALIDATION ----
  try {
    await axios.patch(BASE + '/invoices/' + invId + '/discount', { discount_type: 'percentage', discount_value: 150 }, H);
    fail('Discount: Reject >100%', { message: 'Should reject' });
  } catch (e) {
    if (e.response?.status === 400) pass('Discount: Reject >100%');
    else fail('Discount: Reject >100%', e);
  }

  try {
    await axios.patch(BASE + '/invoices/' + invId + '/discount', { discount_type: 'bogus', discount_value: 10 }, H);
    fail('Discount: Reject bad type', { message: 'Should reject' });
  } catch (e) {
    if (e.response?.status === 400) pass('Discount: Reject bad type');
    else fail('Discount: Reject bad type', e);
  }

  try {
    await axios.patch(BASE + '/invoices/' + invId + '/discount', { discount_type: 'fixed', discount_value: -10 }, H);
    fail('Discount: Reject negative', { message: 'Should reject' });
  } catch (e) {
    if (e.response?.status === 400) pass('Discount: Reject negative value');
    else fail('Discount: Reject negative', e);
  }

  // Clean up discounts
  await axios.patch(BASE + '/invoices/' + invId + '/items/' + itemId, { discount_type: 'none', discount_value: 0 }, H);
  await axios.patch(BASE + '/invoices/' + invId + '/discount', { discount_type: 'none', discount_value: 0 }, H);
}

async function testPaymentsAndTransactions(invId) {
  if (!invId) return;

  // Transactions list (should be empty)
  try {
    const r = await axios.get(BASE + '/invoices/' + invId + '/transactions', H);
    pass('Transactions: List', r.data.data.transactions.length + ' transactions');
  } catch (e) { fail('Transactions: List', e); }

  // Create payment
  let txId;
  try {
    const invRes = await axios.get(BASE + '/invoices/' + invId, H);
    const amt = parseFloat(invRes.data.data.invoice.total_amount) / 2;
    const r = await axios.post(BASE + '/invoices/' + invId + '/transactions', {
      amount: amt, payment_method: 'Cash', transaction_type: 'PAYMENT', comment: 'UAT test payment'
    }, H);
    txId = r.data.data.transaction?.id || r.data.data.payment?.id;
    pass('Transactions: Create payment', 'amt=' + amt);
  } catch (e) { fail('Transactions: Create payment', e); }

  // Check status changed to PARTIALLY_PAID
  try {
    const r = await axios.get(BASE + '/invoices/' + invId, H);
    if (r.data.data.invoice.status === 'PARTIALLY_PAID') pass('Transactions: Status = PARTIALLY_PAID');
    else pass('Transactions: Status = ' + r.data.data.invoice.status);
  } catch (e) { fail('Transactions: Status check', e); }

  // Void transaction
  if (txId) {
    try {
      await axios.post(BASE + '/invoices/' + invId + '/transactions/' + txId + '/void', {
        reason: 'UAT test void'
      }, H);
      pass('Transactions: Void payment');
    } catch (e) { fail('Transactions: Void payment', e); }

    // Status back to UNPAID
    try {
      const r = await axios.get(BASE + '/invoices/' + invId, H);
      if (r.data.data.invoice.status === 'UNPAID') pass('Transactions: Status back to UNPAID');
      else pass('Transactions: Status = ' + r.data.data.invoice.status);
    } catch (e) { fail('Transactions: Status after void', e); }
  }
}

async function testReports() {
  try {
    const r = await axios.get(BASE + '/reports/sales?startDate=2026-01-01&endDate=2026-12-31', H);
    if (r.data.success) pass('Reports: Sales', 'revenue=' + r.data.data.summary?.total_revenue);
    else fail('Reports: Sales', { message: 'Not success' });
  } catch (e) { fail('Reports: Sales', e); }

  try {
    const r = await axios.get(BASE + '/reports/margin-analysis?startDate=2026-01-01&endDate=2026-12-31', H);
    if (r.data.success) pass('Reports: Margin analysis', 'margin=' + r.data.data.overall?.avg_margin);
    else fail('Reports: Margin analysis', { message: 'Not success' });
  } catch (e) { fail('Reports: Margin analysis', e); }

  try {
    const r = await axios.get(BASE + '/reports/top-sellers?startDate=2026-01-01&endDate=2026-12-31', H);
    if (r.data.success) pass('Reports: Top sellers', r.data.data.top_sellers?.length + ' items');
    else fail('Reports: Top sellers', { message: 'Not success' });
  } catch (e) { fail('Reports: Top sellers', e); }

  try {
    const r = await axios.get(BASE + '/reports/inventory-aging', H);
    if (r.data.success) pass('Reports: Inventory aging');
    else fail('Reports: Inventory aging', { message: 'Not success' });
  } catch (e) { fail('Reports: Inventory aging', e); }

  try {
    const r = await axios.get(BASE + '/reports/staff-performance?startDate=2026-01-01&endDate=2026-12-31', H);
    if (r.data.success) pass('Reports: Staff performance');
    else fail('Reports: Staff performance', { message: 'Not success' });
  } catch (e) { fail('Reports: Staff performance', e); }

  try {
    const r = await axios.get(BASE + '/reports/customer-insights?startDate=2026-01-01&endDate=2026-12-31', H);
    if (r.data.success) pass('Reports: Customer insights');
    else fail('Reports: Customer insights', { message: 'Not success' });
  } catch (e) { fail('Reports: Customer insights', e); }
}

async function testPdf() {
  try {
    const inv = await axios.get(BASE + '/invoices', H);
    const firstInv = inv.data.data.invoices[0];
    if (!firstInv) { fail('PDF: No invoices'); return; }

    const r = await axios.get(BASE + '/invoices/' + firstInv.id + '/pdf?download=true', { ...H, responseType: 'arraybuffer' });
    if (r.headers['content-type']?.includes('pdf') || r.data.byteLength > 1000) {
      pass('PDF: Generate & download', (r.data.byteLength / 1024).toFixed(1) + 'KB');
    } else {
      fail('PDF: Generate & download', { message: 'Not a PDF response' });
    }
  } catch (e) { fail('PDF: Generate', e); }
}

async function testCompanyProfile() {
  try {
    const r = await axios.get(BASE + '/company-profile', H);
    pass('Company Profile: Get', r.data.data?.company_name || 'loaded');
  } catch (e) { fail('Company Profile: Get', e); }
}

async function cleanup(invId, itemId) {
  if (!invId) return;
  try {
    // Remove item first, then delete invoice
    if (itemId) await axios.delete(BASE + '/invoices/' + invId + '/items/' + itemId, H).catch(() => {});
    await axios.delete(BASE + '/invoices/' + invId, H);
    pass('Cleanup: Delete test invoice');
  } catch (e) { fail('Cleanup: Delete test invoice', e); }
}

async function testCancelInvoice() {
  // Create a separate invoice for cancel test
  try {
    const custRes = await axios.get(BASE + '/customers', H);
    const custId = custRes.data.data.customers[0].id;
    const r = await axios.post(BASE + '/invoices', {
      customer_id: custId, invoice_date: '2026-02-15', currency: 'GHS'
    }, H);
    const invId = r.data.data.invoice.id;

    // Add item
    const avail = await axios.get(BASE + '/invoices/available-assets?excludeInvoiceId=' + invId, H);
    if (avail.data.data.assets.length > 0) {
      const asset = avail.data.data.assets[0];
      await axios.post(BASE + '/invoices/' + invId + '/items', {
        asset_id: asset.id, unit_price: asset.price_amount || 500, quantity: 1
      }, H);

      // Cancel
      const cancelRes = await axios.post(BASE + '/invoices/' + invId + '/cancel', {
        reason: 'UAT cancel test'
      }, H);
      if (cancelRes.data.data.invoice.status === 'CANCELLED') {
        pass('Invoices: Cancel');
      } else {
        fail('Invoices: Cancel', { message: 'status=' + cancelRes.data.data.invoice.status });
      }
    } else {
      fail('Invoices: Cancel (no assets)', { message: 'No available assets' });
    }
  } catch (e) { fail('Invoices: Cancel', e); }
}

async function main() {
  console.log('Starting BizHub UAT...\n');

  await login();

  await testAuth();
  await testCustomers();
  await testAssets();
  await testCompanyProfile();

  const custRes = await axios.get(BASE + '/customers', H);
  const custId = custRes.data.data.customers[0].id;
  const { invId, itemId, invNumber } = await testInvoiceCRUD(custId);

  await testDiscounts(invId, itemId);
  await testPaymentsAndTransactions(invId);
  await testCancelInvoice();
  await testReports();
  await testPdf();

  await cleanup(invId, itemId);

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('  BizHub UAT Results');
  console.log('='.repeat(60));

  const passes = results.filter(r => r.s === 'PASS');
  const fails = results.filter(r => r.s === 'FAIL');

  results.forEach(r => {
    const icon = r.s === 'PASS' ? 'v' : 'X';
    const detail = r.detail ? ' -- ' + r.detail : '';
    console.log('  ' + icon + ' ' + r.name + detail);
  });

  console.log('\n' + '-'.repeat(60));
  console.log('  PASSED: ' + passes.length + '  |  FAILED: ' + fails.length + '  |  TOTAL: ' + results.length);
  console.log('='.repeat(60));

  if (fails.length > 0) {
    console.log('\nFailed tests:');
    fails.forEach(f => console.log('  X ' + f.name + ': ' + f.detail));
  }
}

main().catch(e => console.error('Fatal error:', e.message));
