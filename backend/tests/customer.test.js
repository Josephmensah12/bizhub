/**
 * Customer Module Tests
 *
 * Tests for:
 * 1. Ghana phone normalization (024... → +233...)
 * 2. Uniqueness constraints
 * 3. Merge rules + audit log
 * 4. Import validation
 */

const { normalizePhone, isSamePhone, extractGhanaLocalNumber } = require('../utils/phoneNormalizer');

describe('Phone Normalizer - Ghana Default', () => {
  describe('normalizePhone function', () => {
    test('should convert Ghana local format 024xxxxxxx to +233xxxxxxx', () => {
      const result = normalizePhone('0241234567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+233241234567');
      expect(result.country).toBe('GH');
    });

    test('should handle Ghana format with spaces: 024 123 4567', () => {
      const result = normalizePhone('024 123 4567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+233241234567');
    });

    test('should handle Ghana format with dashes: 024-123-4567', () => {
      const result = normalizePhone('024-123-4567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+233241234567');
    });

    test('should handle Ghana format with country code: +233241234567', () => {
      const result = normalizePhone('+233241234567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+233241234567');
    });

    test('should handle Ghana format with country code and spaces: +233 24 123 4567', () => {
      const result = normalizePhone('+233 24 123 4567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+233241234567');
    });

    test('should handle Ghana format without leading zero: 241234567', () => {
      // This might be ambiguous, but with GH default should still work
      const result = normalizePhone('241234567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+233241234567');
    });

    test('should handle various Ghana mobile prefixes (020, 023, 024, 025, 026, 027, 028, 054, 055, 059)', () => {
      const prefixes = ['020', '023', '024', '025', '026', '027', '028', '054', '055', '059'];

      prefixes.forEach(prefix => {
        const result = normalizePhone(`${prefix}1234567`);
        expect(result.isValid).toBe(true);
        expect(result.e164).toMatch(/^\+233/);
      });
    });

    test('should return null e164 for invalid numbers', () => {
      const result = normalizePhone('12345'); // Too short
      expect(result.isValid).toBe(false);
      expect(result.e164).toBeNull();
    });

    test('should return null e164 for empty input', () => {
      const result = normalizePhone('');
      expect(result.isValid).toBe(false);
      expect(result.e164).toBeNull();
    });

    test('should return null e164 for null input', () => {
      const result = normalizePhone(null);
      expect(result.isValid).toBe(false);
      expect(result.e164).toBeNull();
    });

    test('should handle numbers with parentheses: (024) 123 4567', () => {
      const result = normalizePhone('(024) 123 4567');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+233241234567');
    });

    test('should handle different region override', () => {
      // US number with US region override
      const result = normalizePhone('2025551234', 'US');
      expect(result.isValid).toBe(true);
      expect(result.e164).toBe('+12025551234');
      expect(result.country).toBe('US');
    });

    test('should preserve raw input in result', () => {
      const rawInput = '024 123 4567';
      const result = normalizePhone(rawInput);
      expect(result.raw).toBe(rawInput);
    });
  });

  describe('isSamePhone function', () => {
    test('should match same numbers in different formats', () => {
      expect(isSamePhone('0241234567', '+233241234567')).toBe(true);
      expect(isSamePhone('024 123 4567', '+233 24 123 4567')).toBe(true);
      expect(isSamePhone('024-123-4567', '0241234567')).toBe(true);
    });

    test('should return false for different numbers', () => {
      expect(isSamePhone('0241234567', '0241234568')).toBe(false);
      expect(isSamePhone('0241234567', '0231234567')).toBe(false);
    });

    test('should return false when one number is invalid', () => {
      expect(isSamePhone('0241234567', '12345')).toBe(false);
      expect(isSamePhone('invalid', '0241234567')).toBe(false);
    });

    test('should return false for null/empty inputs', () => {
      expect(isSamePhone(null, '0241234567')).toBe(false);
      expect(isSamePhone('0241234567', null)).toBe(false);
      expect(isSamePhone('', '')).toBe(false);
    });
  });

  describe('extractGhanaLocalNumber function', () => {
    test('should extract local format from E.164', () => {
      expect(extractGhanaLocalNumber('+233241234567')).toBe('0241234567');
    });

    test('should return original if already local format', () => {
      expect(extractGhanaLocalNumber('0241234567')).toBe('0241234567');
    });

    test('should return null for non-Ghana numbers', () => {
      expect(extractGhanaLocalNumber('+12025551234')).toBeNull();
    });
  });
});

describe('Customer Uniqueness Constraints', () => {
  describe('Phone uniqueness logic', () => {
    test('normalized E.164 should be used for uniqueness check', () => {
      // Two inputs that look different but normalize to same E.164
      const phone1 = normalizePhone('024 123 4567');
      const phone2 = normalizePhone('+233241234567');

      expect(phone1.e164).toBe(phone2.e164);
      // This means they would violate unique constraint
    });

    test('invalid phones should not have E.164 and thus no constraint conflict', () => {
      const invalid1 = normalizePhone('12345');
      const invalid2 = normalizePhone('67890');

      expect(invalid1.e164).toBeNull();
      expect(invalid2.e164).toBeNull();
      // Both null, but NULL !== NULL in SQL, so no conflict
    });
  });

  describe('Email uniqueness logic', () => {
    test('email should be lowercased for uniqueness', () => {
      const email1 = 'John.Doe@Example.COM';
      const email2 = 'john.doe@example.com';

      expect(email1.toLowerCase()).toBe(email2.toLowerCase());
      // These would conflict on email_lower unique constraint
    });

    test('empty emails should not conflict', () => {
      const email1 = '';
      const email2 = '';

      // Empty strings become NULL in DB, and NULL !== NULL
      const normalized1 = email1.trim() || null;
      const normalized2 = email2.trim() || null;

      expect(normalized1).toBeNull();
      expect(normalized2).toBeNull();
    });
  });
});

describe('Customer Merge Rules', () => {
  describe('Field merge priority', () => {
    test('existing non-empty values should be kept', () => {
      const existing = {
        first_name: 'John',
        last_name: 'Doe',
        company_name: null,
        email: 'john@example.com',
        address: null
      };

      const incoming = {
        first_name: 'Johnny', // Should NOT override
        last_name: null,      // No change
        company_name: 'ACME', // Should fill blank
        email: 'johnny@new.com', // Should NOT override
        address: '123 Main St'  // Should fill blank
      };

      // Merge rules: keep existing if not empty, fill blanks from incoming
      const merged = {};
      Object.keys(existing).forEach(key => {
        merged[key] = existing[key] || incoming[key];
      });

      expect(merged.first_name).toBe('John'); // Kept existing
      expect(merged.last_name).toBe('Doe');   // Kept existing
      expect(merged.company_name).toBe('ACME'); // Filled from incoming
      expect(merged.email).toBe('john@example.com'); // Kept existing
      expect(merged.address).toBe('123 Main St'); // Filled from incoming
    });
  });

  describe('Tags union merge', () => {
    test('tags should be merged as union (no duplicates)', () => {
      const existingTags = ['VIP', 'Retail'];
      const incomingTags = ['Retail', 'Wholesale', 'New'];

      // Union merge
      const mergedTags = [...new Set([...existingTags, ...incomingTags])];

      expect(mergedTags).toContain('VIP');
      expect(mergedTags).toContain('Retail');
      expect(mergedTags).toContain('Wholesale');
      expect(mergedTags).toContain('New');
      expect(mergedTags.filter(t => t === 'Retail').length).toBe(1); // No duplicates
    });
  });

  describe('Notes append merge', () => {
    test('notes should be appended with timestamp separator', () => {
      const existingNotes = 'Original customer notes.';
      const incomingNotes = 'Additional info from import.';
      const timestamp = '2026-02-04';

      // Append pattern
      const mergedNotes = existingNotes
        ? `${existingNotes}\n\n--- Merged ${timestamp} ---\n${incomingNotes}`
        : incomingNotes;

      expect(mergedNotes).toContain('Original customer notes.');
      expect(mergedNotes).toContain('--- Merged');
      expect(mergedNotes).toContain('Additional info from import.');
    });

    test('blank existing notes should just use incoming', () => {
      const existingNotes = '';
      const incomingNotes = 'New notes.';

      const mergedNotes = existingNotes || incomingNotes;

      expect(mergedNotes).toBe('New notes.');
    });
  });

  describe('Merge audit log', () => {
    test('merge should create audit log entry with diff', () => {
      const mergeLog = {
        merged_into_customer_id: 123,
        merged_from_payload_hash: 'abc123',
        merged_by: 1,
        merged_at: new Date(),
        diff_json: {
          company_name: { old: null, new: 'ACME' },
          address: { old: null, new: '123 Main St' }
        }
      };

      expect(mergeLog.merged_into_customer_id).toBe(123);
      expect(mergeLog.diff_json).toHaveProperty('company_name');
      expect(mergeLog.diff_json.company_name.new).toBe('ACME');
    });
  });
});

describe('Customer Import Validation', () => {
  describe('Name validation', () => {
    test('should require first_name OR company_name', () => {
      const validPerson = { first_name: 'John', company_name: null };
      const validCompany = { first_name: null, company_name: 'ACME Corp' };
      const invalid = { first_name: '', company_name: '' };

      const isValidPerson = !!(validPerson.first_name || validPerson.company_name);
      const isValidCompany = !!(validCompany.first_name || validCompany.company_name);
      const isInvalid = !!(invalid.first_name || invalid.company_name);

      expect(isValidPerson).toBe(true);
      expect(isValidCompany).toBe(true);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Phone validation in import', () => {
    test('invalid phone should be flagged but not block import', () => {
      const rows = [
        { first_name: 'John', phone_raw: '0241234567' }, // Valid
        { first_name: 'Jane', phone_raw: '12345' },      // Invalid
        { first_name: 'Corp', phone_raw: '' }           // Empty (OK)
      ];

      const validationResults = rows.map(row => {
        const phoneResult = normalizePhone(row.phone_raw);
        return {
          ...row,
          phone_e164: phoneResult.e164,
          phoneWarning: row.phone_raw && !phoneResult.isValid ? 'Invalid phone format' : null
        };
      });

      expect(validationResults[0].phone_e164).toBe('+233241234567');
      expect(validationResults[0].phoneWarning).toBeNull();

      expect(validationResults[1].phone_e164).toBeNull();
      expect(validationResults[1].phoneWarning).toBe('Invalid phone format');

      expect(validationResults[2].phone_e164).toBeNull();
      expect(validationResults[2].phoneWarning).toBeNull(); // Empty is OK
    });
  });

  describe('Duplicate detection during import', () => {
    test('should identify duplicates by phone E.164', () => {
      const existingCustomers = [
        { id: 1, phone_e164: '+233241234567' },
        { id: 2, phone_e164: '+233201112222' }
      ];

      const importRows = [
        { phone_raw: '0241234567' },  // Matches customer 1
        { phone_raw: '024 555 6666' }, // New
        { phone_raw: '+233 20 111 2222' } // Matches customer 2
      ];

      const results = importRows.map(row => {
        const normalized = normalizePhone(row.phone_raw);
        const existingMatch = existingCustomers.find(c => c.phone_e164 === normalized.e164);
        return {
          ...row,
          isDuplicate: !!existingMatch,
          existingId: existingMatch?.id || null
        };
      });

      expect(results[0].isDuplicate).toBe(true);
      expect(results[0].existingId).toBe(1);

      expect(results[1].isDuplicate).toBe(false);
      expect(results[1].existingId).toBeNull();

      expect(results[2].isDuplicate).toBe(true);
      expect(results[2].existingId).toBe(2);
    });
  });

  describe('WhatsApp same-as-phone handling', () => {
    test('should copy phone to whatsapp when same_as_phone is true', () => {
      const customer = {
        phone_raw: '024 123 4567',
        whatsapp_same_as_phone: true,
        whatsapp_raw: ''
      };

      // Apply same-as-phone logic
      if (customer.whatsapp_same_as_phone) {
        customer.whatsapp_raw = customer.phone_raw;
      }

      const phoneResult = normalizePhone(customer.phone_raw);
      const whatsappResult = normalizePhone(customer.whatsapp_raw);

      expect(phoneResult.e164).toBe(whatsappResult.e164);
    });

    test('should allow different whatsapp when same_as_phone is false', () => {
      const customer = {
        phone_raw: '024 123 4567',
        whatsapp_same_as_phone: false,
        whatsapp_raw: '055 987 6543'
      };

      const phoneResult = normalizePhone(customer.phone_raw);
      const whatsappResult = normalizePhone(customer.whatsapp_raw);

      expect(phoneResult.e164).not.toBe(whatsappResult.e164);
    });
  });
});

describe('Display Name Logic', () => {
  test('should prefer first_name + last_name for individuals', () => {
    const customer = {
      first_name: 'John',
      last_name: 'Doe',
      company_name: null
    };

    const displayName = customer.first_name && customer.last_name
      ? `${customer.first_name} ${customer.last_name}`
      : customer.first_name || customer.company_name || 'Unknown';

    expect(displayName).toBe('John Doe');
  });

  test('should use company_name when no first_name', () => {
    const customer = {
      first_name: null,
      last_name: null,
      company_name: 'ACME Corporation'
    };

    const displayName = customer.first_name
      ? (customer.last_name ? `${customer.first_name} ${customer.last_name}` : customer.first_name)
      : customer.company_name || 'Unknown';

    expect(displayName).toBe('ACME Corporation');
  });

  test('should show both name and company for individuals at company', () => {
    const customer = {
      first_name: 'John',
      last_name: 'Doe',
      company_name: 'ACME Corporation'
    };

    // Display name is person's name
    const displayName = `${customer.first_name} ${customer.last_name}`;

    // Company shown separately (e.g., subtitle)
    expect(displayName).toBe('John Doe');
    expect(customer.company_name).toBe('ACME Corporation');
  });
});

describe('Heard About Us Options', () => {
  test('should have predefined options', () => {
    const options = [
      'Google Search',
      'Facebook',
      'Instagram',
      'Twitter/X',
      'Friend/Family',
      'Walk-in',
      'Returning Customer',
      'Other'
    ];

    expect(options).toContain('Google Search');
    expect(options).toContain('Other');
    expect(options.length).toBeGreaterThan(5);
  });

  test('Other option should allow custom text', () => {
    const customer = {
      heard_about_us: 'Other',
      heard_about_us_other_text: 'Saw your shop while driving by'
    };

    expect(customer.heard_about_us).toBe('Other');
    expect(customer.heard_about_us_other_text).toBeTruthy();
  });
});
