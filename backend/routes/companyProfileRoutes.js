'use strict';

const express = require('express');
const router = express.Router();
const companyProfileController = require('../controllers/companyProfileController');
const { authenticate, requireRole } = require('../middleware/auth');

/**
 * Company Profile Routes
 *
 * All routes require authentication
 * Write operations require Admin or Manager role
 */

// GET /api/v1/company-profile - Get company profile
router.get('/',
  authenticate,
  companyProfileController.getProfile
);

// PUT /api/v1/company-profile - Update company profile
router.put('/',
  authenticate,
  requireRole(['Admin', 'Manager']),
  companyProfileController.updateProfile
);

// POST /api/v1/company-profile/logo - Upload logo
router.post('/logo',
  authenticate,
  requireRole(['Admin', 'Manager']),
  companyProfileController.uploadLogo
);

// GET /api/v1/company-profile/logo/:filename - Serve logo (public for PDF generation)
router.get('/logo/:filename',
  companyProfileController.serveLogo
);

// DELETE /api/v1/company-profile/logo - Delete logo
router.delete('/logo',
  authenticate,
  requireRole(['Admin', 'Manager']),
  companyProfileController.deleteLogo
);

module.exports = router;
