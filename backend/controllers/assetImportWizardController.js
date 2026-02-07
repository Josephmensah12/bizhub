const { Asset, ImportBatch, InventoryItemEvent, sequelize } = require('../models');
const multer = require('multer');
const csvParser = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { autoDetectColumns, getRequiredFields, getConditionalRequiredFields, getFieldMetadata } = require('../utils/columnDetector');
const { transformRow } = require('../utils/dataTransformer');
const { validateTaxonomyAsync, getCategoryForAssetType, getFullTaxonomy } = require('../utils/inventoryTaxonomy');
const { generateAssetTag } = require('../utils/assetTagGenerator');
const { Op } = require('sequelize');

// In-memory store for batch IDs during import session
const importSessions = new Map();

// Async handler wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Configure multer
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

    // Also check file extension as fallback (useful for systems with incorrect MIME types)
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

/**
 * Detect file type from content (file signature)
 */
function detectFileType(filePath) {
  const buffer = fs.readFileSync(filePath);

  // Check for Excel file signatures
  // XLSX files start with PK (ZIP signature: 50 4B 03 04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return 'excel';
  }

  // XLS files start with D0 CF 11 E0
  if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
    return 'excel';
  }

  // Default to CSV for text files
  return 'csv';
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
 * POST /api/v1/assets/import/preview
 * Step 1: Upload file and get preview
 */
exports.previewFile = [
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

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    // Create early batch record for tracking (even if parsing fails)
    const sourceType = fileExt.replace('.', '');
    let batch = null;

    try {
      // Create pending batch record
      batch = await ImportBatch.create({
        created_by_user_id: req.user?.id,
        source_type: sourceType,
        original_file_name: req.file.originalname,
        file_size_bytes: req.file.size,
        status: 'pending',
        rows_total: 0
      });

      let data = [];

      if (fileExt === '.csv') {
        data = await parseCSV(filePath);
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        data = await parseExcel(filePath);
      } else {
        throw new Error('Unsupported file format');
      }

      // Update batch with row count
      await batch.update({ rows_total: data.length });

      // Get headers from first row
      const headers = data.length > 0 ? Object.keys(data[0]) : [];

      // Auto-detect column mappings
      const suggestedMappings = autoDetectColumns(headers);

      // Get first 20 rows for preview
      const preview = data.slice(0, 20);

      // Store file info in session or return file ID for next steps
      const fileId = path.basename(filePath);

      // Store batch ID for this session
      importSessions.set(fileId, {
        batchId: batch.id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        sourceType
      });

      res.json({
        success: true,
        data: {
          fileId,
          batchId: batch.id,
          fileName: req.file.originalname,
          totalRows: data.length,
          headers,
          preview,
          suggestedMappings,
          fieldMetadata: await getFieldMetadata(),
          requiredFields: getRequiredFields()
        }
      });
    } catch (error) {
      fs.unlinkSync(filePath); // Clean up

      // Update batch status to failed if created
      if (batch) {
        await batch.update({
          status: 'failed',
          error_message: error.message
        });
      }

      return res.status(400).json({
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Failed to parse file: ' + error.message
        }
      });
    }
  })
];

/**
 * POST /api/v1/assets/import/validate
 * Step 2/3: Validate rows with mapping
 */
exports.validateImport = asyncHandler(async (req, res) => {
  const { fileId, mapping, constantValues = {} } = req.body;

  // Debug logging
  console.log('=== VALIDATE REQUEST ===');
  console.log('Mapping:', JSON.stringify(mapping, null, 2));
  console.log('Constant Values:', JSON.stringify(constantValues, null, 2));

  if (!fileId || !mapping) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_PARAMS',
        message: 'fileId and mapping are required'
      }
    });
  }

  const filePath = path.join('uploads', fileId);

  if (!fs.existsSync(filePath)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: 'Upload file not found. Please upload again.'
      }
    });
  }

  try {
    // Detect file type from content
    const fileType = detectFileType(filePath);
    let data = [];

    if (fileType === 'excel') {
      data = await parseExcel(filePath);
    } else {
      data = await parseCSV(filePath);
    }

    // Check if required fields are mapped or have constant values
    const requiredFields = getRequiredFields();
    const missingRequired = requiredFields.filter(field => {
      const isMapped = mapping[field] && mapping[field] !== '__ignore__';
      const hasConstant = constantValues[field] != null && constantValues[field] !== '';
      return !isMapped && !hasConstant;
    });

    if (missingRequired.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_MAPPING',
          message: `Required fields not mapped or set as constant: ${missingRequired.join(', ')}`
        }
      });
    }

    // Special validation: serial_number cannot be a constant (would create duplicates)
    // Exception: if quantity constant is > 1, serial_number is optional
    const quantityConstant = constantValues.quantity ? parseInt(constantValues.quantity) : null;
    if (constantValues.serial_number != null && constantValues.serial_number !== '') {
      if (!quantityConstant || quantityConstant === 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONSTANT',
            message: 'serial_number cannot be set as a constant value (it must be unique for each asset)'
          }
        });
      }
    }

    // Get merged taxonomy (hardcoded + custom)
    const { categories, allAssetTypes } = await getFullTaxonomy();

    // Transform and validate all rows
    const validationErrors = [];
    const validRows = [];
    const transformedRows = [];

    for (let i = 0; i < data.length; i++) {
      const rowNumber = i + 2; // +2 for Excel-style row numbering (1-indexed + header)
      const row = data[i];
      const errors = [];

      // Transform row using mapping
      const transformed = transformRow(row, mapping);

      // Apply constant values (override any mapped values)
      for (const [field, value] of Object.entries(constantValues)) {
        if (value != null && value !== '') {
          transformed[field] = value;
        }
      }

      // Debug: log first row
      if (i === 0) {
        console.log('=== FIRST ROW TRANSFORMATION ===');
        console.log('Original row:', row);
        console.log('Transformed (after constants):', transformed);
      }

      // Apply default quantity if not provided
      if (transformed.quantity == null) {
        transformed.quantity = 1;
      }

      // If category is missing but asset_type is present, try to infer category
      if (!transformed.category && transformed.asset_type) {
        transformed.category = getCategoryForAssetType(transformed.asset_type);
      }

      // Validate required fields (using merged taxonomy)
      if (!transformed.category) {
        errors.push(`category is required. Allowed: ${categories.join(', ')}`);
      } else if (!categories.some(c => c.toLowerCase() === String(transformed.category).toLowerCase())) {
        errors.push(`Invalid category: "${transformed.category}". Allowed: ${categories.join(', ')}`);
      }

      if (!transformed.asset_type) {
        errors.push(`asset_type is required. Allowed: ${allAssetTypes.join(', ')}`);
      } else if (!allAssetTypes.some(t => t.toLowerCase() === String(transformed.asset_type).toLowerCase())) {
        errors.push(`Invalid asset_type: "${transformed.asset_type}". Allowed: ${allAssetTypes.join(', ')}`);
      }

      // Validate taxonomy combination (async)
      if (transformed.category && transformed.asset_type) {
        const taxonomyResult = await validateTaxonomyAsync(transformed.category, transformed.asset_type);
        if (!taxonomyResult.valid) {
          errors.push(taxonomyResult.error);
        }
      }

      if (!transformed.make) errors.push(`make is required`);
      if (!transformed.model) errors.push(`model is required`);

      // Validate quantity
      if (transformed.quantity != null) {
        if (!Number.isInteger(transformed.quantity)) {
          errors.push(`quantity must be a whole number (not decimal)`);
        } else if (transformed.quantity < 1) {
          errors.push(`quantity must be at least 1`);
        }
      }

      // Validate numeric fields
      if (transformed.ram_gb != null && (isNaN(transformed.ram_gb) || transformed.ram_gb < 0)) {
        errors.push(`ram_gb must be a positive number`);
      }
      if (transformed.storage_gb != null && (isNaN(transformed.storage_gb) || transformed.storage_gb < 0)) {
        errors.push(`storage_gb must be a positive number`);
      }
      if (transformed.screen_size_inches != null && (isNaN(transformed.screen_size_inches) || transformed.screen_size_inches < 0)) {
        errors.push(`screen_size_inches must be a positive number`);
      }
      if (transformed.battery_health_percent != null && (isNaN(transformed.battery_health_percent) || transformed.battery_health_percent < 0 || transformed.battery_health_percent > 100)) {
        errors.push(`battery_health_percent must be between 0 and 100`);
      }
      if (transformed.cost != null && (isNaN(transformed.cost) || transformed.cost < 0)) {
        errors.push(`cost must be a positive number`);
      }
      if (transformed.price != null && (isNaN(transformed.price) || transformed.price < 0)) {
        errors.push(`price must be a positive number`);
      }

      // Validate enums
      if (transformed.status) {
        const validStatuses = ['In Stock', 'Processing', 'Reserved', 'Sold', 'In Repair', 'Returned'];
        if (!validStatuses.includes(transformed.status)) {
          errors.push(`status must be one of: ${validStatuses.join(', ')}`);
        }
      }

      if (transformed.condition) {
        const validConditions = ['New', 'Open Box', 'Renewed', 'Used'];
        if (!validConditions.includes(transformed.condition)) {
          errors.push(`condition must be one of: ${validConditions.join(', ')}`);
        }
      }

      if (transformed.storage_type) {
        const validStorageTypes = ['HDD', 'SSD', 'NVMe', 'Other'];
        if (!validStorageTypes.includes(transformed.storage_type)) {
          errors.push(`storage_type must be one of: ${validStorageTypes.join(', ')}`);
        }
      }

      if (errors.length > 0) {
        validationErrors.push({
          rowNumber,
          errors,
          originalData: row
        });
      } else {
        validRows.push(rowNumber);
        transformedRows.push({
          ...transformed,
          _originalRow: row,
          _rowNumber: rowNumber
        });
      }
    }

    // Check for duplicate serial numbers within file (only for rows that have serial numbers)
    const serialNumbers = transformedRows
      .filter(r => r.serial_number) // Only check rows with serial numbers
      .map(r => r.serial_number);
    const duplicatesInFile = serialNumbers.filter((s, i) => serialNumbers.indexOf(s) !== i);

    if (duplicatesInFile.length > 0) {
      duplicatesInFile.forEach(serial => {
        const rows = transformedRows.filter(r => r.serial_number === serial);
        rows.forEach((row, idx) => {
          if (idx > 0) { // First occurrence is OK
            validationErrors.push({
              rowNumber: row._rowNumber,
              errors: [`Duplicate serial number in file: ${serial}`],
              originalData: row._originalRow
            });
          }
        });
      });
    }

    // Check for existing serial numbers in database (only for serial numbers that are provided)
    if (serialNumbers.length > 0) {
      const existingAssets = await Asset.findAll({
        where: {
          serial_number: { [Op.in]: serialNumbers }
        },
        attributes: ['serial_number']
      });

      if (existingAssets.length > 0) {
        const existingSerials = existingAssets.map(a => a.serial_number);
        transformedRows.forEach(row => {
          if (row.serial_number && existingSerials.includes(row.serial_number)) {
            validationErrors.push({
              rowNumber: row._rowNumber,
              errors: [`Serial number already exists in database: ${row.serial_number}`],
              originalData: row._originalRow
            });
          }
        });
      }
    }

    // Get preview of transformed data (first 20 rows)
    const validPreview = transformedRows.slice(0, 20).map(r => {
      const { _originalRow, _rowNumber, ...transformed } = r;
      return {
        rowNumber: _rowNumber,
        ...transformed
      };
    });

    res.json({
      success: true,
      data: {
        totalRows: data.length,
        validRows: validRows.length,
        invalidRows: validationErrors.length,
        validationErrors,
        validPreview
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed: ' + error.message
      }
    });
  }
});

/**
 * POST /api/v1/assets/import/commit
 * Step 4: Commit the import
 */
exports.commitImport = asyncHandler(async (req, res) => {
  const { fileId, mapping, constantValues = {}, importMode = 'skip-errors' } = req.body;

  if (!fileId || !mapping) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_PARAMS',
        message: 'fileId and mapping are required'
      }
    });
  }

  const filePath = path.join('uploads', fileId);

  if (!fs.existsSync(filePath)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FILE_NOT_FOUND',
        message: 'Upload file not found. Please upload again.'
      }
    });
  }

  // Get batch from session or create new one
  let sessionInfo = importSessions.get(fileId);
  let batch = null;

  if (sessionInfo?.batchId) {
    batch = await ImportBatch.findByPk(sessionInfo.batchId);
  }

  // If no batch found, create one
  if (!batch) {
    const fileExt = path.extname(sessionInfo?.fileName || fileId).toLowerCase().replace('.', '') || 'csv';
    batch = await ImportBatch.create({
      created_by_user_id: req.user?.id,
      source_type: fileExt,
      original_file_name: sessionInfo?.fileName || fileId,
      file_size_bytes: sessionInfo?.fileSize,
      status: 'processing'
    });
  }

  // Update batch with mapping config and mode
  await batch.update({
    status: 'processing',
    import_mode: importMode,
    mapping_config_json: {
      mapping,
      constantValues
    }
  });

  try {
    // Parse file - detect type from content
    const fileType = detectFileType(filePath);
    let data = [];

    if (fileType === 'excel') {
      data = await parseExcel(filePath);
    } else {
      data = await parseCSV(filePath);
    }

    // Get merged taxonomy (hardcoded + custom)
    const { categories: commitCategories, allAssetTypes: commitAllAssetTypes } = await getFullTaxonomy();

    // Re-validate (security: never trust client)
    const validationErrors = [];
    const validRows = [];

    for (let i = 0; i < data.length; i++) {
      const rowNumber = i + 2;
      const row = data[i];
      const transformed = transformRow(row, mapping);

      // Apply constant values
      for (const [field, value] of Object.entries(constantValues)) {
        if (value != null && value !== '') {
          transformed[field] = value;
        }
      }

      // Apply default quantity if not provided
      if (transformed.quantity == null) {
        transformed.quantity = 1;
      }

      // If category is missing but asset_type is present, try to infer category
      if (!transformed.category && transformed.asset_type) {
        transformed.category = getCategoryForAssetType(transformed.asset_type);
      }

      // Basic validation
      const errors = [];

      // Validate category (using merged taxonomy)
      if (!transformed.category) {
        errors.push(`category is required. Allowed: ${commitCategories.join(', ')}`);
      } else if (!commitCategories.some(c => c.toLowerCase() === String(transformed.category).toLowerCase())) {
        errors.push(`Invalid category: "${transformed.category}". Allowed: ${commitCategories.join(', ')}`);
      }

      // Validate asset_type (using merged taxonomy)
      if (!transformed.asset_type) {
        errors.push(`asset_type is required. Allowed: ${commitAllAssetTypes.join(', ')}`);
      } else if (!commitAllAssetTypes.some(t => t.toLowerCase() === String(transformed.asset_type).toLowerCase())) {
        errors.push(`Invalid asset_type: "${transformed.asset_type}". Allowed: ${commitAllAssetTypes.join(', ')}`);
      }

      // Validate taxonomy combination (async)
      if (transformed.category && transformed.asset_type) {
        const taxonomyResult = await validateTaxonomyAsync(transformed.category, transformed.asset_type);
        if (!taxonomyResult.valid) {
          errors.push(taxonomyResult.error);
        }
      }

      if (!transformed.make) errors.push(`make is required`);
      if (!transformed.model) errors.push(`model is required`);

      // Validate quantity
      if (!Number.isInteger(transformed.quantity) || transformed.quantity < 1) {
        errors.push(`quantity must be a whole number >= 1`);
      }

      if (errors.length === 0) {
        validRows.push({
          ...transformed,
          _rowNumber: rowNumber,
          _originalRow: row
        });
      } else {
        validationErrors.push({
          rowNumber,
          errors,
          originalData: row
        });
      }
    }

    // If all-or-nothing mode and there are errors, fail
    if (importMode === 'all-or-nothing' && validationErrors.length > 0) {
      fs.unlinkSync(filePath); // Clean up
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Import failed due to validation errors (all-or-nothing mode)',
          details: validationErrors
        }
      });
    }

    // Check serial number uniqueness (only for rows that have serial numbers)
    const serialNumbers = validRows
      .filter(r => r.serial_number) // Only check rows with serial numbers
      .map(r => r.serial_number);

    let existingSerials = [];
    if (serialNumbers.length > 0) {
      const existingAssets = await Asset.findAll({
        where: {
          serial_number: { [Op.in]: serialNumbers }
        },
        attributes: ['serial_number']
      });
      existingSerials = existingAssets.map(a => a.serial_number);
    }

    // Filter out rows with existing serials (only if they have a serial number)
    const rowsToImport = validRows.filter(r =>
      !r.serial_number || !existingSerials.includes(r.serial_number)
    );

    // Import valid rows
    const imported = [];
    const failed = [];

    for (const row of rowsToImport) {
      try {
        const assetTag = await generateAssetTag();
        const { _rowNumber, _originalRow, ...assetData } = row;

        const asset = await Asset.create({
          ...assetData,
          asset_tag: assetTag,
          status: assetData.status || 'In Stock',
          quantity: assetData.quantity || 1,
          import_batch_id: batch.id,
          created_by: req.user?.id,
          updated_by: req.user?.id
        });

        // Log inventory event for import
        await InventoryItemEvent.logImported(
          asset,
          batch.id,
          batch.original_file_name,
          req.user?.id
        );

        imported.push({
          rowNumber: _rowNumber,
          assetTag: asset.asset_tag,
          assetId: asset.id,
          serialNumber: asset.serial_number
        });
      } catch (error) {
        failed.push({
          rowNumber: row._rowNumber,
          error: error.message,
          originalData: row._originalRow
        });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Clean up session
    importSessions.delete(fileId);

    // Update batch with final stats
    const finalStatus = failed.length > 0 || validationErrors.length > 0
      ? 'completed_with_errors'
      : 'completed';

    await batch.update({
      status: finalStatus,
      rows_total: data.length,
      rows_imported: imported.length,
      rows_failed: failed.length + validationErrors.length,
      rows_skipped_duplicates: existingSerials.length,
      error_report_json: validationErrors.length > 0 || failed.length > 0
        ? [...validationErrors, ...failed.map(f => ({ rowNumber: f.rowNumber, errors: [f.error], originalData: f.originalData }))]
        : null
    });

    res.json({
      success: true,
      data: {
        batchId: batch.id,
        imported: imported.length,
        failed: failed.length,
        validationErrors: validationErrors.length,
        skippedDuplicates: existingSerials.length,
        importedAssets: imported,
        failedRows: failed,
        validationErrorDetails: validationErrors,
        duplicateSerials: existingSerials
      },
      message: `Imported ${imported.length} assets successfully. ${failed.length} rows failed. ${existingSerials.length} duplicates skipped.`
    });
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Update batch status to failed
    if (batch) {
      await batch.update({
        status: 'failed',
        error_message: error.message
      });
    }

    // Clean up session
    importSessions.delete(fileId);

    return res.status(500).json({
      success: false,
      error: {
        code: 'IMPORT_ERROR',
        message: 'Import failed: ' + error.message
      }
    });
  }
});

module.exports = exports;
