/**
 * Customer Controller
 *
 * CRUD + merge + duplicate detection + bulk import
 */

const { Customer, CustomerMergeLog, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const { normalizePhone, normalizeEmail, normalizeCustomerContacts } = require('../utils/phoneNormalizer');
const crypto = require('crypto');

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/v1/customers
 * List customers with pagination, search, and filters
 */
exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = '',
    heardAboutUs,
    tags,
    missingPhone,
    missingEmail,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = req.query;

  const offset = (page - 1) * limit;

  // Build where clause
  const where = {};

  if (search) {
    where[Op.or] = [
      { first_name: { [Op.iLike]: `%${search}%` } },
      { last_name: { [Op.iLike]: `%${search}%` } },
      { company_name: { [Op.iLike]: `%${search}%` } },
      { phone_raw: { [Op.iLike]: `%${search}%` } },
      { phone_e164: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } }
    ];
  }

  if (heardAboutUs) {
    where.heard_about_us = heardAboutUs;
  }

  if (tags) {
    // Filter by tags (array contains)
    const tagList = Array.isArray(tags) ? tags : [tags];
    where.tags = { [Op.contains]: tagList };
  }

  if (missingPhone === 'true') {
    where.phone_e164 = { [Op.is]: null };
  }

  if (missingEmail === 'true') {
    where.email_lower = { [Op.is]: null };
  }

  const { count, rows } = await Customer.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[sortBy, sortOrder]],
    include: [
      { model: User, as: 'creator', attributes: ['id', 'full_name'] },
      { model: User, as: 'updater', attributes: ['id', 'full_name'] }
    ]
  });

  // Add display name to each customer
  const customers = rows.map(c => ({
    ...c.toJSON(),
    displayName: c.getDisplayName()
  }));

  res.json({
    success: true,
    data: {
      customers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    }
  });
});

/**
 * GET /api/v1/customers/options
 * Get dropdown options (heardAboutUs, tags)
 */
exports.getOptions = asyncHandler(async (req, res) => {
  // Get unique tags from all customers
  const tagsResult = await Customer.findAll({
    attributes: ['tags'],
    where: { tags: { [Op.ne]: null } },
    raw: true
  });

  // Flatten and dedupe tags
  const allTags = new Set();
  tagsResult.forEach(c => {
    if (Array.isArray(c.tags)) {
      c.tags.forEach(t => allTags.add(t));
    }
  });

  res.json({
    success: true,
    data: {
      heardAboutUsOptions: Customer.HEARD_ABOUT_US_OPTIONS,
      existingTags: Array.from(allTags).sort()
    }
  });
});

/**
 * GET /api/v1/customers/:id
 * Get single customer by ID
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const customer = await Customer.findByPk(id, {
    include: [
      { model: User, as: 'creator', attributes: ['id', 'full_name', 'email'] },
      { model: User, as: 'updater', attributes: ['id', 'full_name', 'email'] }
    ]
  });

  if (!customer) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Customer not found'
      }
    });
  }

  // Get merge history
  const mergeHistory = await CustomerMergeLog.findAll({
    where: { merged_into_customer_id: id },
    include: [
      { model: User, as: 'mergedBy', attributes: ['id', 'full_name'] }
    ],
    order: [['merged_at', 'DESC']],
    limit: 10
  });

  res.json({
    success: true,
    data: {
      customer: {
        ...customer.toJSON(),
        displayName: customer.getDisplayName()
      },
      mergeHistory
    }
  });
});

/**
 * POST /api/v1/customers/check-duplicate
 * Check for duplicate customers by phone/email
 */
exports.checkDuplicate = asyncHandler(async (req, res) => {
  // Support both camelCase and snake_case
  const { phoneRaw, whatsappRaw, email, excludeId, phone_raw, whatsapp_raw, phone } = req.body;

  // Normalize - also accept "phone" as alias for phoneRaw
  const _phoneRaw = phoneRaw || phone_raw || phone;
  const _whatsappRaw = whatsappRaw || whatsapp_raw;

  const duplicates = await findDuplicates({ phoneRaw: _phoneRaw, whatsappRaw: _whatsappRaw, email }, excludeId);

  const hasDupes = duplicates.length > 0;
  const firstDupe = hasDupes ? duplicates[0] : null;

  res.json({
    success: true,
    data: {
      hasDuplicates: hasDupes,
      isDuplicate: hasDupes, // Alias for frontend compatibility
      matchedBy: firstDupe?._matchedOn?.join(', ') || null,
      existingCustomer: firstDupe ? {
        id: firstDupe.id,
        displayName: firstDupe.getDisplayName(),
        phone_e164: firstDupe.phone_e164,
        email: firstDupe.email
      } : null,
      duplicates: duplicates.map(d => ({
        id: d.id,
        displayName: d.getDisplayName(),
        phone: d.phone_e164,
        email: d.email,
        matchedOn: d._matchedOn
      }))
    }
  });
});

/**
 * Find duplicate customers by normalized contact fields
 */
async function findDuplicates(data, excludeId = null) {
  const contacts = normalizeCustomerContacts(data);
  const orConditions = [];

  if (contacts.phoneE164) {
    orConditions.push({ phone_e164: contacts.phoneE164 });
  }

  if (contacts.whatsappE164 && contacts.whatsappE164 !== contacts.phoneE164) {
    orConditions.push({ whatsapp_e164: contacts.whatsappE164 });
  }

  if (contacts.emailLower) {
    orConditions.push({ email_lower: contacts.emailLower });
  }

  if (orConditions.length === 0) {
    return [];
  }

  const where = { [Op.or]: orConditions };
  if (excludeId) {
    where.id = { [Op.ne]: excludeId };
  }

  const duplicates = await Customer.findAll({ where });

  // Mark what field matched
  return duplicates.map(d => {
    const matched = [];
    if (contacts.phoneE164 && d.phone_e164 === contacts.phoneE164) matched.push('phone');
    if (contacts.whatsappE164 && d.whatsapp_e164 === contacts.whatsappE164) matched.push('whatsapp');
    if (contacts.emailLower && d.email_lower === contacts.emailLower) matched.push('email');
    d._matchedOn = matched;
    return d;
  });
}

/**
 * POST /api/v1/customers
 * Create new customer
 */
exports.create = asyncHandler(async (req, res) => {
  // Support both camelCase and snake_case field names
  const {
    firstName, lastName, companyName,
    phoneRaw, whatsappRaw, whatsappSameAsPhone,
    email, address,
    heardAboutUs, heardAboutUsOtherText,
    tags, notes,
    skipDuplicateCheck,
    // Also accept snake_case from frontend
    first_name, last_name, company_name,
    phone_raw, whatsapp_raw, whatsapp_same_as_phone,
    heard_about_us, heard_about_us_other_text
  } = req.body;

  // Normalize to use whichever format was provided
  const _firstName = firstName || first_name;
  const _lastName = lastName || last_name;
  const _companyName = companyName || company_name;
  const _phoneRaw = phoneRaw || phone_raw;
  const _whatsappRaw = whatsappRaw || whatsapp_raw;
  const _whatsappSameAsPhone = whatsappSameAsPhone ?? whatsapp_same_as_phone;
  const _heardAboutUs = heardAboutUs || heard_about_us;
  const _heardAboutUsOtherText = heardAboutUsOtherText || heard_about_us_other_text;

  // Check for duplicates unless explicitly skipped
  if (!skipDuplicateCheck) {
    const duplicates = await findDuplicates({ phoneRaw: _phoneRaw, whatsappRaw: _whatsappRaw, email });
    if (duplicates.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_EXISTS',
          message: 'A customer with matching contact info already exists',
          duplicates: duplicates.map(d => ({
            id: d.id,
            displayName: d.getDisplayName(),
            phone: d.phone_e164,
            email: d.email,
            matchedOn: d._matchedOn
          }))
        }
      });
    }
  }

  try {
    const customer = await Customer.create({
      first_name: _firstName,
      last_name: _lastName,
      company_name: _companyName,
      phone_raw: _phoneRaw,
      whatsapp_raw: _whatsappRaw,
      whatsapp_same_as_phone: _whatsappSameAsPhone || false,
      email,
      address,
      heard_about_us: _heardAboutUs,
      heard_about_us_other_text: _heardAboutUsOtherText,
      tags: tags || [],
      notes,
      created_by: req.user?.id,
      updated_by: req.user?.id
    });

    res.status(201).json({
      success: true,
      data: {
        customer: {
          ...customer.toJSON(),
          displayName: customer.getDisplayName()
        }
      },
      message: 'Customer created successfully'
    });
  } catch (error) {
    // Handle unique constraint violations
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'contact';
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_CONTACT',
          message: `A customer with this ${field.replace('_e164', '').replace('_lower', '')} already exists`
        }
      });
    }
    throw error;
  }
});

/**
 * PUT /api/v1/customers/:id
 * Update customer
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Support both camelCase and snake_case field names
  const {
    firstName, lastName, companyName,
    phoneRaw, whatsappRaw, whatsappSameAsPhone,
    email, address,
    heardAboutUs, heardAboutUsOtherText,
    tags, notes,
    skipDuplicateCheck,
    // Also accept snake_case from frontend
    first_name, last_name, company_name,
    phone_raw, whatsapp_raw, whatsapp_same_as_phone,
    heard_about_us, heard_about_us_other_text
  } = req.body;

  // Normalize to use whichever format was provided
  const _firstName = firstName || first_name;
  const _lastName = lastName || last_name;
  const _companyName = companyName || company_name;
  const _phoneRaw = phoneRaw || phone_raw;
  const _whatsappRaw = whatsappRaw || whatsapp_raw;
  const _whatsappSameAsPhone = whatsappSameAsPhone ?? whatsapp_same_as_phone;
  const _heardAboutUs = heardAboutUs || heard_about_us;
  const _heardAboutUsOtherText = heardAboutUsOtherText || heard_about_us_other_text;

  const customer = await Customer.findByPk(id);

  if (!customer) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Customer not found'
      }
    });
  }

  // Check for duplicates (exclude current customer)
  if (!skipDuplicateCheck) {
    const duplicates = await findDuplicates({ phoneRaw: _phoneRaw, whatsappRaw: _whatsappRaw, email }, id);
    if (duplicates.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_EXISTS',
          message: 'Another customer with matching contact info already exists',
          duplicates: duplicates.map(d => ({
            id: d.id,
            displayName: d.getDisplayName(),
            phone: d.phone_e164,
            email: d.email,
            matchedOn: d._matchedOn
          }))
        }
      });
    }
  }

  try {
    await customer.update({
      first_name: _firstName,
      last_name: _lastName,
      company_name: _companyName,
      phone_raw: _phoneRaw,
      whatsapp_raw: _whatsappRaw,
      whatsapp_same_as_phone: _whatsappSameAsPhone || false,
      email,
      address,
      heard_about_us: _heardAboutUs,
      heard_about_us_other_text: _heardAboutUsOtherText,
      tags: tags || [],
      notes,
      updated_by: req.user?.id
    });

    res.json({
      success: true,
      data: {
        customer: {
          ...customer.toJSON(),
          displayName: customer.getDisplayName()
        }
      },
      message: 'Customer updated successfully'
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'contact';
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_CONTACT',
          message: `Another customer with this ${field.replace('_e164', '').replace('_lower', '')} already exists`
        }
      });
    }
    throw error;
  }
});

/**
 * DELETE /api/v1/customers/:id
 * Delete customer
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customer = await Customer.findByPk(id);

  if (!customer) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Customer not found'
      }
    });
  }

  await customer.destroy();

  res.json({
    success: true,
    message: 'Customer deleted successfully'
  });
});

/**
 * POST /api/v1/customers/:existingId/merge
 * Merge incoming data into existing customer
 */
exports.merge = asyncHandler(async (req, res) => {
  const { existingId } = req.params;
  const incomingData = req.body;

  const existing = await Customer.findByPk(existingId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Target customer not found'
      }
    });
  }

  const transaction = await sequelize.transaction();

  try {
    const diff = {};
    const updates = {};

    // Merge rules: keep existing non-empty values, fill blanks from incoming
    const fieldsToMerge = [
      'first_name', 'last_name', 'company_name',
      'phone_raw', 'whatsapp_raw', 'whatsapp_same_as_phone',
      'email', 'address',
      'heard_about_us', 'heard_about_us_other_text'
    ];

    for (const field of fieldsToMerge) {
      const incomingKey = toCamelCase(field);
      const incomingValue = incomingData[incomingKey] ?? incomingData[field];
      const existingValue = existing[field];

      // Fill blank with incoming
      if (!existingValue && incomingValue) {
        updates[field] = incomingValue;
        diff[field] = { from: existingValue, to: incomingValue };
      }
    }

    // Tags: union
    const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
    const incomingTags = Array.isArray(incomingData.tags) ? incomingData.tags : [];
    const mergedTags = [...new Set([...existingTags, ...incomingTags])];
    if (JSON.stringify(mergedTags) !== JSON.stringify(existingTags)) {
      updates.tags = mergedTags;
      diff.tags = { from: existingTags, to: mergedTags };
    }

    // Notes: append with timestamp
    if (incomingData.notes && incomingData.notes.trim()) {
      const timestamp = new Date().toISOString();
      const separator = existing.notes ? '\n\n---\n' : '';
      const newNotes = `${existing.notes || ''}${separator}[Merged ${timestamp}]\n${incomingData.notes}`;
      updates.notes = newNotes;
      diff.notes = { appended: incomingData.notes };
    }

    updates.updated_by = req.user?.id;

    // Apply updates
    if (Object.keys(updates).length > 1) { // More than just updated_by
      await existing.update(updates, { transaction });
    }

    // Create merge log
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(incomingData))
      .digest('hex')
      .substring(0, 64);

    await CustomerMergeLog.create({
      merged_into_customer_id: existingId,
      merged_from_customer_id: incomingData.mergeFromCustomerId || null,
      merged_from_payload_hash: payloadHash,
      merged_by_user_id: req.user?.id,
      diff_json: diff
    }, { transaction });

    // If merging from another existing customer, delete it
    if (incomingData.mergeFromCustomerId) {
      await Customer.destroy({
        where: { id: incomingData.mergeFromCustomerId },
        transaction
      });
    }

    await transaction.commit();

    // Reload customer
    await existing.reload();

    res.json({
      success: true,
      data: {
        customer: {
          ...existing.toJSON(),
          displayName: existing.getDisplayName()
        },
        diff
      },
      message: 'Customers merged successfully'
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

/**
 * POST /api/v1/customers/normalize-phone
 * Preview phone normalization
 */
exports.normalizePhonePreview = asyncHandler(async (req, res) => {
  const { phone, defaultRegion = 'GH' } = req.body;

  const result = normalizePhone(phone, defaultRegion);

  res.json({
    success: true,
    data: result
  });
});

// Helper function
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

module.exports = exports;
