/**
 * Asset Tag Generation Utility
 * Generates unique asset tags in format: INV-YYMMDD-### or INV-######
 */

const { Asset } = require('../models')

/**
 * Generate a unique asset tag
 * Format: INV-YYYYMMDD-### (e.g., INV-20260213-001)
 * Falls back to INV-###### if date format conflicts exist
 */
async function generateAssetTag() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `INV-${year}${month}${day}-`
  
  // Try date-based format first
  for (let counter = 1; counter <= 999; counter++) {
    const tag = `${datePrefix}${String(counter).padStart(3, '0')}`
    
    const existing = await Asset.findOne({
      where: { asset_tag: tag },
      paranoid: false // Check deleted assets too
    })
    
    if (!existing) {
      return tag
    }
  }
  
  // Fallback to simple sequential numbering
  for (let counter = 1; counter <= 999999; counter++) {
    const tag = `INV-${String(counter).padStart(6, '0')}`
    
    const existing = await Asset.findOne({
      where: { asset_tag: tag },
      paranoid: false
    })
    
    if (!existing) {
      return tag
    }
  }
  
  // If we somehow get here, generate a UUID-based tag
  const { v4: uuidv4 } = require('uuid')
  return `INV-${uuidv4().slice(0, 8).toUpperCase()}`
}

module.exports = { generateAssetTag }