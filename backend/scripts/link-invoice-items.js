/**
 * Link Invoice Items Repair Script
 *
 * Finds invoices imported from SalesBinder that have 0 items,
 * re-fetches their line items from SalesBinder API, and links
 * them to the now-existing assets in bizhub.
 *
 * Usage: node scripts/link-invoice-items.js
 */

const axios = require('axios')
const { sequelize, Asset, Invoice, InvoiceItem } = require('../models')

const SALESBINDER_CONFIG = {
  baseURL: 'https://entech.salesbinder.com/api/2.0',
  apiKey: '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ',
  username: '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ',
  password: 'x'
}

const RATE_LIMIT_MS = 2000

function info(...args) { console.log(`[${new Date().toISOString()}] [INFO]`, ...args) }
function warn(...args) { console.log(`[${new Date().toISOString()}] [WARN]`, ...args) }
function error(...args) { console.log(`[${new Date().toISOString()}] [ERROR]`, ...args) }

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function sbGet(endpoint, params = {}) {
  await sleep(RATE_LIMIT_MS)
  const resp = await axios.get(`${SALESBINDER_CONFIG.baseURL}/${endpoint}`, {
    auth: { username: SALESBINDER_CONFIG.username, password: SALESBINDER_CONFIG.password },
    params,
    headers: { Accept: 'application/json' }
  })
  return resp.data
}

async function run() {
  info('Starting invoice items repair...')

  // Step 1: Find all invoices imported from SalesBinder that have no items
  const invoices = await Invoice.findAll({
    where: {
      salesbinder_id: { [require('sequelize').Op.ne]: null }
    }
  })

  info(`Found ${invoices.length} SalesBinder-imported invoices`)

  // Check which have no items
  const emptyInvoices = []
  for (const inv of invoices) {
    const itemCount = await InvoiceItem.count({ where: { invoice_id: inv.id } })
    if (itemCount === 0) {
      emptyInvoices.push(inv)
    }
  }

  info(`${emptyInvoices.length} invoices have no items — will attempt to link`)

  if (emptyInvoices.length === 0) {
    info('Nothing to do!')
    return
  }

  // Step 2: Build asset mapping from DB (salesbinder_id → bizhub id)
  const assets = await Asset.findAll({
    where: {
      salesbinder_id: { [require('sequelize').Op.ne]: null }
    },
    attributes: ['id', 'salesbinder_id']
  })

  const assetMapping = {}
  for (const a of assets) {
    assetMapping[a.salesbinder_id] = a.id
  }
  info(`Asset mapping built: ${Object.keys(assetMapping).length} assets`)

  // Step 3: For each empty invoice, fetch its details from SalesBinder and create items
  let totalItemsCreated = 0
  let invoicesFixed = 0
  let invoicesFailed = 0

  for (const invoice of emptyInvoices) {
    const transaction = await sequelize.transaction()

    try {
      // Fetch invoice detail from SalesBinder
      info(`Fetching SalesBinder invoice ${invoice.salesbinder_id}...`)
      const sbData = await sbGet(`documents/${invoice.salesbinder_id}.json`)
      const sbInvoice = sbData?.Document || sbData?.document

      if (!sbInvoice) {
        warn(`Could not fetch SalesBinder invoice ${invoice.salesbinder_id}`)
        await transaction.rollback()
        invoicesFailed++
        continue
      }

      const sbItems = sbInvoice.DocumentItem || sbInvoice.document_items || []
      let itemsCreated = 0

      for (const sbItem of sbItems) {
        const itemId = sbItem.item_id || sbItem.ItemId
        if (!itemId) continue // Skip discount/non-item lines

        const assetId = assetMapping[itemId]
        if (!assetId) {
          warn(`No asset mapping for SB item ${itemId} (${sbItem.description || sbItem.name || 'unknown'})`)
          continue
        }

        const quantity = parseInt(sbItem.quantity) || 1
        const unitPrice = parseFloat(sbItem.price) || 0
        const unitCost = parseFloat(sbItem.cost) || 0

        await InvoiceItem.create({
          invoice_id: invoice.id,
          asset_id: assetId,
          description: sbItem.description || sbItem.name || null,
          quantity,
          unit_price_amount: unitPrice,
          line_total_amount: quantity * unitPrice,
          unit_cost_amount: unitCost,
          line_cost_amount: quantity * unitCost,
          line_profit_amount: (quantity * unitPrice) - (quantity * unitCost)
        }, { transaction })

        itemsCreated++
      }

      // Recalculate invoice totals
      await transaction.commit()

      // Recalculate totals outside transaction
      await invoice.recalculateTotals()

      totalItemsCreated += itemsCreated
      invoicesFixed++
      info(`Linked ${itemsCreated} items to invoice ${invoice.invoice_number} (SB#${invoice.salesbinder_invoice_number})`)

    } catch (err) {
      await transaction.rollback()
      invoicesFailed++
      error(`Failed to link items for invoice ${invoice.invoice_number}:`, err.message)
    }
  }

  info('============================================================')
  info('REPAIR SUMMARY')
  info('============================================================')
  info(`Invoices fixed: ${invoicesFixed}`)
  info(`Invoices failed: ${invoicesFailed}`)
  info(`Total items linked: ${totalItemsCreated}`)
  info('============================================================')
}

run()
  .then(() => {
    info('Repair script completed')
    process.exit(0)
  })
  .catch(err => {
    error('Repair script failed:', err)
    process.exit(1)
  })
