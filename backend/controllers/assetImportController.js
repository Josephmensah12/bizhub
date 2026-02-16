const { Asset } = require('../models');
const { generateAssetTag } = require('../utils/assetTagGenerator');
const multer = require('multer');
const csvParser = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Async handler wrapper
const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

/**
 * Validate asset data
 */
function validateAssetData(data, rowNumber) {
  const errors = [];

  // Required fields
  if (!data.assetType) errors.push(`Row ${rowNumber}: assetType is required`);
  if (!data.serialNumber) errors.push(`Row ${rowNumber}: serialNumber is required`);
  if (!data.make) errors.push(`Row ${rowNumber}: make is required`);
  if (!data.model) errors.push(`Row ${rowNumber}: model is required`);

  // Validate asset type
  const validAssetTypes = ['Laptop', 'Desktop', 'iPhone', 'Television', 'Other'];
  if (data.assetType && !validAssetTypes.includes(data.assetType)) {
    errors.push(`Row ${rowNumber}: assetType must be one of ${validAssetTypes.join(', ')}`);
  }

  // Validate status
  const validStatuses = ['In Stock', 'Processing', 'Reserved', 'Sold', 'In Repair', 'Returned'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push(`Row ${rowNumber}: status must be one of ${validStatuses.join(', ')}`);
  }

  // Validate condition
  const validConditions = ['New', 'Open Box', 'Renewed', 'Used'];
  if (data.condition && !validConditions.includes(data.condition)) {
    errors.push(`Row ${rowNumber}: condition must be one of ${validConditions.join(', ')}`);
  }

  // Validate numeric fields
  if (data.ramGB && isNaN(parseInt(data.ramGB))) {
    errors.push(`Row ${rowNumber}: ramGB must be a valid number`);
  }
  if (data.storageGB && isNaN(parseInt(data.storageGB))) {
    errors.push(`Row ${rowNumber}: storageGB must be a valid number`);
  }
  if (data.screenSizeInches && isNaN(parseFloat(data.screenSizeInches))) {
    errors.push(`Row ${rowNumber}: screenSizeInches must be a valid number`);
  }
  if (data.batteryHealthPercent && (isNaN(parseInt(data.batteryHealthPercent)) || parseInt(data.batteryHealthPercent) < 0 || parseInt(data.batteryHealthPercent) > 100)) {
    errors.push(`Row ${rowNumber}: batteryHealthPercent must be between 0 and 100`);
  }
  if (data.cost && isNaN(parseFloat(data.cost))) {
    errors.push(`Row ${rowNumber}: cost must be a valid number`);
  }
  if (data.price && isNaN(parseFloat(data.price))) {
    errors.push(`Row ${rowNumber}: price must be a valid number`);
  }
  if (data.quantity && isNaN(parseInt(data.quantity))) {
    errors.push(`Row ${rowNumber}: quantity must be a valid number`);
  }

  return errors;
}

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
 * Transform imported data to match database schema
 */
function transformImportData(data) {
  return {
    asset_type: data.assetType,
    serial_number: data.serialNumber,
    make: data.make,
    model: data.model,
    status: data.status || 'In Stock',
    condition: data.condition,
    quantity: data.quantity ? parseInt(data.quantity) : 1,
    category: data.category,
    subcategory: data.subcategory,
    specs: data.specs,
    ram_gb: data.ramGB ? parseInt(data.ramGB) : null,
    storage_gb: data.storageGB ? parseInt(data.storageGB) : null,
    storage_type: data.storageType,
    cpu: data.cpu,
    gpu: data.gpu,
    screen_size_inches: data.screenSizeInches ? parseFloat(data.screenSizeInches) : null,
    resolution: data.resolution,
    battery_health_percent: data.batteryHealthPercent ? parseInt(data.batteryHealthPercent) : null,
    major_characteristics: data.majorCharacteristics ? data.majorCharacteristics.split(',').map(c => c.trim()) : [],
    cost: data.cost ? parseFloat(data.cost) : null,
    price: data.price ? parseFloat(data.price) : null,
    currency: data.currency || 'GHS'
  };
}

/**
 * POST /api/v1/assets/import
 * Bulk import assets from CSV/Excel
 */
exports.bulkImport = [
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded'
        }
      });
    }

    const { importMode = 'skip-errors' } = req.body; // 'skip-errors' or 'all-or-nothing'
    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let data = [];
    try {
      if (fileExt === '.csv') {
        data = await parseCSV(filePath);
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        data = await parseExcel(filePath);
      } else {
        throw new Error('Unsupported file format');
      }
    } catch (error) {
      fs.unlinkSync(filePath); // Clean up
      return res.status(400).json({
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Failed to parse file: ' + error.message
        }
      });
    }

    // Validate all rows
    const validationErrors = [];
    const validRows = [];

    for (let i = 0; i < data.length; i++) {
      const rowNumber = i + 2; // +2 because Excel/CSV rows start at 1 and we have a header
      const errors = validateAssetData(data[i], rowNumber);

      if (errors.length > 0) {
        validationErrors.push(...errors);
      } else {
        validRows.push({ rowNumber, data: data[i] });
      }
    }

    // Check for duplicate serial numbers
    const serialNumbers = validRows.map(r => r.data.serialNumber);
    const duplicateSerials = serialNumbers.filter((s, i) => serialNumbers.indexOf(s) !== i);
    if (duplicateSerials.length > 0) {
      validationErrors.push(`Duplicate serial numbers found in import: ${duplicateSerials.join(', ')}`);
    }

    // Check for serial numbers that already exist in database
    if (validRows.length > 0) {
      const existingAssets = await Asset.findAll({
        where: {
          serial_number: serialNumbers
        },
        attributes: ['serial_number']
      });

      if (existingAssets.length > 0) {
        const existing = existingAssets.map(a => a.serial_number);
        validationErrors.push(`Serial numbers already exist in database: ${existing.join(', ')}`);

        // Remove rows with existing serial numbers
        validRows.forEach((row, idx) => {
          if (existing.includes(row.data.serialNumber)) {
            validationErrors.push(`Row ${row.rowNumber}: Serial number ${row.data.serialNumber} already exists`);
            validRows.splice(idx, 1);
          }
        });
      }
    }

    // If all-or-nothing mode and there are errors, return them
    if (importMode === 'all-or-nothing' && validationErrors.length > 0) {
      fs.unlinkSync(filePath); // Clean up
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Import failed due to validation errors',
          details: validationErrors
        }
      });
    }

    // Import valid rows
    const imported = [];
    const failed = [];

    for (const row of validRows) {
      try {
        const assetTag = await generateAssetTag();
        const assetData = {
          ...transformImportData(row.data),
          asset_tag: assetTag,
          created_by: req.user?.id,
          updated_by: req.user?.id
        };

        const asset = await Asset.create(assetData);
        imported.push({ rowNumber: row.rowNumber, assetTag });
      } catch (error) {
        failed.push({
          rowNumber: row.rowNumber,
          error: error.message
        });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      data: {
        imported: imported.length,
        failed: failed.length,
        validationErrors: validationErrors.length,
        importedAssets: imported,
        failedRows: failed,
        validationErrorDetails: validationErrors
      },
      message: `Imported ${imported.length} assets successfully. ${failed.length} rows failed.`
    });
  })
];

module.exports = exports;
