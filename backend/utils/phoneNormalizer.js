/**
 * Phone Normalization Utility
 *
 * Uses libphonenumber-js for phone parsing and normalization
 * Default region: Ghana (GH)
 */

const {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  getCountryCallingCode
} = require('libphonenumber-js');

// Default region for Ghana
const DEFAULT_REGION = 'GH';

/**
 * Normalize a phone number to E.164 format
 *
 * @param {string} phoneRaw - Raw phone number input
 * @param {string} defaultRegion - Default region code (default: GH)
 * @returns {object} { raw, e164, isValid, error, country, formatted }
 */
function normalizePhone(phoneRaw, defaultRegion = DEFAULT_REGION) {
  if (!phoneRaw || typeof phoneRaw !== 'string') {
    return {
      raw: phoneRaw || null,
      e164: null,
      isValid: false,
      error: 'No phone number provided',
      country: null,
      formatted: null
    };
  }

  // Clean up the input
  const cleaned = phoneRaw.trim();
  if (!cleaned) {
    return {
      raw: phoneRaw,
      e164: null,
      isValid: false,
      error: 'Empty phone number',
      country: null,
      formatted: null
    };
  }

  try {
    // Parse the phone number
    const phoneNumber = parsePhoneNumberFromString(cleaned, defaultRegion);

    if (!phoneNumber) {
      return {
        raw: phoneRaw,
        e164: null,
        isValid: false,
        error: 'Invalid phone number format',
        country: null,
        formatted: null
      };
    }

    // Check if valid
    const isValid = phoneNumber.isValid();

    return {
      raw: phoneRaw,
      e164: isValid ? phoneNumber.format('E.164') : null,
      isValid,
      error: isValid ? null : 'Phone number is not valid for the detected region',
      country: phoneNumber.country || null,
      formatted: isValid ? phoneNumber.formatInternational() : null,
      nationalFormat: isValid ? phoneNumber.formatNational() : null
    };
  } catch (error) {
    return {
      raw: phoneRaw,
      e164: null,
      isValid: false,
      error: `Parse error: ${error.message}`,
      country: null,
      formatted: null
    };
  }
}

/**
 * Normalize email to lowercase trimmed format
 *
 * @param {string} email - Raw email input
 * @returns {object} { raw, lower, isValid }
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return {
      raw: email || null,
      lower: null,
      isValid: false
    };
  }

  const cleaned = email.trim();
  if (!cleaned) {
    return {
      raw: email,
      lower: null,
      isValid: false
    };
  }

  const lower = cleaned.toLowerCase();

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(lower);

  return {
    raw: email,
    lower: isValid ? lower : null,
    isValid
  };
}

/**
 * Parse and validate customer contact fields
 *
 * @param {object} data - Customer data with phoneRaw, whatsappRaw, email, whatsappSameAsPhone
 * @param {string} defaultRegion - Default region code
 * @returns {object} Normalized contact fields
 */
function normalizeCustomerContacts(data, defaultRegion = DEFAULT_REGION) {
  const result = {
    phoneRaw: data.phoneRaw || data.phone_raw || null,
    phoneE164: null,
    phoneValid: false,
    phoneError: null,
    whatsappRaw: data.whatsappRaw || data.whatsapp_raw || null,
    whatsappE164: null,
    whatsappValid: false,
    whatsappError: null,
    whatsappSameAsPhone: Boolean(data.whatsappSameAsPhone || data.whatsapp_same_as_phone),
    email: data.email || null,
    emailLower: null,
    emailValid: false
  };

  // Normalize phone
  if (result.phoneRaw) {
    const phoneResult = normalizePhone(result.phoneRaw, defaultRegion);
    result.phoneE164 = phoneResult.e164;
    result.phoneValid = phoneResult.isValid;
    result.phoneError = phoneResult.error;
    result.phoneCountry = phoneResult.country;
    result.phoneFormatted = phoneResult.formatted;
  }

  // Handle WhatsApp
  if (result.whatsappSameAsPhone) {
    // Mirror phone to WhatsApp
    result.whatsappRaw = result.phoneRaw;
    result.whatsappE164 = result.phoneE164;
    result.whatsappValid = result.phoneValid;
    result.whatsappError = result.phoneError;
  } else if (result.whatsappRaw) {
    // Normalize WhatsApp separately
    const whatsappResult = normalizePhone(result.whatsappRaw, defaultRegion);
    result.whatsappE164 = whatsappResult.e164;
    result.whatsappValid = whatsappResult.isValid;
    result.whatsappError = whatsappResult.error;
    result.whatsappCountry = whatsappResult.country;
    result.whatsappFormatted = whatsappResult.formatted;
  }

  // Normalize email
  if (result.email) {
    const emailResult = normalizeEmail(result.email);
    result.emailLower = emailResult.lower;
    result.emailValid = emailResult.isValid;
  }

  return result;
}

/**
 * Get Ghana country code
 */
function getGhanaCallingCode() {
  return '+233';
}

/**
 * Check if a number looks like a Ghana local format
 * (starts with 0 followed by 2, 5, or 3 for mobile)
 */
function isGhanaLocalFormat(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  // Ghana local mobile: 0xx xxx xxxx (10 digits starting with 0)
  return /^0[235]\d{8}$/.test(cleaned);
}

/**
 * Compare two phone numbers after normalization
 *
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @param {string} defaultRegion - Default region code
 * @returns {boolean} True if both normalize to the same E.164
 */
function isSamePhone(phone1, phone2, defaultRegion = DEFAULT_REGION) {
  if (!phone1 || !phone2) return false;

  const result1 = normalizePhone(phone1, defaultRegion);
  const result2 = normalizePhone(phone2, defaultRegion);

  if (!result1.e164 || !result2.e164) return false;

  return result1.e164 === result2.e164;
}

/**
 * Extract Ghana local number from E.164 format
 *
 * @param {string} e164 - Phone number in E.164 format
 * @returns {string|null} Local format (0xx xxx xxxx) or null if not Ghana
 */
function extractGhanaLocalNumber(e164) {
  if (!e164 || typeof e164 !== 'string') return null;

  // Check if it's a Ghana number (+233)
  if (e164.startsWith('+233')) {
    // Remove +233 and add leading 0
    const nationalPart = e164.slice(4); // Remove +233
    return '0' + nationalPart;
  }

  // Check if already in local format
  if (/^0[235]\d{8}$/.test(e164.replace(/\D/g, ''))) {
    return e164.replace(/\D/g, '');
  }

  return null;
}

module.exports = {
  normalizePhone,
  normalizeEmail,
  normalizeCustomerContacts,
  getGhanaCallingCode,
  isGhanaLocalFormat,
  isSamePhone,
  extractGhanaLocalNumber,
  DEFAULT_REGION
};
