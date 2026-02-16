'use strict';

const { CompanyProfile, User } = require('../models');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure logos directory exists
const logosDir = path.join(__dirname, '..', 'uploads', 'logos');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

const logoUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    const allowedExts = ['.png', '.jpg', '.jpeg', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, and SVG images are allowed'));
    }
  }
});

/**
 * Async handler wrapper
 */
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * Get company profile
 * GET /api/v1/company-profile
 */
exports.getProfile = asyncHandler(async (req, res) => {
  let profile = await CompanyProfile.findOne({
    where: { is_active: true },
    include: [
      {
        model: User,
        as: 'updatedBy',
        attributes: ['id', 'full_name', 'email']
      }
    ]
  });

  // If no profile exists, return empty structure
  if (!profile) {
    return res.json({
      success: true,
      data: {
        profile: null,
        isNew: true
      }
    });
  }

  // Build logo URL
  let logoUrl = null;
  if (profile.logo_storage_key) {
    logoUrl = `/api/v1/company-profile/logo/${profile.logo_storage_key}`;
  }

  res.json({
    success: true,
    data: {
      profile: {
        id: profile.id,
        companyName: profile.company_name,
        tagline: profile.tagline,
        addressLine1: profile.address_line_1,
        addressLine2: profile.address_line_2,
        city: profile.city,
        regionState: profile.region_state,
        country: profile.country,
        phone: profile.phone,
        whatsapp: profile.whatsapp,
        email: profile.email,
        website: profile.website,
        taxIdOrTin: profile.tax_id_or_tin,
        notesFooter: profile.notes_footer,
        logoUrl,
        hasLogo: !!profile.logo_storage_key,
        updatedAt: profile.updated_at,
        updatedBy: profile.updatedBy
      },
      isNew: false
    }
  });
});

/**
 * Update company profile
 * PUT /api/v1/company-profile
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const {
    companyName,
    tagline,
    addressLine1,
    addressLine2,
    city,
    regionState,
    country,
    phone,
    whatsapp,
    email,
    website,
    taxIdOrTin,
    notesFooter
  } = req.body;

  // Validation
  if (!companyName || !companyName.trim()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'COMPANY_NAME_REQUIRED',
        message: 'Company name is required'
      }
    });
  }

  // Find existing profile or create new
  let profile = await CompanyProfile.findOne({ where: { is_active: true } });

  const profileData = {
    company_name: companyName.trim(),
    tagline: tagline?.trim() || null,
    address_line_1: addressLine1?.trim() || null,
    address_line_2: addressLine2?.trim() || null,
    city: city?.trim() || null,
    region_state: regionState?.trim() || null,
    country: country?.trim() || 'Ghana',
    phone: phone?.trim() || null,
    whatsapp: whatsapp?.trim() || null,
    email: email?.trim() || null,
    website: website?.trim() || null,
    tax_id_or_tin: taxIdOrTin?.trim() || null,
    notes_footer: notesFooter?.trim() || null,
    updated_by_user_id: req.user?.id || null
  };

  if (profile) {
    await profile.update(profileData);
  } else {
    profile = await CompanyProfile.create({
      ...profileData,
      is_active: true
    });
  }

  // Reload with associations
  await profile.reload({
    include: [
      {
        model: User,
        as: 'updatedBy',
        attributes: ['id', 'full_name', 'email']
      }
    ]
  });

  let logoUrl = null;
  if (profile.logo_storage_key) {
    logoUrl = `/api/v1/company-profile/logo/${profile.logo_storage_key}`;
  }

  res.json({
    success: true,
    message: 'Company profile updated successfully',
    data: {
      profile: {
        id: profile.id,
        companyName: profile.company_name,
        tagline: profile.tagline,
        addressLine1: profile.address_line_1,
        addressLine2: profile.address_line_2,
        city: profile.city,
        regionState: profile.region_state,
        country: profile.country,
        phone: profile.phone,
        whatsapp: profile.whatsapp,
        email: profile.email,
        website: profile.website,
        taxIdOrTin: profile.tax_id_or_tin,
        notesFooter: profile.notes_footer,
        logoUrl,
        hasLogo: !!profile.logo_storage_key,
        updatedAt: profile.updated_at,
        updatedBy: profile.updatedBy
      }
    }
  });
});

/**
 * Upload company logo
 * POST /api/v1/company-profile/logo
 */
exports.uploadLogo = [
  logoUpload.single('logo'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No logo file uploaded'
        }
      });
    }

    // Find or create profile
    let profile = await CompanyProfile.findOne({ where: { is_active: true } });

    if (!profile) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PROFILE',
          message: 'Please save company profile first before uploading logo'
        }
      });
    }

    // Delete old logo if exists
    if (profile.logo_storage_key) {
      const oldLogoPath = path.join(logosDir, profile.logo_storage_key);
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Update profile with new logo
    await profile.update({
      logo_storage_key: req.file.filename,
      logo_mime_type: req.file.mimetype,
      logo_url: `/api/v1/company-profile/logo/${req.file.filename}`,
      updated_by_user_id: req.user?.id || null
    });

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        logoUrl: `/api/v1/company-profile/logo/${req.file.filename}`,
        hasLogo: true
      }
    });
  })
];

/**
 * Serve logo file
 * GET /api/v1/company-profile/logo/:filename
 */
exports.serveLogo = asyncHandler(async (req, res) => {
  const { filename } = req.params;

  // Sanitize filename to prevent directory traversal
  const sanitizedFilename = path.basename(filename);
  const logoPath = path.join(logosDir, sanitizedFilename);

  if (!fs.existsSync(logoPath)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Logo not found'
      }
    });
  }

  // Get the profile to check mime type
  const profile = await CompanyProfile.findOne({
    where: { logo_storage_key: sanitizedFilename }
  });

  const mimeType = profile?.logo_mime_type || 'image/png';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  fs.createReadStream(logoPath).pipe(res);
});

/**
 * Delete company logo
 * DELETE /api/v1/company-profile/logo
 */
exports.deleteLogo = asyncHandler(async (req, res) => {
  const profile = await CompanyProfile.findOne({ where: { is_active: true } });

  if (!profile || !profile.logo_storage_key) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NO_LOGO',
        message: 'No logo to delete'
      }
    });
  }

  // Delete file
  const logoPath = path.join(logosDir, profile.logo_storage_key);
  if (fs.existsSync(logoPath)) {
    fs.unlinkSync(logoPath);
  }

  // Update profile
  await profile.update({
    logo_storage_key: null,
    logo_mime_type: null,
    logo_url: null,
    updated_by_user_id: req.user?.id || null
  });

  res.json({
    success: true,
    message: 'Logo deleted successfully',
    data: {
      logoUrl: null,
      hasLogo: false
    }
  });
});

// Export multer middleware for route
exports.logoUploadMiddleware = logoUpload;
