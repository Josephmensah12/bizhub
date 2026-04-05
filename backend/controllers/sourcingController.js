/**
 * Sourcing Controller
 *
 * CRUD operations for phone sourcing batches.
 */

const { SourcingBatch, AssetUnit, Asset, User, WarrantyClaim, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const path = require('path');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/sourcing
 * List sourcing batches with pagination and filters.
 */
exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, status, supplier_name } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  const where = {};
  if (status) where.status = status;
  if (supplier_name) where.supplier_name = { [Op.iLike]: `%${supplier_name}%` };

  const { rows: batches, count: total } = await SourcingBatch.findAndCountAll({
    where,
    attributes: {
      include: [
        [
          sequelize.literal(
            '(SELECT COUNT(*) FROM asset_units WHERE asset_units.sourcing_batch_id = "SourcingBatch".id)'
          ),
          'unit_count'
        ]
      ]
    },
    order: [['created_at', 'DESC']],
    limit: +limit,
    offset
  });

  return res.json({
    success: true,
    data: {
      batches,
      pagination: {
        page: +page,
        limit: +limit,
        total,
        totalPages: Math.ceil(total / +limit)
      }
    }
  });
});

/**
 * POST /api/v1/sourcing
 * Create a new sourcing batch.
 */
exports.create = asyncHandler(async (req, res) => {
  const data = { ...req.body, created_by: req.user.id };

  // Auto-compute warranty expiry
  if (data.arrival_date && data.warranty_days) {
    const arrival = new Date(data.arrival_date);
    arrival.setDate(arrival.getDate() + +data.warranty_days);
    data.warranty_expires_on = arrival;
  }

  const batch = await SourcingBatch.create(data);

  return res.status(201).json({
    success: true,
    data: batch
  });
});

/**
 * GET /api/v1/sourcing/:id
 * Get batch detail with units and warranty claims.
 */
exports.detail = asyncHandler(async (req, res) => {
  const batch = await SourcingBatch.findByPk(req.params.id, {
    include: [
      {
        model: AssetUnit,
        as: 'units',
        include: [{ model: Asset, as: 'asset', attributes: ['id', 'make', 'model'] }]
      },
      {
        model: WarrantyClaim,
        as: 'warrantyClaims'
      }
    ]
  });

  if (!batch) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Sourcing batch not found' }
    });
  }

  return res.json({ success: true, data: batch });
});

/**
 * PATCH /api/v1/sourcing/:id
 * Update a sourcing batch.
 */
exports.update = asyncHandler(async (req, res) => {
  const batch = await SourcingBatch.findByPk(req.params.id);
  if (!batch) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Sourcing batch not found' }
    });
  }

  const updates = { ...req.body };

  // Auto-compute warranty expiry when arrival_date is being set
  if (updates.arrival_date) {
    const warrantyDays = updates.warranty_days || batch.warranty_days;
    if (warrantyDays) {
      const arrival = new Date(updates.arrival_date);
      arrival.setDate(arrival.getDate() + +warrantyDays);
      updates.warranty_expires_on = arrival;
    }
  }

  await batch.update(updates);

  return res.json({ success: true, data: batch });
});

/**
 * GET /api/v1/sourcing/:id/performance
 * Get performance metrics for a sourcing batch from the performance view.
 */
exports.performance = asyncHandler(async (req, res) => {
  const results = await sequelize.query(
    'SELECT * FROM view_sourcing_performance WHERE batch_id = :id',
    {
      replacements: { id: req.params.id },
      type: QueryTypes.SELECT
    }
  );

  return res.json({ success: true, data: results });
});

/**
 * GET /api/v1/sourcing/verification-template
 * Download blank Phone Verification Template (.xlsx)
 * Available to ALL authenticated users.
 */
exports.verificationTemplate = asyncHandler(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BizHub';
  const ws = wb.addWorksheet('Phone Verification', {
    properties: { defaultColWidth: 18 }
  });

  // Header row
  ws.columns = [
    { header: '#', key: 'num', width: 5 },
    { header: 'Model', key: 'model', width: 28 },
    { header: 'Storage (GB)', key: 'storage', width: 14 },
    { header: 'Color', key: 'color', width: 18 },
    { header: 'IMEI', key: 'imei', width: 20 },
    { header: 'Serial Number', key: 'serial', width: 20 },
    { header: 'Battery Health %', key: 'bh', width: 16 },
    { header: 'Error', key: 'error', width: 30 },
  ];

  // Style header
  ws.getRow(1).font = { bold: true, size: 11 };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  ws.getRow(1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).alignment = { horizontal: 'center' };

  const STORAGE_OPTIONS = '"64,128,256,512,1024"';
  const ROW_COUNT = 30;

  for (let i = 2; i <= ROW_COUNT + 1; i++) {
    ws.getCell(`A${i}`).value = i - 1;
    ws.getCell(`A${i}`).alignment = { horizontal: 'center' };

    // Storage dropdown
    ws.getCell(`C${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [STORAGE_OPTIONS],
      showErrorMessage: true,
      errorTitle: 'Invalid Storage',
      error: 'Select: 64, 128, 256, 512, or 1024'
    };

    // IMEI: must be exactly 15 digits
    ws.getCell(`E${i}`).dataValidation = {
      type: 'textLength',
      operator: 'equal',
      allowBlank: true,
      formulae: [15],
      showErrorMessage: true,
      errorTitle: 'Invalid IMEI',
      error: 'IMEI must be exactly 15 digits'
    };
    ws.getCell(`E${i}`).numFmt = '@'; // text format to preserve leading zeros

    // Battery Health: 0-100
    ws.getCell(`G${i}`).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [0, 100],
      showErrorMessage: true,
      errorTitle: 'Invalid Battery Health',
      error: 'Enter a value between 0 and 100'
    };

    // Error column: formula to flag issues
    ws.getCell(`H${i}`).value = {
      formula: `IF(AND(E${i}<>"",LEN(E${i})<>15),"IMEI not 15 digits",IF(AND(G${i}<>"",OR(G${i}<0,G${i}>100)),"BH out of range",""))`,
    };
    ws.getCell(`H${i}`).font = { color: { argb: 'FFEF4444' } };

    // Alternate row color
    if (i % 2 === 0) {
      for (let c = 1; c <= 8; c++) {
        ws.getRow(i).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
      }
    }
  }

  // Instructions sheet
  const instrWs = wb.addWorksheet('Instructions');
  instrWs.getColumn(1).width = 80;
  const instructions = [
    'PHONE VERIFICATION TEMPLATE — Instructions',
    '',
    '1. Open each phone and record the details in the "Phone Verification" sheet',
    '2. Model: e.g., "iPhone 13 Pro", "iPhone 14 Pro Max"',
    '3. Storage: Select from dropdown (64, 128, 256, 512, 1024 GB)',
    '4. Color: e.g., "Graphite", "Sierra Blue", "Gold"',
    '5. IMEI: Scan with barcode scanner or type the 15-digit number from Settings > General > About',
    '6. Serial Number: Found in Settings > General > About',
    '7. Battery Health %: Found in Settings > Battery > Battery Health & Charging',
    '8. The Error column auto-flags invalid IMEI length or BH values',
    '',
    'DO NOT modify column headers or add extra columns.',
    'Return the completed file to Admin for processing.',
  ];
  instructions.forEach((text, i) => {
    instrWs.getCell(`A${i + 1}`).value = text;
    if (i === 0) instrWs.getCell(`A${i + 1}`).font = { bold: true, size: 14 };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Phone_Verification_Template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

/**
 * POST /api/v1/sourcing/import
 * Bulk import phones from xlsx file into a sourcing batch.
 * Admin only. Creates AssetUnits linked to the batch.
 */
exports.importBatch = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Upload an .xlsx file' } });
  }

  const {
    sourcing_batch_id, supplier_name, batch_reference,
    shipping_cost_per_unit_usd, import_duty_rate, fx_rate_at_purchase, handling_per_unit_ghs,
    order_date, supplier_type = 'b2b_platform'
  } = req.body;

  const dbTransaction = await sequelize.transaction();

  try {
    // Parse Excel
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      await dbTransaction.rollback();
      return res.status(400).json({ success: false, error: { code: 'EMPTY_FILE', message: 'No data rows found' } });
    }

    // Find or create batch
    let batch;
    if (sourcing_batch_id) {
      batch = await SourcingBatch.findByPk(sourcing_batch_id, { transaction: dbTransaction });
      if (!batch) { await dbTransaction.rollback(); return res.status(404).json({ success: false, error: { code: 'BATCH_NOT_FOUND', message: 'Sourcing batch not found' } }); }
    } else {
      // Create new batch
      const totalCostUsd = rows.reduce((s, r) => s + (parseFloat(r['Unit Price'] || r['unit_price_usd'] || r['cost_usd'] || 0)), 0);
      batch = await SourcingBatch.create({
        batch_reference: batch_reference || `IMPORT-${Date.now()}`,
        supplier_name: supplier_name || 'Unknown',
        supplier_type,
        order_date: order_date || new Date().toISOString().slice(0, 10),
        total_units: rows.length,
        total_cost_usd: Math.round(totalCostUsd * 100) / 100,
        shipping_cost_per_unit_usd: parseFloat(shipping_cost_per_unit_usd) || 0,
        import_duty_rate: parseFloat(import_duty_rate) || 0,
        fx_rate_at_purchase: parseFloat(fx_rate_at_purchase) || 1,
        handling_per_unit_ghs: parseFloat(handling_per_unit_ghs) || 0,
        status: 'ordered',
        created_by: req.user.id,
      }, { transaction: dbTransaction });
    }

    // Color tier map
    const colorTierMap = {
      black: 1, graphite: 1, 'space black': 1, 'space gray': 1, midnight: 1,
      silver: 2, gold: 2, starlight: 2, white: 2, 'natural titanium': 2, 'white titanium': 2,
      blue: 3, 'sierra blue': 3, 'pacific blue': 3, 'blue titanium': 3, purple: 3, 'deep purple': 3,
      green: 4, pink: 4, red: 4, yellow: 4, orange: 4, coral: 4,
    };

    const units = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row (1-indexed + header)

      // Flexible column mapping (supports verification template AND ecoATM format)
      const model = row['Model'] || row['model'] || '';
      const storage = parseInt(row['Storage (GB)'] || row['storage'] || row['Storage'] || 0);
      const color = row['Color'] || row['color'] || row['phone_color'] || '';
      const imei = String(row['IMEI'] || row['imei'] || '').trim();
      const serial = String(row['Serial Number'] || row['serial_number'] || row['serial'] || '').trim();
      const bh = row['Battery Health %'] || row['battery_health_percent'] || row['bh'];
      const costUsd = parseFloat(row['Unit Price'] || row['unit_price_usd'] || row['cost_usd'] || 0);
      const supplierSku = row['SKU'] || row['supplier_sku'] || '';
      const supplierGrade = row['supplier_grade'] || row['Grade'] || row['grade'] || '';
      const buyDecision = row['buy_decision'] || '';
      const projectedSell = parseFloat(row['projected_sell_ghs'] || row['projected_sell_price_ghs'] || 0);

      // ecoATM Description parsing: "iPhone 13 Pro 1TB (Unlocked).1TB.Graphite.GradeB"
      let parsedModel = model, parsedStorage = storage, parsedColor = color, parsedGrade = supplierGrade;
      const desc = row['Description'] || '';
      if (desc && desc.includes('.') && !model) {
        const parts = desc.split('.');
        parsedModel = (parts[0] || '').replace(/\(.*?\)/g, '').trim();
        if (parts[1]) parsedStorage = parseInt(parts[1]) || storage;
        if (parts[2]) parsedColor = parts[2].trim();
        if (parts[3]) parsedGrade = parts[3].replace(/^Grade/i, '').trim();
      }

      // Validation
      if (!parsedModel && !desc) { errors.push({ row: rowNum, error: 'No model or description' }); continue; }
      if (imei && imei.length !== 15) { errors.push({ row: rowNum, error: `IMEI "${imei}" is not 15 digits` }); continue; }

      // Auto-detect eSIM
      const esimOnly = /iPhone\s*(14|15|16)/i.test(parsedModel || desc);

      // Color tier
      const colorLower = (parsedColor || '').toLowerCase().trim();
      const colorTier = colorTierMap[colorLower] || null;

      // Landed cost
      const landedCost = batch.computeLandedCost(costUsd);

      // Projected margin
      let projectedMargin = null;
      if (projectedSell > 0 && landedCost > 0) {
        projectedMargin = Math.round(((projectedSell - landedCost) / projectedSell) * 10000) / 100;
      }

      // Auto buy decision
      let autoBuyDecision = buyDecision;
      if (!autoBuyDecision && projectedMargin != null) {
        if (projectedMargin >= 30) autoBuyDecision = 'STRONG_BUY';
        else if (projectedMargin >= 20) autoBuyDecision = 'BUY';
        else if (projectedMargin >= 15) autoBuyDecision = 'NEGOTIATE';
        else autoBuyDecision = 'NO_BUY';
      }

      // Battery flag
      const bhInt = bh != null ? parseInt(bh) : null;
      let batteryFlag = null;
      if (bhInt != null) {
        if (bhInt < 80) batteryFlag = 'SERVICE_WARNING';
        else if (bhInt < 85) batteryFlag = 'LOW';
      }

      // Find or create the Asset (product)
      const assetName = `${parsedModel} ${parsedStorage ? parsedStorage + 'GB' : ''}`.trim();
      let [asset] = await Asset.findOrCreate({
        where: { make: 'Apple', model: assetName, category: 'Smartphone', asset_type: 'iPhone' },
        defaults: {
          make: 'Apple', model: assetName, category: 'Smartphone', asset_type: 'iPhone',
          is_serialized: true, quantity: 0, cost_amount: costUsd, price_amount: projectedSell || 0,
        },
        transaction: dbTransaction,
      });

      // Create AssetUnit
      const unit = await AssetUnit.create({
        asset_id: asset.id,
        serial_number: serial || null,
        imei: imei || null,
        cost_amount: costUsd,
        price_amount: projectedSell || 0,
        storage: parsedStorage || null,
        phone_color: parsedColor || null,
        color_tier: colorTier,
        supplier_sku: supplierSku || null,
        supplier_grade: parsedGrade || null,
        esim_only: esimOnly,
        battery_health_percent: bhInt,
        battery_flag: batteryFlag,
        sourcing_batch_id: batch.id,
        landed_cost_ghs: landedCost,
        projected_sell_price_ghs: projectedSell || null,
        projected_margin_percent: projectedMargin,
        buy_decision: autoBuyDecision || null,
        status: 'Available',
        purchase_date: batch.order_date,
      }, { transaction: dbTransaction });

      // Update asset quantity
      asset.quantity = (asset.quantity || 0) + 1;
      await asset.save({ transaction: dbTransaction });

      units.push(unit);
    }

    // Update batch unit count
    batch.total_units = units.length;
    await batch.save({ transaction: dbTransaction });

    // Recompute batch totals
    await batch.recomputeTotals(dbTransaction);

    await dbTransaction.commit();

    res.status(201).json({
      success: true,
      data: {
        batch_id: batch.id,
        batch_reference: batch.batch_reference,
        units_created: units.length,
        errors,
      },
      message: `Imported ${units.length} units${errors.length > 0 ? `, ${errors.length} rows skipped` : ''}`
    });
  } catch (err) {
    await dbTransaction.rollback();
    throw err;
  }
});
