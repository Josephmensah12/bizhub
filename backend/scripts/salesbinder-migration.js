/**
 * SalesBinder → Bizhub Migration Script
 * 
 * Migrates February 2026 data from SalesBinder to bizhub:
 * - Customers
 * - Assets (inventory items)
 * - Invoices + Invoice Items
 * 
 * Usage: node scripts/salesbinder-migration.js
 */

const axios = require('axios')
const { sequelize, Customer, Asset, Invoice, InvoiceItem, User } = require('../models')
const { generateAssetTag } = require('../utils/assetTag')

// SalesBinder API configuration
const SALESBINDER_CONFIG = {
  baseURL: 'https://entech.salesbinder.com/api/2.0',
  apiKey: '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ', // Joe's key
  username: '4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ',
  password: 'x'
}

// Bizhub API configuration (local)
const BIZHUB_CONFIG = {
  baseURL: 'http://localhost:5000/api/v1',
  // We'll use direct database inserts for better control
}

// Rate limiting
const RATE_LIMIT_MS = 2000 // 2 seconds between API calls

// Category mapping: SalesBinder → Bizhub taxonomy
const CATEGORY_MAPPING = {
  'Laptop': { category: 'Computer', asset_type: 'Laptop' },
  'TELEVISION': { category: 'Consumer Electronics', asset_type: 'Television' },
  'MISCELLANEOUS ': { category: 'Consumer Electronics', asset_type: 'Audio Equipment' }, // soundbars, speakers
  'MISCELLANEOUS': { category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  'Apple iPHONE 8 PLUS': { category: 'Smartphone', asset_type: 'iPhone' },
  'Apple iPHONE 7 PLUS': { category: 'Smartphone', asset_type: 'iPhone' },
  'apple Iphone': { category: 'Smartphone', asset_type: 'iPhone' },
  'MACBOOKS ': { category: 'Computer', asset_type: 'MacBook' },
  'MACBOOKS': { category: 'Computer', asset_type: 'MacBook' },
  'MICROSOFT SURFACE ': { category: 'Computer', asset_type: 'Tablet' },
  'MICROSOFT SURFACE': { category: 'Computer', asset_type: 'Tablet' },
  'Hard Drives ': { category: 'Computer', asset_type: 'Storage Device' },
  'Memory DDR$': { category: 'Computer', asset_type: 'Memory' },
  'APPLE AIRPOD': { category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  'Beats Headphones ': { category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  'BLUETOOTH AUDIO': { category: 'Consumer Electronics', asset_type: 'Audio Equipment' },
  'MONITOR': { category: 'Computer', asset_type: 'Monitor' },
}

// User mapping: SalesBinder → Bizhub
const USER_MAPPING = {
  'Joyce Boye': null, // Will be populated after checking bizhub users
  'Joseph Narh': null,
  'Joseph Mensah': null // Owner
}

// Statistics tracking
const stats = {
  customers: { processed: 0, created: 0, skipped: 0, errors: 0 },
  assets: { processed: 0, created: 0, skipped: 0, errors: 0 },
  invoices: { processed: 0, created: 0, skipped: 0, errors: 0 },
  invoiceItems: { processed: 0, created: 0, skipped: 0, errors: 0 }
}

// Logging utilities
function log(level, message, data = null) {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`
  
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2))
  } else {
    console.log(`${prefix} ${message}`)
  }
}

function info(message, data) { log('info', message, data) }
function warn(message, data) { log('warn', message, data) }
function error(message, data) { log('error', message, data) }

// SalesBinder API client
class SalesBinderAPI {
  constructor() {
    this.client = axios.create({
      baseURL: SALESBINDER_CONFIG.baseURL,
      auth: {
        username: SALESBINDER_CONFIG.username,
        password: SALESBINDER_CONFIG.password
      }
    })
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async get(endpoint, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.sleep(RATE_LIMIT_MS)
        const response = await this.client.get(endpoint)
        return response.data
      } catch (err) {
        if (err.response?.status === 429) {
          warn(`Rate limited, waiting ${Math.pow(2, i + 1) * 5}s before retry ${i + 1}/${retries}`)
          await this.sleep(Math.pow(2, i + 1) * 5000)
          continue
        }
        if (i === retries - 1) throw err
        warn(`API error (${err.response?.status}), retrying...`, err.response?.data)
        await this.sleep(2000)
      }
    }
  }

  async getAllPages(endpoint) {
    const results = []
    let page = 1
    let totalPages = null
    
    while (totalPages === null || page <= totalPages) {
      info(`Fetching ${endpoint} page ${page}${totalPages ? `/${totalPages}` : ''}`)
      
      const data = await this.get(`${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}`)
      
      if (totalPages === null) {
        totalPages = parseInt(data.pages)
        info(`Total pages for ${endpoint}: ${totalPages}`)
      }
      
      // Handle different API response structures
      const items = data.items?.[0] || data.documents?.[0] || data.customers?.[0] || data.categories?.[0] || []
      results.push(...items)
      
      page++
    }
    
    return results
  }
}

// Data fetchers
async function fetchSalesBinderData() {
  const api = new SalesBinderAPI()
  
  info('Starting SalesBinder data fetch...')
  
  // Get February 2026 invoices
  info('Fetching February 2026 invoices...')
  const allInvoices = await api.getAllPages('documents.json?contextId=5')
  
  // Filter to February 2026 only
  const feb2026Invoices = allInvoices.filter(invoice => {
    const invoiceDate = new Date(invoice.issue_date)
    return invoiceDate.getFullYear() === 2026 && invoiceDate.getMonth() === 1 // February = month 1
  })
  
  info(`Found ${feb2026Invoices.length} invoices for February 2026`)
  
  // Get all customers (we'll filter to relevant ones later)
  info('Fetching customers...')
  const allCustomers = await api.getAllPages('customers.json')
  
  // Get customer IDs from February invoices
  const customerIds = new Set(
    feb2026Invoices
      .filter(inv => inv.customer_id)
      .map(inv => inv.customer_id)
  )
  
  const relevantCustomers = allCustomers.filter(c => customerIds.has(c.id))
  info(`Found ${relevantCustomers.length} customers used in February 2026`)
  
  // Get all items from invoice line items
  const itemIds = new Set()
  feb2026Invoices.forEach(invoice => {
    if (invoice.document_items) {
      invoice.document_items.forEach(item => {
        if (item.item_id) {
          itemIds.add(item.item_id)
        }
      })
    }
  })
  
  info(`Need to fetch ${itemIds.size} unique items`)
  
  // Fetch individual items (SalesBinder API requires individual calls)
  const items = []
  let itemCount = 0
  for (const itemId of itemIds) {
    try {
      itemCount++
      info(`Fetching item ${itemCount}/${itemIds.size}: ${itemId}`)
      const itemData = await api.get(`items/${itemId}.json`)
      if (itemData.item) {
        items.push(itemData.item)
      }
    } catch (err) {
      warn(`Failed to fetch item ${itemId}:`, err.message)
    }
  }
  
  info(`Successfully fetched ${items.length} items`)
  
  return {
    invoices: feb2026Invoices,
    customers: relevantCustomers,
    items
  }
}

// Data mappers
function mapCustomer(sbCustomer) {
  // Split full name into first_name and last_name
  const fullName = sbCustomer.name?.trim() || 'Unknown'
  const nameParts = fullName.split(' ')
  const firstName = nameParts[0] || 'Unknown'
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
  
  return {
    first_name: firstName,
    last_name: lastName,
    phone_raw: sbCustomer.office_phone?.trim() || null,
    email: sbCustomer.office_email?.trim() || null,
    address_line_1: sbCustomer.billing_address_1?.trim() || null,
    address_line_2: sbCustomer.billing_address_2?.trim() || null,
    city: sbCustomer.billing_city?.trim() || null,
    state_province: sbCustomer.billing_region?.trim() || null,
    postal_code: sbCustomer.billing_postal_code?.trim() || null,
    country: sbCustomer.billing_country?.trim() || 'Ghana',
    notes: `Imported from SalesBinder. Customer #${sbCustomer.customer_number}`,
    source: 'SalesBinder Import',
    salesbinder_id: sbCustomer.id
  }
}

function mapAsset(sbItem) {
  const sbCategory = sbItem.category?.name || 'MISCELLANEOUS'
  const mapping = CATEGORY_MAPPING[sbCategory] || { category: 'Consumer Electronics', asset_type: 'Other' }
  
  // Parse specs from item details
  let specs = []
  let ramGb = null
  let storageGb = null
  let cpu = null
  
  if (sbItem.item_details) {
    sbItem.item_details.forEach(detail => {
      const fieldName = detail.custom_field?.name
      const value = detail.value
      
      if (fieldName === 'Memory' && value) {
        const memVal = parseInt(value)
        if (!isNaN(memVal)) {
          ramGb = memVal >= 1024 ? Math.round(memVal / 1024) : memVal // Convert MB to GB if needed
        }
        specs.push(`RAM: ${value}`)
      } else if (fieldName === 'HDD' && value) {
        const hddVal = parseInt(value)
        if (!isNaN(hddVal)) {
          storageGb = hddVal
        }
        specs.push(`Storage: ${value}GB`)
      } else if (fieldName === 'CPU' && value) {
        cpu = value
        specs.push(`CPU: ${value}`)
      } else if (fieldName === 'CPU Model' && value) {
        specs.push(`CPU Model: ${value}`)
      } else if (fieldName === 'Detail Condition' && value) {
        specs.push(`Condition: ${value}`)
      }
    })
  }
  
  // Extract make/model from name
  const name = sbItem.name || 'Unknown'
  let make = 'Unknown'
  let model = name
  
  // Common patterns for make extraction
  const makePatterns = [
    /^(HP|DELL|APPLE|LENOVO|ASUS|ACER|SAMSUNG|SONY|LG|JBL|BOSE|MICROSOFT|TOSHIBA|KLIPSCH|YAMAHA|VIZIO|ION)\b/i,
    /^(EB\s+X360|ELITEBOOK|LATITUDE|MACBOOK|SURFACE|PROBOOK|ZBOOK)\b/i
  ]
  
  for (const pattern of makePatterns) {
    const match = name.match(pattern)
    if (match) {
      make = match[1].toUpperCase()
      model = name.replace(pattern, '').trim()
      break
    }
  }
  
  // Handle HP-specific models
  if (name.includes('HP') && make === 'Unknown') {
    make = 'HP'
    model = name.replace(/^HP\s+/i, '').trim()
  }
  
  // Handle Dell-specific models
  if (name.includes('DELL') && make === 'Unknown') {
    make = 'DELL' 
    model = name.replace(/^DELL\s+/i, '').trim()
  }
  
  return {
    category: mapping.category,
    asset_type: mapping.asset_type,
    make: make,
    model: model || name,
    serial_number: sbItem.serial_number?.trim() || null,
    condition: sbItem.condition || 'Used', // Default to Used for refurb business
    quantity: Math.max(0, parseInt(sbItem.quantity) || 0),
    cost_amount: parseFloat(sbItem.cost) || null,
    cost_currency: 'GHS', // SalesBinder prices are in GHS
    price_amount: parseFloat(sbItem.price) || null,
    price_currency: 'GHS',
    specs: specs.length > 0 ? specs.join('; ') : null,
    ram_gb: ramGb,
    storage_gb: storageGb,
    cpu: cpu,
    status: parseInt(sbItem.quantity) > 0 ? 'In Stock' : 'Sold',
    created_by: 1, // Default to admin user
    salesbinder_id: sbItem.id
  }
}

function mapInvoice(sbInvoice, customerMapping, userMapping) {
  const customerId = sbInvoice.customer_id ? customerMapping[sbInvoice.customer_id] : null
  const staffName = `${sbInvoice.user?.first_name || ''} ${sbInvoice.user?.last_name || ''}`.trim()
  const createdBy = userMapping[staffName] || 1 // Default to admin
  
  return {
    customer_id: customerId,
    invoice_date: new Date(sbInvoice.issue_date),
    status: mapInvoiceStatus(sbInvoice.status?.name),
    currency: 'GHS',
    subtotal_amount: parseFloat(sbInvoice.total_cost) || 0,
    total_amount: parseFloat(sbInvoice.total_price) || 0,
    amount_paid: parseFloat(sbInvoice.total_transactions) || 0,
    total_cost_amount: parseFloat(sbInvoice.total_cost) || 0,
    total_profit_amount: (parseFloat(sbInvoice.total_price) || 0) - (parseFloat(sbInvoice.total_cost) || 0),
    notes: `Imported from SalesBinder. Original invoice #${sbInvoice.document_number}`,
    created_by: createdBy,
    salesbinder_id: sbInvoice.id,
    salesbinder_invoice_number: sbInvoice.document_number
  }
}

function mapInvoiceStatus(sbStatus) {
  switch (sbStatus) {
    case 'paid in full': return 'PAID'
    case 'unpaid': return 'UNPAID'
    case 'partially paid': return 'PARTIALLY_PAID'
    case 'cancelled': return 'CANCELLED'
    default: return 'UNPAID'
  }
}

function mapInvoiceItem(sbInvoiceItem, assetMapping) {
  const assetId = assetMapping[sbInvoiceItem.item_id]
  if (!assetId) {
    warn(`No asset mapping found for item ${sbInvoiceItem.item_id}`)
    return null
  }
  
  const quantity = parseInt(sbInvoiceItem.quantity) || 1
  const unitPrice = parseFloat(sbInvoiceItem.price) || 0
  const unitCost = parseFloat(sbInvoiceItem.cost) || 0
  
  return {
    asset_id: assetId,
    description: sbInvoiceItem.description || null,
    quantity: quantity,
    unit_price_amount: unitPrice,
    line_total_amount: quantity * unitPrice,
    unit_cost_amount: unitCost,
    line_cost_amount: quantity * unitCost,
    line_profit_amount: (quantity * unitPrice) - (quantity * unitCost)
  }
}

// Database operations
async function setupUserMapping() {
  info('Setting up user mapping...')
  
  const users = await User.findAll({
    attributes: ['id', 'first_name', 'last_name']
  })
  
  users.forEach(user => {
    const fullName = `${user.first_name} ${user.last_name}`.trim()
    if (USER_MAPPING.hasOwnProperty(fullName)) {
      USER_MAPPING[fullName] = user.id
      info(`Mapped user: ${fullName} → ID ${user.id}`)
    }
  })
  
  info('User mapping complete:', USER_MAPPING)
}

async function migrateCustomers(sbCustomers) {
  info(`Starting customer migration (${sbCustomers.length} customers)...`)
  
  const customerMapping = {}
  
  for (const sbCustomer of sbCustomers) {
    try {
      stats.customers.processed++
      
      // Check if customer already exists (by salesbinder_id first, then name and phone)
      let existing = await Customer.findOne({
        where: { salesbinder_id: sbCustomer.id }
      })
      
      if (!existing && sbCustomer.name) {
        const fullName = sbCustomer.name.trim()
        const nameParts = fullName.split(' ')
        const firstName = nameParts[0]
        
        existing = await Customer.findOne({
          where: {
            first_name: firstName,
            ...(sbCustomer.office_phone && { phone_raw: sbCustomer.office_phone })
          }
        })
      }
      
      if (existing) {
        customerMapping[sbCustomer.id] = existing.id
        stats.customers.skipped++
        info(`Customer exists: ${sbCustomer.name} → ID ${existing.id}`)
        continue
      }
      
      const customerData = mapCustomer(sbCustomer)
      const newCustomer = await Customer.create(customerData)
      
      customerMapping[sbCustomer.id] = newCustomer.id
      stats.customers.created++
      info(`Created customer: ${sbCustomer.name} → ID ${newCustomer.id}`)
      
    } catch (err) {
      stats.customers.errors++
      error(`Failed to migrate customer ${sbCustomer.name}:`, err.message)
    }
  }
  
  info(`Customer migration complete. Created: ${stats.customers.created}, Skipped: ${stats.customers.skipped}, Errors: ${stats.customers.errors}`)
  return customerMapping
}

async function migrateAssets(sbItems) {
  info(`Starting asset migration (${sbItems.length} assets)...`)
  
  const assetMapping = {}
  
  for (const sbItem of sbItems) {
    try {
      stats.assets.processed++
      
      // Check if asset already exists by serial number or name+model
      let existing = null
      if (sbItem.serial_number) {
        existing = await Asset.findOne({
          where: { serial_number: sbItem.serial_number }
        })
      }
      
      if (!existing && sbItem.name) {
        // Try to find by name similarity
        existing = await Asset.findOne({
          where: {
            model: sbItem.name,
            make: sbItem.name.split(' ')[0] // First word as make
          }
        })
      }
      
      if (existing) {
        assetMapping[sbItem.id] = existing.id
        stats.assets.skipped++
        info(`Asset exists: ${sbItem.name} → ID ${existing.id}`)
        continue
      }
      
      const assetData = mapAsset(sbItem)
      // Generate asset tag
      assetData.asset_tag = await generateAssetTag()
      
      const newAsset = await Asset.create(assetData)
      
      assetMapping[sbItem.id] = newAsset.id
      stats.assets.created++
      info(`Created asset: ${sbItem.name} → ID ${newAsset.id} (${newAsset.asset_tag})`)
      
    } catch (err) {
      stats.assets.errors++
      error(`Failed to migrate asset ${sbItem.name}:`, err.message)
    }
  }
  
  info(`Asset migration complete. Created: ${stats.assets.created}, Skipped: ${stats.assets.skipped}, Errors: ${stats.assets.errors}`)
  return assetMapping
}

async function migrateInvoices(sbInvoices, customerMapping, assetMapping, userMapping) {
  info(`Starting invoice migration (${sbInvoices.length} invoices)...`)
  
  for (const sbInvoice of sbInvoices) {
    const transaction = await sequelize.transaction()
    
    try {
      stats.invoices.processed++
      
      // Check if invoice already exists
      const existing = await Invoice.findOne({
        where: { salesbinder_id: sbInvoice.id }
      })
      
      if (existing) {
        stats.invoices.skipped++
        info(`Invoice exists: SB#${sbInvoice.document_number} → BH#${existing.invoice_number}`)
        await transaction.commit()
        continue
      }
      
      // Create invoice
      const invoiceData = mapInvoice(sbInvoice, customerMapping, userMapping)
      invoiceData.invoice_number = await Invoice.generateInvoiceNumber()
      
      const newInvoice = await Invoice.create(invoiceData, { transaction })
      
      // Create invoice items
      let invoiceItemsCreated = 0
      if (sbInvoice.document_items) {
        for (const sbItem of sbInvoice.document_items) {
          if (!sbItem.item_id) continue // Skip discount lines and other non-item entries
          
          stats.invoiceItems.processed++
          
          const itemData = mapInvoiceItem(sbItem, assetMapping)
          if (!itemData) {
            stats.invoiceItems.errors++
            continue
          }
          
          itemData.invoice_id = newInvoice.id
          await InvoiceItem.create(itemData, { transaction })
          
          invoiceItemsCreated++
          stats.invoiceItems.created++
        }
      }
      
      // Recalculate invoice totals based on items
      await newInvoice.recalculateTotals()
      
      // Update payment status based on amount_paid
      await newInvoice.updatePaymentStatus(transaction)
      
      await transaction.commit()
      
      stats.invoices.created++
      info(`Created invoice: SB#${sbInvoice.document_number} → BH#${newInvoice.invoice_number} (${invoiceItemsCreated} items)`)
      
    } catch (err) {
      await transaction.rollback()
      stats.invoices.errors++
      error(`Failed to migrate invoice ${sbInvoice.document_number}:`, err.message)
    }
  }
  
  info(`Invoice migration complete. Created: ${stats.invoices.created}, Skipped: ${stats.invoices.skipped}, Errors: ${stats.invoices.errors}`)
}

// Main migration function
async function runMigration() {
  const startTime = Date.now()
  
  info('🚀 Starting SalesBinder → Bizhub migration for February 2026')
  info('Configuration:', {
    salesbinder_base: SALESBINDER_CONFIG.baseURL,
    rate_limit_ms: RATE_LIMIT_MS
  })
  
  try {
    // Step 1: Setup user mapping
    await setupUserMapping()
    
    // Step 2: Fetch SalesBinder data
    const sbData = await fetchSalesBinderData()
    info('Data fetched:', {
      invoices: sbData.invoices.length,
      customers: sbData.customers.length,
      items: sbData.items.length
    })
    
    if (sbData.invoices.length === 0) {
      warn('No February 2026 invoices found!')
      return
    }
    
    // Step 3: Migrate customers
    const customerMapping = await migrateCustomers(sbData.customers)
    
    // Step 4: Migrate assets
    const assetMapping = await migrateAssets(sbData.items)
    
    // Step 5: Migrate invoices
    await migrateInvoices(sbData.invoices, customerMapping, assetMapping, USER_MAPPING)
    
    // Step 6: Final statistics
    const duration = Math.round((Date.now() - startTime) / 1000)
    info('🎉 Migration completed successfully!', {
      duration_seconds: duration,
      statistics: stats
    })
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('MIGRATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`Duration: ${duration}s`)
    console.log(`Customers: ${stats.customers.created} created, ${stats.customers.skipped} skipped, ${stats.customers.errors} errors`)
    console.log(`Assets: ${stats.assets.created} created, ${stats.assets.skipped} skipped, ${stats.assets.errors} errors`)
    console.log(`Invoices: ${stats.invoices.created} created, ${stats.invoices.skipped} skipped, ${stats.invoices.errors} errors`)
    console.log(`Invoice Items: ${stats.invoiceItems.created} created, ${stats.invoiceItems.errors} errors`)
    console.log('='.repeat(60))
    
  } catch (err) {
    error('Migration failed:', err)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      info('Migration script completed')
      process.exit(0)
    })
    .catch(err => {
      error('Migration script failed:', err)
      process.exit(1)
    })
}

module.exports = { runMigration }