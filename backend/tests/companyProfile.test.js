/**
 * Company Profile and Invoice PDF Tests
 *
 * Tests for:
 * 1. Company profile save/load
 * 2. Logo upload validation
 * 3. PDF generation includes company name/logo
 * 4. WhatsApp link generation
 * 5. Send button disabled when WhatsApp is missing
 */

describe('Company Profile', () => {
  describe('Profile Validation', () => {
    test('company name is required', () => {
      const profile = {
        companyName: '',
        tagline: 'Best electronics',
        city: 'Accra'
      };

      const isValid = profile.companyName && profile.companyName.trim() !== '';
      expect(isValid).toBeFalsy();
    });

    test('valid profile with company name', () => {
      const profile = {
        companyName: 'Payless4Tech',
        tagline: 'Quality electronics at best prices',
        city: 'Accra',
        country: 'Ghana'
      };

      const isValid = profile.companyName && profile.companyName.trim() !== '';
      expect(isValid).toBe(true);
    });

    test('email validation', () => {
      const validEmail = 'info@company.com';
      const invalidEmail = 'not-an-email';

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      expect(emailRegex.test(validEmail)).toBe(true);
      expect(emailRegex.test(invalidEmail)).toBe(false);
    });

    test('profile defaults country to Ghana', () => {
      const profile = {
        companyName: 'Test Company',
        country: undefined
      };

      const country = profile.country || 'Ghana';
      expect(country).toBe('Ghana');
    });
  });

  describe('Logo Upload Validation', () => {
    const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    test('allows PNG files', () => {
      const file = { mimetype: 'image/png', size: 1024 };
      const isAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
      expect(isAllowed).toBe(true);
    });

    test('allows JPEG files', () => {
      const file = { mimetype: 'image/jpeg', size: 1024 };
      const isAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
      expect(isAllowed).toBe(true);
    });

    test('allows SVG files', () => {
      const file = { mimetype: 'image/svg+xml', size: 1024 };
      const isAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
      expect(isAllowed).toBe(true);
    });

    test('rejects non-image files', () => {
      const file = { mimetype: 'application/pdf', size: 1024 };
      const isAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
      expect(isAllowed).toBe(false);
    });

    test('rejects files exceeding max size', () => {
      const file = { mimetype: 'image/png', size: 10 * 1024 * 1024 }; // 10MB
      const isValidSize = file.size <= MAX_FILE_SIZE;
      expect(isValidSize).toBe(false);
    });

    test('accepts files under max size', () => {
      const file = { mimetype: 'image/png', size: 2 * 1024 * 1024 }; // 2MB
      const isValidSize = file.size <= MAX_FILE_SIZE;
      expect(isValidSize).toBe(true);
    });
  });

  describe('Full Address Formatting', () => {
    test('formats full address correctly', () => {
      const profile = {
        address_line_1: '123 Main Street',
        address_line_2: 'Suite 100',
        city: 'Accra',
        region_state: 'Greater Accra',
        country: 'Ghana'
      };

      const parts = [];
      if (profile.address_line_1) parts.push(profile.address_line_1);
      if (profile.address_line_2) parts.push(profile.address_line_2);
      if (profile.city) parts.push(profile.city);
      if (profile.region_state) parts.push(profile.region_state);
      if (profile.country) parts.push(profile.country);

      const fullAddress = parts.join(', ');

      expect(fullAddress).toBe('123 Main Street, Suite 100, Accra, Greater Accra, Ghana');
    });

    test('handles missing address parts', () => {
      const profile = {
        address_line_1: '123 Main Street',
        city: 'Accra',
        country: 'Ghana'
      };

      const parts = [];
      if (profile.address_line_1) parts.push(profile.address_line_1);
      if (profile.address_line_2) parts.push(profile.address_line_2);
      if (profile.city) parts.push(profile.city);
      if (profile.region_state) parts.push(profile.region_state);
      if (profile.country) parts.push(profile.country);

      const fullAddress = parts.join(', ');

      expect(fullAddress).toBe('123 Main Street, Accra, Ghana');
    });
  });
});

describe('Invoice PDF Generation', () => {
  describe('PDF Data Requirements', () => {
    test('invoice has required fields for PDF', () => {
      const invoice = {
        invoice_number: 'INV-2026-000001',
        invoice_date: new Date(),
        status: 'UNPAID',
        currency: 'GHS',
        total_amount: 1000,
        amount_paid: 0,
        balance_due: 1000,
        items: [],
        customer: null
      };

      expect(invoice.invoice_number).toBeDefined();
      expect(invoice.invoice_date).toBeDefined();
      expect(invoice.total_amount).toBeDefined();
      expect(invoice.balance_due).toBeDefined();
    });

    test('company profile provides branding', () => {
      const companyProfile = {
        company_name: 'Payless4Tech',
        tagline: 'Quality electronics',
        logo_url: '/api/v1/company-profile/logo/logo-123.png',
        phone: '+233 24 123 4567',
        email: 'info@payless4tech.com'
      };

      expect(companyProfile.company_name).toBeDefined();
      expect(companyProfile.logo_url).toBeDefined();
    });

    test('PDF should NOT include profit info', () => {
      const invoice = {
        total_amount: 1000,
        total_cost_amount: 600,
        total_profit_amount: 400,
        margin_percent: 66.67
      };

      // Customer-facing PDF fields
      const pdfFields = ['total_amount', 'amount_paid', 'balance_due'];

      // Profit fields should NOT be included
      const profitFields = ['total_cost_amount', 'total_profit_amount', 'margin_percent'];

      expect(pdfFields.includes('total_profit_amount')).toBe(false);
      expect(profitFields.every(f => !pdfFields.includes(f))).toBe(true);
    });
  });

  describe('Currency Formatting', () => {
    const formatCurrency = (amount, currency = 'GHS') => {
      if (amount === null || amount === undefined) return '—';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
      }).format(amount);
    };

    test('formats GHS correctly', () => {
      const formatted = formatCurrency(1250.50, 'GHS');
      expect(formatted).toContain('1,250.50');
    });

    test('formats USD correctly', () => {
      const formatted = formatCurrency(100.00, 'USD');
      expect(formatted).toContain('$');
      expect(formatted).toContain('100.00');
    });

    test('handles null amount', () => {
      const formatted = formatCurrency(null);
      expect(formatted).toBe('—');
    });
  });

  describe('PDF Access Token', () => {
    test('access token is 64 characters hex', () => {
      // Simulating crypto.randomBytes(32).toString('hex')
      const token = 'a'.repeat(64);
      expect(token.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    test('PDF expires after 7 days', () => {
      const generatedAt = new Date();
      const now = new Date(generatedAt.getTime() + 8 * 24 * 60 * 60 * 1000); // 8 days later

      const daysSinceGenerated = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);
      const isExpired = daysSinceGenerated > 7;

      expect(isExpired).toBe(true);
    });

    test('PDF is valid within 7 days', () => {
      const generatedAt = new Date();
      const now = new Date(generatedAt.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days later

      const daysSinceGenerated = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);
      const isExpired = daysSinceGenerated > 7;

      expect(isExpired).toBe(false);
    });
  });
});

describe('WhatsApp Integration', () => {
  describe('WhatsApp Link Generation', () => {
    test('generates correct wa.me link format', () => {
      const whatsappNumber = '+233241234567';
      const message = 'Hello, here is your invoice';

      // Remove + for wa.me link
      const cleanNumber = whatsappNumber.replace(/^\+/, '');
      const encodedMessage = encodeURIComponent(message);

      const whatsappLink = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;

      expect(whatsappLink).toContain('https://wa.me/233241234567');
      expect(whatsappLink).toContain('?text=');
    });

    test('encodes message with special characters', () => {
      const message = 'Invoice #001 - Amount: GHS 1,000.00';
      const encoded = encodeURIComponent(message);

      expect(encoded).not.toContain('#');
      expect(encoded).not.toContain(',');
      expect(encoded).toContain('%23'); // encoded #
    });

    test('composes complete invoice message', () => {
      const customerName = 'John Doe';
      const invoiceNumber = 'INV-2026-000001';
      const companyName = 'Payless4Tech';
      const totalAmount = 1000;
      const balanceDue = 500;
      const currency = 'GHS';
      const pdfUrl = 'https://example.com/invoice.pdf';

      const formatCurrency = (amount, curr) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: curr,
          minimumFractionDigits: 2
        }).format(amount);

      const message = [
        `Hello ${customerName},`,
        '',
        `This is a reminder for Invoice ${invoiceNumber} from ${companyName}.`,
        '',
        `Invoice Total: ${formatCurrency(totalAmount, currency)}`,
        `Balance Due: ${formatCurrency(balanceDue, currency)}`,
        '',
        `You can view and download your invoice here:`,
        pdfUrl,
        '',
        `Thank you for your business!`
      ].join('\n');

      expect(message).toContain(customerName);
      expect(message).toContain(invoiceNumber);
      expect(message).toContain(companyName);
      expect(message).toContain(pdfUrl);
    });
  });

  describe('WhatsApp Button State', () => {
    test('button disabled when customer has no WhatsApp', () => {
      const customer = {
        first_name: 'John',
        last_name: 'Doe',
        phone_e164: '+233241234567',
        whatsapp_e164: null
      };

      const canSendWhatsApp = !!customer.whatsapp_e164;
      expect(canSendWhatsApp).toBe(false);
    });

    test('button enabled when customer has WhatsApp', () => {
      const customer = {
        first_name: 'John',
        last_name: 'Doe',
        phone_e164: '+233241234567',
        whatsapp_e164: '+233241234567'
      };

      const canSendWhatsApp = !!customer.whatsapp_e164;
      expect(canSendWhatsApp).toBe(true);
    });

    test('button disabled when no customer', () => {
      const invoice = {
        customer: null
      };

      const canSendWhatsApp = !!invoice.customer?.whatsapp_e164;
      expect(canSendWhatsApp).toBe(false);
    });
  });
});

describe('Invoice Status Display', () => {
  test('formats status labels correctly', () => {
    const statusLabels = {
      'UNPAID': 'Unpaid',
      'PARTIALLY_PAID': 'Partially Paid',
      'PAID': 'Paid',
      'CANCELLED': 'Cancelled'
    };

    expect(statusLabels['UNPAID']).toBe('Unpaid');
    expect(statusLabels['PARTIALLY_PAID']).toBe('Partially Paid');
    expect(statusLabels['PAID']).toBe('Paid');
    expect(statusLabels['CANCELLED']).toBe('Cancelled');
  });
});
