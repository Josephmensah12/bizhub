/**
 * SalesBinder to Bizhub Customer Migration Script
 * 
 * Migrates customers from SalesBinder API to Bizhub database
 * Date range: February 7-13, 2026
 */

const { exec } = require('child_process');
const util = require('util');

// Database setup
require('dotenv').config();
const { Customer } = require('./models');

const execAsync = util.promisify(exec);

async function fetchSalesBinderCustomers(page = 1, limit = 100) {
  const cmd = `curl.exe -u "4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ:x" "https://entech.salesbinder.com/api/2.0/customers.json?limit=${limit}&page=${page}"`;
  
  try {
    const { stdout } = await execAsync(cmd);
    return JSON.parse(stdout);
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error);
    return null;
  }
}

function filterByDateRange(customers, startDate, endDate) {
  return customers.filter(customer => {
    const createdDate = new Date(customer[0].created);
    const inRange = createdDate >= startDate && createdDate <= endDate;
    
    // Debug first few customers
    if (customers.indexOf(customer) < 3) {
      console.log(`Debug: ${customer[0].name} created ${customer[0].created} -> ${createdDate.toISOString()} -> in range: ${inRange}`);
    }
    
    return inRange;
  });
}

function transformCustomer(salesBinderCustomer) {
  const sb = salesBinderCustomer[0]; // SalesBinder wraps in array
  
  // Split name into first/last
  const nameParts = sb.name.trim().split(' ');
  let firstName = nameParts[0];
  let lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
  
  // If name looks like a business (contains "Ltd", "Company", etc.), put in company_name
  const businessKeywords = ['Ltd', 'Limited', 'Company', 'Corp', 'Inc', 'LLC', 'Enterprise', 'Services'];
  const isBusinessName = businessKeywords.some(keyword => 
    sb.name.toLowerCase().includes(keyword.toLowerCase())
  );
  
  return {
    first_name: isBusinessName ? null : firstName,
    last_name: isBusinessName ? null : lastName,
    company_name: isBusinessName ? sb.name.trim() : null,
    phone_raw: sb.office_phone,
    email: sb.office_email,
    address: [sb.billing_address_1, sb.billing_address_2, sb.billing_city, sb.billing_region]
      .filter(Boolean).join(', ') || null,
    salesbinder_id: sb.id,
    notes: `Imported from SalesBinder. Customer #${sb.customer_number}`,
    tags: ['imported', 'salesbinder']
  };
}

async function migrateCustomers() {
  console.log('🚀 Starting SalesBinder customer migration...');
  
  // Define date range: Feb 12-14, 2026 (include recent customers)
  const startDate = new Date('2026-02-12T00:00:00Z');
  const endDate = new Date('2026-02-14T23:59:59Z');
  
  console.log(`📅 Target date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  let allTargetCustomers = [];
  let page = 1;
  let totalCount = 0;
  
  // Fetch customers page by page
  while (true) {
    console.log(`📄 Fetching page ${page}...`);
    
    const response = await fetchSalesBinderCustomers(page);
    if (!response || !response.customers || response.customers.length === 0) {
      console.log('✅ Reached end of data');
      break;
    }
    
    if (page === 1) {
      totalCount = parseInt(response.count);
      console.log(`📊 Total customers in SalesBinder: ${totalCount}`);
    }
    
    // Filter customers by date range
    const filteredCustomers = filterByDateRange(response.customers, startDate, endDate);
    allTargetCustomers.push(...filteredCustomers);
    
    console.log(`✅ Page ${page}: Found ${filteredCustomers.length} customers in date range`);
    
    // If we get no matches and we're past our date range, we can stop
    if (filteredCustomers.length === 0 && response.customers.length > 0) {
      const oldestOnPage = new Date(response.customers[response.customers.length - 1][0].created);
      if (oldestOnPage < startDate) {
        console.log('🛑 Reached customers older than target range, stopping');
        break;
      }
    }
    
    page++;
    
    // Safety limit to prevent infinite loop
    if (page > 50) {
      console.log('⚠️  Reached page limit, stopping');
      break;
    }
  }
  
  console.log(`📋 Found ${allTargetCustomers.length} customers in Feb 7-13 range`);
  
  if (allTargetCustomers.length === 0) {
    console.log('ℹ️  No customers found in target date range');
    return;
  }
  
  // Transform and insert customers
  let imported = 0;
  let skipped = 0;
  
  for (const salesBinderCustomer of allTargetCustomers) {
    try {
      const customerData = transformCustomer(salesBinderCustomer);
      
      // Check if already exists
      const existing = await Customer.findOne({
        where: { salesbinder_id: customerData.salesbinder_id }
      });
      
      if (existing) {
        console.log(`⏭️  Skipping ${customerData.first_name || customerData.company_name} (already imported)`);
        skipped++;
        continue;
      }
      
      // Create customer
      const customer = await Customer.create(customerData);
      console.log(`✅ Imported: ${customer.getDisplayName()} (ID: ${customer.id})`);
      imported++;
      
    } catch (error) {
      console.error(`❌ Error importing customer:`, error);
      console.error(`   Customer data:`, salesBinderCustomer[0]);
    }
  }
  
  console.log('\n🎉 Migration complete!');
  console.log(`   Imported: ${imported} customers`);
  console.log(`   Skipped: ${skipped} customers`);
  console.log(`   Total processed: ${allTargetCustomers.length} customers`);
}

// Run migration
if (require.main === module) {
  migrateCustomers()
    .then(() => {
      console.log('✅ Migration finished');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateCustomers };