/**
 * Customer Import Controller
 *
 * Bulk import customers from CSV/Excel with duplicate merge support
 */

const { Customer, CustomerMergeLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const multer = require('multer');
const csvParser = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizePhone, normalizeEmail, normalizeCustomerContacts } = require('../utils/phoneNormalizer');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Configure multer
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

// Field metadata for mapping UI
const IMPORT_FIELDS = {
  firstName: { label: 'First Name', required: false },
  lastName: { label: 'Last Name', required: false },
  companyName: { label: 'Company Name', required: false },
  phoneRaw: { label: 'Phone', required: false },
  whatsappRaw: { label: 'WhatsApp', required: false },
  whatsappSameAsPhone: { label: 'WhatsApp Same as Phone', type: 'boolean', required: false },
  email: { label: 'Email', required: false },
  address: { label: 'Address', required: false },
  heardAboutUs: { label: 'Heard About Us', required: false, options: Customer.HEARD_ABOUT_US_OPTIONS },
  heardAboutUsOtherText: { label: 'Heard About Us (Other)', required: false },
  tags: { label: 'Tags', required: false, type: 'array', delimiter: ',' },
  notes: { label: 'Notes', required: false }
};

/**
 * Parse CSV file
 */
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

/**
 * Parse Excel file
 */
function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
}

/**
 * Auto-detect column mappings
 */
function autoDetectColumns(headers) {
  const mappings = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));

  const patterns = {
    firstName: ['firstname', 'first', 'fname', 'givenname'],
    lastName: ['lastname', 'last', 'lname', 'surname', 'familyname'],
    companyName: ['company', 'companyname', 'business', 'organization', 'org'],
    phoneRaw: ['phone', 'phonenumber', 'mobile', 'cell', 'telephone', 'tel'],
    whatsappRaw: ['whatsapp', 'wa', 'whatsappnumber'],
    email: ['email', 'emailaddress', 'mail'],
    address: ['address', 'location', 'streetaddress'],
    heardAboutUs: ['heardaboutus', 'source', 'howyoufoundus', 'referral', 'channel'],
    tags: ['tags', 'labels', 'categories'],
    notes: ['notes', 'comments', 'remarks', 'description']
  };

  for (const [field, keywords] of Object.entries(patterns)) {
    for (let i = 0; i < headers.length; i++) {
      if (keywords.includes(lowerHeaders[i])) {
        mappings[field] = headers[i];
        break;
      }
    }
  }

  return mappings;
}

/**
 * Transform row using mapping
 */
function transformRow(row, mapping, constantValues = {}) {
  const result = {};

  // Apply mappings
  for (const [field, sourceColumn] of Object.entries(mapping)) {
    if (sourceColumn && sourceColumn !== '__ignore__' && row[sourceColumn] !== undefined) {
      let value = row[sourceColumn];

      // Handle boolean
      if (IMPORT_FIELDS[field]?.type === 'boolean') {
        value = ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
      }

      // Handle array (tags)
      if (IMPORT_FIELDS[field]?.type === 'array' && typeof value === 'string') {
        value = value.split(IMPORT_FIELDS[field].delimiter || ',').map(v => v.trim()).filter(Boolean);
      }

      result[field] = value;
    }
  }

  // Apply constant values
  for (const [field, value] of Object.entries(constantValues)) {
    if (value != null && value !== '') {
      result[field] = value;
    }
  }

  return result;
}

/**
 * Validate a single row
 */
function validateRow(data) {
  const errors = [];

  // Must have firstName or companyName
  if (!data.firstName?.trim() && !data.companyName?.trim()) {
    errors.push('Either firstName or companyName is required');
  }

  // Validate heardAboutUs if provided
  if (data.heardAboutUs && !Customer.HEARD_ABOUT_US_OPTIONS.includes(data.heardAboutUs)) {
    errors.push(`Invalid heardAboutUs value: ${data.heardAboutUs}`);
  }

  // Validate email format if provided
  if (data.email) {
    const emailResult = normalizeEmail(data.email);
    if (!emailResult.isValid) {
      errors.push(`Invalid email format: ${data.email}`);
    }
  }

  return errors;
}

/**
 * POST /api/v1/customers/import/preview
 * Step 1: Upload file and get preview
 */
exports.previewFile = [
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' }
      });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    try {
      let data = [];

      if (fileExt === '.csv') {
        data = await parseCSV(filePath);
      } else {
        data = parseExcel(filePath);
      }

      const headers = data.length > 0 ? Object.keys(data[0]) : [];
      const suggestedMappings = autoDetectColumns(headers);
      const preview = data.slice(0, 20);
      const fileId = path.basename(filePath);

      res.json({
        success: true,
        data: {
          fileId,
          fileName: req.file.originalname,
          totalRows: data.length,
          headers,
          preview,
          suggestedMappings,
          fieldMetadata: IMPORT_FIELDS,
          heardAboutUsOptions: Customer.HEARD_ABOUT_US_OPTIONS
        }
      });
    } catch (error) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        error: { code: 'PARSE_ERROR', message: 'Failed to parse file: ' + error.message }
      });
    }
  })
];

/**
 * POST /api/v1/customers/import/validate
 * Step 2: Validate rows with mapping
 */
exports.validateImport = asyncHandler(async (req, res) => {
  const { fileId, mapping, constantValues = {} } = req.body;

  if (!fileId || !mapping) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PARAMS', message: 'fileId and mapping are required' }
    });
  }

  const filePath = path.join('uploads', fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_NOT_FOUND', message: 'Upload file not found. Please upload again.' }
    });
  }

  try {
    const fileExt = path.extname(filePath);
    let data = fileExt === '.csv' || !fileExt ? await parseCSV(filePath) : parseExcel(filePath);

    const validationResults = [];
    const transformedRows = [];

    for (let i = 0; i < data.length; i++) {
      const rowNumber = i + 2; // Excel-style (1-indexed + header)
      const row = data[i];
      const transformed = transformRow(row, mapping, constantValues);
      const errors = validateRow(transformed);

      // Check for duplicates
      const contacts = normalizeCustomerContacts(transformed);
      let duplicateInfo = null;

      if (contacts.phoneE164 || contacts.whatsappE164 || contacts.emailLower) {
        const orConditions = [];
        if (contacts.phoneE164) orConditions.push({ phone_e164: contacts.phoneE164 });
        if (contacts.whatsappE164 && contacts.whatsappE164 !== contacts.phoneE164) {
          orConditions.push({ whatsapp_e164: contacts.whatsappE164 });
        }
        if (contacts.emailLower) orConditions.push({ email_lower: contacts.emailLower });

        if (orConditions.length > 0) {
          const existing = await Customer.findOne({ where: { [Op.or]: orConditions } });
          if (existing) {
            duplicateInfo = {
              existingId: existing.id,
              displayName: existing.getDisplayName(),
              matchedOn: []
            };
            if (contacts.phoneE164 && existing.phone_e164 === contacts.phoneE164) {
              duplicateInfo.matchedOn.push('phone');
            }
            if (contacts.whatsappE164 && existing.whatsapp_e164 === contacts.whatsappE164) {
              duplicateInfo.matchedOn.push('whatsapp');
            }
            if (contacts.emailLower && existing.email_lower === contacts.emailLower) {
              duplicateInfo.matchedOn.push('email');
            }
          }
        }
      }

      validationResults.push({
        rowNumber,
        errors,
        hasDuplicate: !!duplicateInfo,
        duplicate: duplicateInfo,
        preview: transformed
      });

      if (errors.length === 0) {
        transformedRows.push({
          ...transformed,
          _rowNumber: rowNumber,
          _duplicate: duplicateInfo
        });
      }
    }

    const validCount = validationResults.filter(r => r.errors.length === 0).length;
    const duplicateCount = validationResults.filter(r => r.hasDuplicate).length;
    const errorCount = validationResults.filter(r => r.errors.length > 0).length;

    res.json({
      success: true,
      data: {
        totalRows: data.length,
        validRows: validCount,
        duplicateRows: duplicateCount,
        errorRows: errorCount,
        validationResults: validationResults.slice(0, 100), // Limit for response size
        validPreview: transformedRows.slice(0, 20)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed: ' + error.message }
    });
  }
});

/**
 * POST /api/v1/customers/import/commit
 * Step 3: Commit the import
 */
exports.commitImport = asyncHandler(async (req, res) => {
  const { fileId, mapping, constantValues = {}, duplicateAction = 'merge' } = req.body;
  // duplicateAction: 'merge' (default), 'skip', 'error'

  if (!fileId || !mapping) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PARAMS', message: 'fileId and mapping are required' }
    });
  }

  const filePath = path.join('uploads', fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_NOT_FOUND', message: 'Upload file not found.' }
    });
  }

  try {
    const fileExt = path.extname(filePath);
    let data = fileExt === '.csv' || !fileExt ? await parseCSV(filePath) : parseExcel(filePath);

    const results = {
      created: [],
      merged: [],
      skipped: [],
      failed: []
    };

    for (let i = 0; i < data.length; i++) {
      const rowNumber = i + 2;
      const row = data[i];
      const transformed = transformRow(row, mapping, constantValues);
      const errors = validateRow(transformed);

      if (errors.length > 0) {
        results.failed.push({ rowNumber, errors, data: transformed });
        continue;
      }

      const contacts = normalizeCustomerContacts(transformed);

      // Check for existing customer
      let existingCustomer = null;
      if (contacts.phoneE164 || contacts.whatsappE164 || contacts.emailLower) {
        const orConditions = [];
        if (contacts.phoneE164) orConditions.push({ phone_e164: contacts.phoneE164 });
        if (contacts.whatsappE164 && contacts.whatsappE164 !== contacts.phoneE164) {
          orConditions.push({ whatsapp_e164: contacts.whatsappE164 });
        }
        if (contacts.emailLower) orConditions.push({ email_lower: contacts.emailLower });

        if (orConditions.length > 0) {
          existingCustomer = await Customer.findOne({ where: { [Op.or]: orConditions } });
        }
      }

      if (existingCustomer) {
        // Handle duplicate
        if (duplicateAction === 'skip') {
          results.skipped.push({
            rowNumber,
            existingCustomerId: existingCustomer.id,
            displayName: existingCustomer.getDisplayName()
          });
          continue;
        }

        if (duplicateAction === 'error') {
          results.failed.push({
            rowNumber,
            errors: [`Duplicate customer found: ${existingCustomer.getDisplayName()} (ID: ${existingCustomer.id})`],
            data: transformed
          });
          continue;
        }

        // Merge (default)
        try {
          const diff = await mergeCustomerData(existingCustomer, transformed, req.user?.id);
          results.merged.push({
            rowNumber,
            customerId: existingCustomer.id,
            displayName: existingCustomer.getDisplayName(),
            diff
          });
        } catch (mergeError) {
          results.failed.push({
            rowNumber,
            errors: [`Merge failed: ${mergeError.message}`],
            data: transformed
          });
        }
      } else {
        // Create new customer
        try {
          const customer = await Customer.create({
            first_name: transformed.firstName,
            last_name: transformed.lastName,
            company_name: transformed.companyName,
            phone_raw: transformed.phoneRaw,
            whatsapp_raw: transformed.whatsappRaw,
            whatsapp_same_as_phone: transformed.whatsappSameAsPhone || false,
            email: transformed.email,
            address: transformed.address,
            heard_about_us: transformed.heardAboutUs,
            heard_about_us_other_text: transformed.heardAboutUsOtherText,
            tags: transformed.tags || [],
            notes: transformed.notes,
            created_by: req.user?.id,
            updated_by: req.user?.id
          });

          results.created.push({
            rowNumber,
            customerId: customer.id,
            displayName: customer.getDisplayName()
          });
        } catch (createError) {
          results.failed.push({
            rowNumber,
            errors: [createError.message],
            data: transformed
          });
        }
      }
    }

    // Clean up file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      data: {
        summary: {
          total: data.length,
          created: results.created.length,
          merged: results.merged.length,
          skipped: results.skipped.length,
          failed: results.failed.length
        },
        results
      },
      message: `Import complete: ${results.created.length} created, ${results.merged.length} merged, ${results.skipped.length} skipped, ${results.failed.length} failed`
    });
  } catch (error) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return res.status(500).json({
      success: false,
      error: { code: 'IMPORT_ERROR', message: 'Import failed: ' + error.message }
    });
  }
});

/**
 * Merge incoming data into existing customer
 */
async function mergeCustomerData(existing, incoming, userId) {
  const diff = {};
  const updates = {};

  const fieldMap = {
    firstName: 'first_name',
    lastName: 'last_name',
    companyName: 'company_name',
    phoneRaw: 'phone_raw',
    whatsappRaw: 'whatsapp_raw',
    whatsappSameAsPhone: 'whatsapp_same_as_phone',
    email: 'email',
    address: 'address',
    heardAboutUs: 'heard_about_us',
    heardAboutUsOtherText: 'heard_about_us_other_text'
  };

  // Fill blanks from incoming
  for (const [incomingKey, dbKey] of Object.entries(fieldMap)) {
    const incomingValue = incoming[incomingKey];
    const existingValue = existing[dbKey];

    if (!existingValue && incomingValue) {
      updates[dbKey] = incomingValue;
      diff[dbKey] = { from: existingValue, to: incomingValue };
    }
  }

  // Tags: union
  const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
  const incomingTags = Array.isArray(incoming.tags) ? incoming.tags : [];
  const mergedTags = [...new Set([...existingTags, ...incomingTags])];
  if (JSON.stringify(mergedTags) !== JSON.stringify(existingTags)) {
    updates.tags = mergedTags;
    diff.tags = { from: existingTags, to: mergedTags };
  }

  // Notes: append
  if (incoming.notes?.trim()) {
    const timestamp = new Date().toISOString();
    const separator = existing.notes ? '\n\n---\n' : '';
    updates.notes = `${existing.notes || ''}${separator}[Import ${timestamp}]\n${incoming.notes}`;
    diff.notes = { appended: incoming.notes };
  }

  updates.updated_by = userId;

  // Apply updates
  if (Object.keys(diff).length > 0) {
    await existing.update(updates);

    // Create merge log
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(incoming))
      .digest('hex')
      .substring(0, 64);

    await CustomerMergeLog.create({
      merged_into_customer_id: existing.id,
      merged_from_payload_hash: payloadHash,
      merged_by_user_id: userId,
      diff_json: diff
    });
  }

  return diff;
}

module.exports = exports;
