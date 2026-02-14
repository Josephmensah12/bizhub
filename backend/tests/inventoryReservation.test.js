/**
 * Inventory Reservation – Concurrency & Correctness Tests
 *
 * These are INTEGRATION tests that require a running PostgreSQL database.
 * They test the token-based reservation system end-to-end.
 *
 * Run:  NODE_ENV=development npx jest tests/inventoryReservation.test.js --runInBand
 */

// Use development database (bizhub_test doesn't exist)
process.env.NODE_ENV = 'development';

const { sequelize, Asset, Invoice, InvoiceItem, Customer, User } = require('../models');
const { QueryTypes } = require('sequelize');
const {
  computeAvailability,
  checkAndReserve,
  computeBulkAvailability,
  getReservedQuantity
} = require('../services/inventoryAvailabilityService');

let testUser, testCustomer;

beforeAll(async () => {
  testUser = await User.findOne();
  testCustomer = await Customer.findOne();
});

afterAll(async () => {
  await sequelize.close();
});

// Counter for unique asset tags within the 20-char limit
let assetSeq = 0;

// Helper: create a test asset with given on-hand quantity
async function createTestAsset(quantity = 1) {
  assetSeq++;
  return Asset.create({
    asset_tag: `T${Date.now() % 100000}-${assetSeq}`,
    category: 'Computer',
    asset_type: 'Laptop',
    make: 'TestBrand',
    model: 'TestModel',
    quantity,
    cost_amount: 100,
    price_amount: 150,
    status: 'In Stock',
    created_by: testUser.id
  });
}

// Counter for unique invoice numbers
let invSeq = 0;

// Helper: create an UNPAID invoice
async function createTestInvoice() {
  invSeq++;
  const invNumber = `TI${Date.now() % 100000}-${invSeq}`;
  return Invoice.create({
    invoice_number: invNumber,
    customer_id: testCustomer.id,
    status: 'UNPAID',
    created_by: testUser.id
  });
}

// Helper: add an item to an invoice (simulates what addItem controller does)
async function addItemToInvoice(invoiceId, assetId, quantity, transaction) {
  await checkAndReserve(assetId, quantity, { transaction });
  const item = await InvoiceItem.create({
    invoice_id: invoiceId,
    asset_id: assetId,
    quantity,
    unit_price_amount: 150,
    line_total_amount: 150 * quantity
  }, { transaction });
  return item;
}

describe('Inventory Availability Service', () => {
  let asset;

  beforeEach(async () => {
    asset = await createTestAsset(5);
  });

  test('fresh asset has full availability', async () => {
    const result = await computeAvailability(asset.id);
    expect(result.on_hand).toBe(5);
    expect(result.reserved).toBe(0);
    expect(result.available).toBe(5);
  });

  test('adding invoice item reduces availability', async () => {
    const invoice = await createTestInvoice();
    const t = await sequelize.transaction();
    try {
      await addItemToInvoice(invoice.id, asset.id, 2, t);
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }

    const result = await computeAvailability(asset.id);
    expect(result.on_hand).toBe(5);
    expect(result.reserved).toBe(2);
    expect(result.available).toBe(3);
  });

  test('multiple invoices accumulate reservations', async () => {
    const inv1 = await createTestInvoice();
    const inv2 = await createTestInvoice();

    const t1 = await sequelize.transaction();
    await addItemToInvoice(inv1.id, asset.id, 2, t1);
    await t1.commit();

    const t2 = await sequelize.transaction();
    await addItemToInvoice(inv2.id, asset.id, 2, t2);
    await t2.commit();

    const result = await computeAvailability(asset.id);
    expect(result.reserved).toBe(4);
    expect(result.available).toBe(1);
  });

  test('blocks reservation when insufficient stock', async () => {
    const invoice = await createTestInvoice();
    const t = await sequelize.transaction();
    try {
      await expect(
        addItemToInvoice(invoice.id, asset.id, 6, t)
      ).rejects.toThrow('Insufficient stock');
    } finally {
      await t.rollback();
    }
  });

  test('cancelled invoice releases reservation', async () => {
    const invoice = await createTestInvoice();
    const t = await sequelize.transaction();
    await addItemToInvoice(invoice.id, asset.id, 3, t);
    await t.commit();

    // Cancel the invoice
    await invoice.update({ status: 'CANCELLED' });

    const result = await computeAvailability(asset.id);
    expect(result.reserved).toBe(0);
    expect(result.available).toBe(5);
  });

  test('PAID invoice does not count as reserved (on_hand already decremented)', async () => {
    const invoice = await createTestInvoice();
    const t = await sequelize.transaction();
    await addItemToInvoice(invoice.id, asset.id, 2, t);
    await t.commit();

    // Simulate payment: decrement on_hand and set status PAID
    await asset.update({ quantity: asset.quantity - 2 });
    await invoice.update({ status: 'PAID' });

    const result = await computeAvailability(asset.id);
    expect(result.on_hand).toBe(3);
    expect(result.reserved).toBe(0); // PAID excluded from reserved
    expect(result.available).toBe(3);
  });

  test('voided item does not count as reserved', async () => {
    const invoice = await createTestInvoice();
    const t = await sequelize.transaction();
    const item = await addItemToInvoice(invoice.id, asset.id, 2, t);
    await t.commit();

    // Void the item
    await item.update({ voided_at: new Date() });

    const result = await computeAvailability(asset.id);
    expect(result.reserved).toBe(0);
    expect(result.available).toBe(5);
  });

  test('removing item restores availability', async () => {
    const invoice = await createTestInvoice();
    const t = await sequelize.transaction();
    const item = await addItemToInvoice(invoice.id, asset.id, 3, t);
    await t.commit();

    // Delete the item
    await item.destroy();

    const result = await computeAvailability(asset.id);
    expect(result.reserved).toBe(0);
    expect(result.available).toBe(5);
  });

  test('excludeInvoiceId works correctly', async () => {
    const inv1 = await createTestInvoice();
    const inv2 = await createTestInvoice();

    const t1 = await sequelize.transaction();
    await addItemToInvoice(inv1.id, asset.id, 2, t1);
    await t1.commit();

    const t2 = await sequelize.transaction();
    await addItemToInvoice(inv2.id, asset.id, 1, t2);
    await t2.commit();

    // Without exclusion: reserved=3
    const full = await computeAvailability(asset.id);
    expect(full.reserved).toBe(3);

    // Excluding inv1: reserved=1
    const excluded = await computeAvailability(asset.id, { excludeInvoiceId: inv1.id });
    expect(excluded.reserved).toBe(1);
    expect(excluded.available).toBe(4);
  });
});

describe('Bulk Availability', () => {
  test('computes availability for multiple assets', async () => {
    const a1 = await createTestAsset(10);
    const a2 = await createTestAsset(3);

    const invoice = await createTestInvoice();
    const t = await sequelize.transaction();
    await addItemToInvoice(invoice.id, a1.id, 4, t);
    await addItemToInvoice(invoice.id, a2.id, 1, t);
    await t.commit();

    const result = await computeBulkAvailability([a1.id, a2.id]);
    expect(result.get(a1.id).available).toBe(6);
    expect(result.get(a2.id).available).toBe(2);
  });
});

describe('Concurrency – Last Unit Race', () => {
  test('only one of two concurrent reservations succeeds for the last unit', async () => {
    const asset = await createTestAsset(1); // Only 1 unit
    const inv1 = await createTestInvoice();
    const inv2 = await createTestInvoice();

    // Launch two concurrent transactions trying to reserve the same last unit
    const results = await Promise.allSettled([
      (async () => {
        const t = await sequelize.transaction();
        try {
          await addItemToInvoice(inv1.id, asset.id, 1, t);
          await t.commit();
          return 'success';
        } catch (e) {
          await t.rollback();
          throw e;
        }
      })(),
      (async () => {
        const t = await sequelize.transaction();
        try {
          await addItemToInvoice(inv2.id, asset.id, 1, t);
          await t.commit();
          return 'success';
        } catch (e) {
          await t.rollback();
          throw e;
        }
      })()
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Exactly one should succeed, one should fail
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].reason.message).toMatch(/Insufficient stock/);

    // Verify final state: 1 reserved, 0 available
    const avail = await computeAvailability(asset.id);
    expect(avail.reserved).toBe(1);
    expect(avail.available).toBe(0);
  });

  test('concurrent fills across invoices respect total quantity', async () => {
    const asset = await createTestAsset(5);

    // 3 concurrent invoices each trying to reserve 2 units (total 6 > 5)
    const invoices = await Promise.all([
      createTestInvoice(),
      createTestInvoice(),
      createTestInvoice()
    ]);

    const results = await Promise.allSettled(
      invoices.map(async (inv) => {
        const t = await sequelize.transaction();
        try {
          await addItemToInvoice(inv.id, asset.id, 2, t);
          await t.commit();
          return 'success';
        } catch (e) {
          await t.rollback();
          throw e;
        }
      })
    );

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // At most 2 should succeed (2+2=4 <= 5), the 3rd (2+2+2=6 > 5) must fail
    expect(successes.length).toBe(2);
    expect(failures.length).toBe(1);

    const avail = await computeAvailability(asset.id);
    expect(avail.reserved).toBe(4);
    expect(avail.available).toBe(1);
  });
});

describe('DB Trigger Enforcement', () => {
  test('trigger blocks insert when stock is insufficient', async () => {
    const asset = await createTestAsset(1);
    const inv1 = await createTestInvoice();
    const inv2 = await createTestInvoice();

    // First reservation succeeds
    await InvoiceItem.create({
      invoice_id: inv1.id,
      asset_id: asset.id,
      quantity: 1,
      unit_price_amount: 150,
      line_total_amount: 150
    });

    // Second reservation should be blocked by the DB trigger
    await expect(
      InvoiceItem.create({
        invoice_id: inv2.id,
        asset_id: asset.id,
        quantity: 1,
        unit_price_amount: 150,
        line_total_amount: 150
      })
    ).rejects.toThrow(/Insufficient stock/);
  });

  test('trigger allows insert on PAID/CANCELLED invoices (no reservation needed)', async () => {
    const asset = await createTestAsset(1);
    const inv1 = await createTestInvoice();

    // Reserve the only unit
    await InvoiceItem.create({
      invoice_id: inv1.id,
      asset_id: asset.id,
      quantity: 1,
      unit_price_amount: 150,
      line_total_amount: 150
    });

    // A PAID invoice should not be blocked (it's not reserving)
    const paidInvoice = await createTestInvoice();
    await paidInvoice.update({ status: 'PAID' });

    // This should succeed because the trigger skips PAID invoices
    const item = await InvoiceItem.create({
      invoice_id: paidInvoice.id,
      asset_id: asset.id,
      quantity: 1,
      unit_price_amount: 150,
      line_total_amount: 150
    });
    expect(item.id).toBeTruthy();
  });
});

describe('Asset Status Derivation', () => {
  test('asset status becomes Processing when items on active invoice', async () => {
    const asset = await createTestAsset(5);
    const invoice = await createTestInvoice();

    const t = await sequelize.transaction();
    await addItemToInvoice(invoice.id, asset.id, 1, t);
    await asset.updateComputedStatus(t);
    await t.commit();

    await asset.reload();
    expect(asset.status).toBe('Processing');
  });

  test('asset status becomes In Stock when invoice cancelled', async () => {
    const asset = await createTestAsset(5);
    const invoice = await createTestInvoice();

    const t = await sequelize.transaction();
    await addItemToInvoice(invoice.id, asset.id, 1, t);
    await asset.updateComputedStatus(t);
    await t.commit();

    // Cancel the invoice
    await invoice.update({ status: 'CANCELLED' });
    await asset.updateComputedStatus();

    await asset.reload();
    expect(asset.status).toBe('In Stock');
  });

  test('asset status becomes Sold when invoice is PAID', async () => {
    const asset = await createTestAsset(1);
    const invoice = await createTestInvoice();

    const t = await sequelize.transaction();
    await addItemToInvoice(invoice.id, asset.id, 1, t);
    await t.commit();

    // Simulate payment
    await asset.update({ quantity: 0 });
    await invoice.update({ status: 'PAID' });
    await asset.updateComputedStatus();

    await asset.reload();
    expect(asset.status).toBe('Sold');
  });
});
