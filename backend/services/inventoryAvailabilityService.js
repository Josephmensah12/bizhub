/**
 * Inventory Availability Service
 *
 * Manages inventory reservations and availability calculations
 * Handles the complex logic of tracking what's available vs. reserved on invoices
 */

const { Asset, InvoiceItem, Invoice, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Get total reserved quantity for an asset across all active invoices
 * Active = non-CANCELLED, non-PAID invoices (UNPAID, PARTIALLY_PAID)
 * 
 * @param {number} assetId - Asset ID
 * @returns {number} Total reserved quantity
 */
async function getReservedQuantity(assetId) {
  try {
    const reservedResult = await InvoiceItem.findOne({
      attributes: [
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'total_reserved']
      ],
      include: [{
        model: Invoice,
        as: 'invoice',
        where: {
          status: {
            [Op.in]: ['UNPAID', 'PARTIALLY_PAID']
          }
        },
        attributes: [] // Don't include invoice data, just use for filtering
      }],
      where: {
        asset_id: assetId,
        voided_at: null
      },
      raw: true
    });

    return parseInt(reservedResult?.total_reserved || 0);
  } catch (error) {
    console.error('Error calculating reserved quantity:', error);
    return 0;
  }
}

/**
 * Compute availability for a single asset with proper locking
 * 
 * @param {number} assetId - Asset ID  
 * @param {Object} options - Options object
 * @param {Transaction} options.transaction - Database transaction for locking
 * @returns {Object} { available, asset } - Available quantity and asset object
 */
async function computeAvailability(assetId, { transaction } = {}) {
  try {
    const queryOptions = transaction ? { transaction, lock: true } : {};
    
    // Get asset with SELECT FOR UPDATE locking if transaction provided
    const asset = await Asset.findByPk(assetId, queryOptions);
    
    if (!asset) {
      return { available: 0, asset: null };
    }

    // Calculate reserved quantity on active invoices
    const reserved = await getReservedQuantity(assetId);
    
    // Available = on-hand quantity minus reserved on active invoices
    const available = Math.max(0, (asset.quantity || 0) - reserved);

    return { 
      available,
      asset
    };
  } catch (error) {
    console.error('Error computing availability:', error);
    return { available: 0, asset: null };
  }
}

/**
 * Compute bulk availability for multiple assets
 * 
 * @param {number[]} assetIds - Array of asset IDs
 * @returns {Map} Map of assetId -> { reserved, available, asset }
 */
async function computeBulkAvailability(assetIds) {
  try {
    if (!assetIds || assetIds.length === 0) {
      return new Map();
    }

    // Get all assets in one query
    const assets = await Asset.findAll({
      where: {
        id: {
          [Op.in]: assetIds
        }
      }
    });

    // Get reserved quantities for all assets in one query
    const reservedResults = await InvoiceItem.findAll({
      attributes: [
        'asset_id',
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'total_reserved']
      ],
      include: [{
        model: Invoice,
        as: 'invoice',
        where: {
          status: {
            [Op.in]: ['UNPAID', 'PARTIALLY_PAID']
          }
        },
        attributes: []
      }],
      where: {
        asset_id: {
          [Op.in]: assetIds
        },
        voided_at: null
      },
      group: ['asset_id'],
      raw: true
    });

    // Create lookup map for reserved quantities
    const reservedMap = new Map();
    reservedResults.forEach(result => {
      reservedMap.set(result.asset_id, parseInt(result.total_reserved || 0));
    });

    // Build final availability map
    const availabilityMap = new Map();
    
    assets.forEach(asset => {
      const reserved = reservedMap.get(asset.id) || 0;
      const available = Math.max(0, (asset.quantity || 0) - reserved);
      
      availabilityMap.set(asset.id, {
        reserved,
        available,
        asset
      });
    });

    return availabilityMap;
  } catch (error) {
    console.error('Error computing bulk availability:', error);
    return new Map();
  }
}

/**
 * Check and reserve inventory for an asset
 * This is a placeholder - may be used for future reservation logic
 * 
 * @param {number} assetId - Asset ID
 * @param {number} quantity - Quantity to reserve
 * @param {Object} options - Options object
 * @param {Transaction} options.transaction - Database transaction
 * @returns {Object} { success, available, message }
 */
async function checkAndReserve(assetId, quantity, { transaction } = {}) {
  try {
    const { available, asset } = await computeAvailability(assetId, { transaction });
    
    if (!asset) {
      return { 
        success: false, 
        available: 0, 
        message: 'Asset not found' 
      };
    }

    if (quantity > available) {
      return { 
        success: false, 
        available, 
        message: `Insufficient inventory. Available: ${available}, Requested: ${quantity}` 
      };
    }

    return { 
      success: true, 
      available, 
      message: 'Reservation successful' 
    };
  } catch (error) {
    console.error('Error in checkAndReserve:', error);
    return { 
      success: false, 
      available: 0, 
      message: 'Error checking availability' 
    };
  }
}

module.exports = {
  getReservedQuantity,
  computeAvailability,
  computeBulkAvailability,
  checkAndReserve
};