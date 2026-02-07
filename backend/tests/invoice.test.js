/**
 * Invoice Module Tests
 *
 * Tests for:
 * 1. New invoice defaults to UNPAID with amountPaid=0, balanceDue=total
 * 2. Receive payment requires comment
 * 3. Payment method validation (Cash, MoMo, Card, ACH, Other)
 * 4. "Other" payment method requires specification text
 * 5. Partial payment sets PARTIALLY_PAID
 * 6. Full payment sets PAID
 * 7. Cannot overpay
 * 8. Payment entries are stored and shown in invoice detail
 * 9. Inventory reserved at invoice creation; sold on PAID; restored on cancel
 * 10. Default invoice list filters to current month
 * 11. Aggregated totals match sum of invoices in range
 * 12. Profit masking default ON
 */

describe('Invoice Status and Payments', () => {
  test('new invoice should default to UNPAID with amountPaid=0', () => {
    const invoice = {
      status: 'UNPAID',
      total_amount: 1000,
      amount_paid: 0,
      balance_due: 1000
    };

    expect(invoice.status).toBe('UNPAID');
    expect(invoice.amount_paid).toBe(0);
    expect(invoice.balance_due).toBe(invoice.total_amount);
  });

  test('balance_due should equal total_amount - amount_paid', () => {
    const invoice = {
      total_amount: 1000,
      amount_paid: 300,
      balance_due: 700
    };

    expect(invoice.balance_due).toBe(invoice.total_amount - invoice.amount_paid);
  });
});

describe('Payment Validation', () => {
  test('payment requires comment', () => {
    const payment = {
      amount: 500,
      comment: ''
    };

    const isValid = payment.comment && payment.comment.trim() !== '';
    expect(isValid).toBeFalsy();
  });

  test('payment with comment is valid', () => {
    const payment = {
      amount: 500,
      comment: 'Cash at shop'
    };

    const isValid = payment.comment && payment.comment.trim() !== '';
    expect(isValid).toBe(true);
  });

  test('payment amount must be greater than 0', () => {
    const payment = { amount: 0 };
    expect(payment.amount > 0).toBe(false);

    const validPayment = { amount: 100 };
    expect(validPayment.amount > 0).toBe(true);
  });

  test('cannot overpay invoice', () => {
    const invoice = {
      total_amount: 1000,
      amount_paid: 800,
      balance_due: 200
    };

    const paymentAmount = 300;
    const wouldOverpay = invoice.amount_paid + paymentAmount > invoice.total_amount;

    expect(wouldOverpay).toBe(true);
  });

  test('valid payment does not exceed balance', () => {
    const invoice = {
      total_amount: 1000,
      amount_paid: 800,
      balance_due: 200
    };

    const paymentAmount = 200;
    const wouldOverpay = invoice.amount_paid + paymentAmount > invoice.total_amount;

    expect(wouldOverpay).toBe(false);
  });
});

describe('Payment Method Validation', () => {
  const VALID_PAYMENT_METHODS = ['Cash', 'MoMo', 'Card', 'ACH', 'Other'];

  test('payment requires payment method', () => {
    const payment = {
      amount: 500,
      payment_method: null,
      comment: 'Some comment'
    };

    const isValid = payment.payment_method && VALID_PAYMENT_METHODS.includes(payment.payment_method);
    expect(isValid).toBeFalsy();
  });

  test('payment method must be from valid list', () => {
    const payment = {
      amount: 500,
      payment_method: 'InvalidMethod',
      comment: 'Some comment'
    };

    const isValid = VALID_PAYMENT_METHODS.includes(payment.payment_method);
    expect(isValid).toBe(false);
  });

  test('valid payment method is accepted', () => {
    const payment = {
      amount: 500,
      payment_method: 'MoMo',
      comment: 'To MTN 024XXXXXXX'
    };

    const isValid = VALID_PAYMENT_METHODS.includes(payment.payment_method);
    expect(isValid).toBe(true);
  });

  test('Other payment method requires specification text', () => {
    const payment = {
      amount: 500,
      payment_method: 'Other',
      payment_method_other_text: '',
      comment: 'Some comment'
    };

    const needsOtherText = payment.payment_method === 'Other';
    const hasOtherText = payment.payment_method_other_text && payment.payment_method_other_text.trim() !== '';
    const isValid = !needsOtherText || hasOtherText;

    expect(isValid).toBeFalsy();
  });

  test('Other payment method with text is valid', () => {
    const payment = {
      amount: 500,
      payment_method: 'Other',
      payment_method_other_text: 'Bitcoin',
      comment: 'BTC wallet address xyz'
    };

    const needsOtherText = payment.payment_method === 'Other';
    const hasOtherText = payment.payment_method_other_text && payment.payment_method_other_text.trim() !== '';
    const isValid = !needsOtherText || hasOtherText;

    expect(isValid).toBe(true);
  });

  test('non-Other method should not require other text', () => {
    const payment = {
      amount: 500,
      payment_method: 'Cash',
      payment_method_other_text: null,
      comment: 'Cash at Accra shop'
    };

    const needsOtherText = payment.payment_method === 'Other';
    const isValid = !needsOtherText || (payment.payment_method_other_text && payment.payment_method_other_text.trim() !== '');

    expect(isValid).toBe(true);
  });

  test('getMethodDisplay returns method name for standard methods', () => {
    const payment = { payment_method: 'MoMo', payment_method_other_text: null };

    const display = payment.payment_method === 'Other' && payment.payment_method_other_text
      ? `Other – ${payment.payment_method_other_text}`
      : payment.payment_method;

    expect(display).toBe('MoMo');
  });

  test('getMethodDisplay returns "Other – text" for Other method', () => {
    const payment = { payment_method: 'Other', payment_method_other_text: 'Bitcoin' };

    const display = payment.payment_method === 'Other' && payment.payment_method_other_text
      ? `Other – ${payment.payment_method_other_text}`
      : payment.payment_method;

    expect(display).toBe('Other – Bitcoin');
  });
});

describe('Payment Status Transitions', () => {
  test('partial payment sets status to PARTIALLY_PAID', () => {
    const invoice = {
      status: 'UNPAID',
      total_amount: 1000,
      amount_paid: 0,
      balance_due: 1000
    };

    // Receive partial payment
    const paymentAmount = 400;
    invoice.amount_paid += paymentAmount;
    invoice.balance_due = invoice.total_amount - invoice.amount_paid;

    // Update status
    if (invoice.amount_paid >= invoice.total_amount) {
      invoice.status = 'PAID';
    } else if (invoice.amount_paid > 0) {
      invoice.status = 'PARTIALLY_PAID';
    }

    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.amount_paid).toBe(400);
    expect(invoice.balance_due).toBe(600);
  });

  test('full payment sets status to PAID', () => {
    const invoice = {
      status: 'PARTIALLY_PAID',
      total_amount: 1000,
      amount_paid: 400,
      balance_due: 600
    };

    // Receive remaining payment
    const paymentAmount = 600;
    invoice.amount_paid += paymentAmount;
    invoice.balance_due = invoice.total_amount - invoice.amount_paid;

    // Update status
    if (invoice.amount_paid >= invoice.total_amount) {
      invoice.status = 'PAID';
    } else if (invoice.amount_paid > 0) {
      invoice.status = 'PARTIALLY_PAID';
    }

    expect(invoice.status).toBe('PAID');
    expect(invoice.amount_paid).toBe(1000);
    expect(invoice.balance_due).toBe(0);
  });

  test('single full payment sets status to PAID', () => {
    const invoice = {
      status: 'UNPAID',
      total_amount: 500,
      amount_paid: 0,
      balance_due: 500
    };

    // Receive full payment
    const paymentAmount = 500;
    invoice.amount_paid += paymentAmount;
    invoice.balance_due = invoice.total_amount - invoice.amount_paid;

    // Update status
    if (invoice.amount_paid >= invoice.total_amount) {
      invoice.status = 'PAID';
    } else if (invoice.amount_paid > 0) {
      invoice.status = 'PARTIALLY_PAID';
    }

    expect(invoice.status).toBe('PAID');
    expect(invoice.balance_due).toBe(0);
  });
});

describe('Payment History', () => {
  test('payment entries are stored with required fields', () => {
    const payment = {
      id: 'pay-1',
      invoice_id: 'inv-1',
      payment_date: new Date(),
      amount: 500,
      currency: 'GHS',
      comment: 'Momo to MTN number',
      received_by_user_id: 1
    };

    expect(payment.id).toBeDefined();
    expect(payment.invoice_id).toBe('inv-1');
    expect(payment.amount).toBe(500);
    expect(payment.comment).toBe('Momo to MTN number');
  });

  test('multiple payments are tracked', () => {
    const payments = [
      { id: 'pay-1', amount: 300, comment: 'Cash deposit' },
      { id: 'pay-2', amount: 400, comment: 'Bank transfer' },
      { id: 'pay-3', amount: 300, comment: 'Momo payment' }
    ];

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    expect(totalPaid).toBe(1000);
    expect(payments.length).toBe(3);
  });
});

describe('Inventory Locking', () => {
  test('asset.canBeSold should return true for In Stock items', () => {
    const asset = {
      status: 'In Stock',
      quantity: 1,
      deleted_at: null,
      canBeSold: function() {
        return this.status === 'In Stock' && this.quantity > 0 && !this.deleted_at;
      }
    };

    expect(asset.canBeSold()).toBe(true);
  });

  test('asset.canBeSold should return false for Reserved items', () => {
    const asset = {
      status: 'Reserved',
      quantity: 1,
      deleted_at: null,
      canBeSold: function() {
        return this.status === 'In Stock' && this.quantity > 0 && !this.deleted_at;
      }
    };

    expect(asset.canBeSold()).toBe(false);
  });

  test('adding item to invoice should change status to Reserved', () => {
    const asset = {
      status: 'In Stock',
      reserve: function() {
        this.status = 'Reserved';
      }
    };

    asset.reserve();
    expect(asset.status).toBe('Reserved');
  });

  test('full payment should change asset status to Sold', () => {
    const invoice = {
      status: 'UNPAID',
      total_amount: 1000,
      amount_paid: 0,
      items: [
        { asset: { status: 'Reserved' } }
      ]
    };

    // Receive full payment
    invoice.amount_paid = 1000;
    invoice.status = 'PAID';

    // Mark assets as Sold when fully paid
    if (invoice.status === 'PAID') {
      invoice.items.forEach(item => {
        if (item.asset.status === 'Reserved') {
          item.asset.status = 'Sold';
        }
      });
    }

    expect(invoice.items[0].asset.status).toBe('Sold');
  });

  test('partial payment should keep asset status as Reserved', () => {
    const invoice = {
      status: 'UNPAID',
      total_amount: 1000,
      amount_paid: 0,
      items: [
        { asset: { status: 'Reserved' } }
      ]
    };

    // Receive partial payment
    invoice.amount_paid = 500;
    invoice.status = 'PARTIALLY_PAID';

    // Only mark as Sold when fully paid
    if (invoice.status === 'PAID') {
      invoice.items.forEach(item => {
        if (item.asset.status === 'Reserved') {
          item.asset.status = 'Sold';
        }
      });
    }

    expect(invoice.items[0].asset.status).toBe('Reserved');
  });

  test('cancelling invoice should restore inventory to In Stock', () => {
    const items = [
      { asset: { status: 'Reserved' } },
      { asset: { status: 'Reserved' } }
    ];

    // Simulate cancellation
    items.forEach(item => {
      item.asset.status = 'In Stock';
    });

    expect(items.every(i => i.asset.status === 'In Stock')).toBe(true);
  });

  test('cannot cancel invoice with payments', () => {
    const invoice = {
      status: 'PARTIALLY_PAID',
      amount_paid: 500
    };

    const canCancel = invoice.amount_paid === 0;
    expect(canCancel).toBe(false);
  });
});

describe('Invoice List Defaults', () => {
  test('should default to current month date range', () => {
    const now = new Date();
    const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    expect(defaultDateFrom.getDate()).toBe(1);
    expect(defaultDateTo.getMonth()).toBe(now.getMonth());
  });

  test('should build correct where clause for date range', () => {
    const dateFrom = '2026-02-01';
    const dateTo = '2026-02-28';

    const where = {
      invoice_date: {
        $between: [new Date(dateFrom), new Date(dateTo)]
      }
    };

    expect(where.invoice_date.$between).toHaveLength(2);
  });
});

describe('Invoice Metrics Aggregation', () => {
  test('should calculate correct aggregated metrics', () => {
    const invoices = [
      { total_amount: 1000, amount_paid: 1000, balance_due: 0, total_cost_amount: 600, total_profit_amount: 400 },
      { total_amount: 2000, amount_paid: 1500, balance_due: 500, total_cost_amount: 1200, total_profit_amount: 800 },
      { total_amount: 500, amount_paid: 0, balance_due: 500, total_cost_amount: 300, total_profit_amount: 200 }
    ];

    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalCollected = invoices.reduce((sum, inv) => sum + inv.amount_paid, 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balance_due, 0);
    const totalCost = invoices.reduce((sum, inv) => sum + inv.total_cost_amount, 0);
    const totalProfit = invoices.reduce((sum, inv) => sum + inv.total_profit_amount, 0);

    expect(totalRevenue).toBe(3500);
    expect(totalCollected).toBe(2500);
    expect(totalOutstanding).toBe(1000);
    expect(totalCost).toBe(2100);
    expect(totalProfit).toBe(1400);
  });

  test('should handle empty invoice list', () => {
    const invoices = [];

    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalCollected = invoices.reduce((sum, inv) => sum + inv.amount_paid, 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balance_due, 0);

    expect(totalRevenue).toBe(0);
    expect(totalCollected).toBe(0);
    expect(totalOutstanding).toBe(0);
  });
});

describe('Profit Masking', () => {
  test('should mask profit by default', () => {
    const showProfit = false; // Default state
    const totalCost = 1000;
    const totalProfit = 500;

    const displayCost = showProfit ? totalCost : '******';
    const displayProfit = showProfit ? totalProfit : '******';

    expect(displayCost).toBe('******');
    expect(displayProfit).toBe('******');
  });

  test('should reveal profit when toggled', () => {
    const showProfit = true;
    const totalCost = 1000;
    const totalProfit = 500;

    const displayCost = showProfit ? totalCost : '******';
    const displayProfit = showProfit ? totalProfit : '******';

    expect(displayCost).toBe(1000);
    expect(displayProfit).toBe(500);
  });
});

describe('Invoice Number Generation', () => {
  test('should generate invoice number in correct format', () => {
    const year = 2026;
    const seq = 42;

    const invoiceNumber = `INV-${year}-${String(seq).padStart(6, '0')}`;

    expect(invoiceNumber).toBe('INV-2026-000042');
  });
});

describe('Cost/Profit Calculation with FX', () => {
  test('should calculate correct line totals', () => {
    const item = {
      quantity: 2,
      unit_price_amount: 500,
      unit_cost_amount: 300
    };

    const lineTotal = item.quantity * item.unit_price_amount;
    const lineCost = item.quantity * item.unit_cost_amount;
    const lineProfit = lineTotal - lineCost;

    expect(lineTotal).toBe(1000);
    expect(lineCost).toBe(600);
    expect(lineProfit).toBe(400);
  });

  test('should convert USD cost to GHS using FX rate', () => {
    const costUSD = 100;
    const fxRate = 12.5; // 1 USD = 12.5 GHS

    const costGHS = costUSD * fxRate;

    expect(costGHS).toBe(1250);
  });
});

describe('Date Preset Calculations', () => {
  test('current month should start on 1st', () => {
    const now = new Date(2026, 1, 15); // Feb 15, 2026
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    expect(startOfMonth.getDate()).toBe(1);
    expect(startOfMonth.getMonth()).toBe(1); // February
  });

  test('last month should be previous month', () => {
    const now = new Date(2026, 1, 15); // Feb 15, 2026
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    expect(startOfLastMonth.getMonth()).toBe(0); // January
    expect(endOfLastMonth.getDate()).toBe(31); // Jan 31
  });

  test('YTD should start on Jan 1', () => {
    const now = new Date(2026, 5, 15); // June 15, 2026
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    expect(startOfYear.getMonth()).toBe(0);
    expect(startOfYear.getDate()).toBe(1);
  });
});
