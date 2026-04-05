/**
 * Sourcing Report Controller
 *
 * Query SQL views for sourcing analytics.
 */

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/**
 * GET /api/v1/sourcing/reports/supplier-scorecard
 */
exports.supplierScorecard = asyncHandler(async (req, res) => {
  const data = await sequelize.query('SELECT * FROM view_supplier_scorecard', {
    type: QueryTypes.SELECT
  });
  return res.json({ success: true, data });
});

/**
 * GET /api/v1/sourcing/reports/model-profitability
 */
exports.modelProfitability = asyncHandler(async (req, res) => {
  const data = await sequelize.query('SELECT * FROM view_model_profitability', {
    type: QueryTypes.SELECT
  });
  return res.json({ success: true, data });
});

/**
 * GET /api/v1/sourcing/reports/warranty-summary
 */
exports.warrantySummary = asyncHandler(async (req, res) => {
  const data = await sequelize.query('SELECT * FROM view_warranty_summary', {
    type: QueryTypes.SELECT
  });
  return res.json({ success: true, data });
});
