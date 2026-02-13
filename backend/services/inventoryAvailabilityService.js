/**
 * Inventory Availability Service
 *
 * Computes real-time available quantity for assets by examining invoice_items.
 * Reservation is "virtual" — an asset is reserved when it appears on an
 * active (non-CANCELLED, non-PAID) invoice line that hasn't been voided.
 *
 * On-hand quantity (asset.quantity) is only decremented when an invoice
 * becomes PAID, and restored on void/return/cancel.
 */

const { Asset, InvoiceItem, Invoice, sequelize } = require('../models');
const { QueryTypes, Op } = require('sequelize');

/**
 * Get total reserved quantity for a single asset.
 * Reserved = sum of qty on active (UNPAID | PARTIALLY_PAID) non-voided invoice items.
 *
 * @param {number} assetId
 * @param {object} [options]
 * @param {Transaction} [options.transaction] - Sequelize transaction
 * @returns {Promise<number>} reserved quantity
 */
async function getReservedQuantity(assetId, options = {}) {
  const queryOptions = { type: QueryTypes.SELECT };
  if (options.transaction) queryOptions.transaction = options.transaction;

  const [result] = await sequelize.query(
    `SELECT COALESCE(SUM(ii.quantity), 0) AS reserved
     FROM invoice_items ii
     JOIN invoices i ON ii.invoice_id = i.id
     WHERE ii.asset_id = :assetId
       AND i.status NOT IN ('CANCELLED', 'PAID')
       AND ii.voided_at IS NULL`,
    { replacements: { assetId }, ...queryOptions }
  );

  return parseInt(result.reserved) || 0;
}

/**
 * Compute availability for a single asset with row-level locking.
 * Uses SELECT … FOR UPDATE on the asset row to prevent race conditions
 * when multiple requests try to reserve the same item concurrently.
 *
 * @param {number} assetId
 * @param {object} [options]
 * @param {Transaction} [options.transaction] - REQUIRED for row locking
 * @returns {Promise<{ available: number, reserved: number, asset: Asset|null }>}
 */
async function computeAvailability(assetId, options = {}) {
  const { transaction } = options;

  // Lock the asset row if inside a transaction
  let asset;
  if (transaction) {
    asset = await Asset.findByPk(assetId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
  } else {
    asset = await Asset.findByPk(assetId);
  }

  if (!asset) {
    return { available: 0, reserved: 0, asset: null };
  }

  const reserved = await getReservedQuantity(assetId, { transaction });
  const onHand = parseInt(asset.quantity) || 0;
  const available = Math.max(0, onHand - reserved);

  return { available, reserved, asset };
}

/**
 * Compute availability for multiple assets in a single query.
 * Returns a Map of assetId → { reserved, available, onHand }.
 *
 * @param {number[]} assetIds
 * @param {object} [options]
 * @param {Transaction} [options.transaction]
 * @returns {Promise<Map<number, { reserved: number, available: number, onHand: number }>>}
 */
async function computeBulkAvailability(assetIds, options = {}) {
  const result = new Map();

  if (!assetIds || assetIds.length === 0) return result;

  const queryOptions = { type: QueryTypes.SELECT };
  if (options.transaction) queryOptions.transaction = options.transaction;

  // Get all reserved quantities in one query
  const rows = await sequelize.query(
    `SELECT ii.asset_id,
            COALESCE(SUM(ii.quantity), 0) AS reserved
     FROM invoice_items ii
     JOIN invoices i ON ii.invoice_id = i.id
     WHERE ii.asset_id IN (:assetIds)
       AND i.status NOT IN ('CANCELLED', 'PAID')
       AND ii.voided_at IS NULL
     GROUP BY ii.asset_id`,
    { replacements: { assetIds }, ...queryOptions }
  );

  // Build a lookup from the query results
  const reservedMap = new Map();
  for (const row of rows) {
    reservedMap.set(parseInt(row.asset_id), parseInt(row.reserved) || 0);
  }

  // Get on-hand quantities for all requested assets
  const findOptions = {
    where: { id: { [Op.in]: assetIds } },
    attributes: ['id', 'quantity'],
    paranoid: false // include soft-deleted so callers can check
  };
  if (options.transaction) findOptions.transaction = options.transaction;

  const assets = await Asset.findAll(findOptions);

  for (const asset of assets) {
    const onHand = parseInt(asset.quantity) || 0;
    const reserved = reservedMap.get(asset.id) || 0;
    result.set(asset.id, {
      reserved,
      onHand,
      available: Math.max(0, onHand - reserved)
    });
  }

  return result;
}

/**
 * Check availability and reserve in one step.
 * This is a convenience wrapper that computes availability within a
 * transaction and returns whether the requested quantity is available.
 *
 * NOTE: The actual "reservation" happens when the caller creates the
 * InvoiceItem row. This function only validates that stock is sufficient.
 *
 * @param {number} assetId
 * @param {number} requestedQty
 * @param {object} [options]
 * @param {Transaction} [options.transaction]
 * @returns {Promise<{ ok: boolean, available: number, asset: Asset|null }>}
 */
async function checkAndReserve(assetId, requestedQty, options = {}) {
  const { available, asset } = await computeAvailability(assetId, options);
  return {
    ok: available >= requestedQty,
    available,
    asset
  };
}

module.exports = {
  getReservedQuantity,
  computeAvailability,
  computeBulkAvailability,
  checkAndReserve
};
