/**
 * Safely investigate SalesBinder API pagination
 * Find the real pattern without overloading
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function fetchPage(page) {
  const cmd = `curl.exe -u "4CkEqBv6kta2X4ixzg1erqXDjYEhlMEP1vY0tSuJ:x" "https://entech.salesbinder.com/api/2.0/items.json?page=${page}"`;
  
  try {
    const { stdout } = await execAsync(cmd);
    return JSON.parse(stdout);
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error.message);
    return null;
  }
}

async function investigatePagination() {
  console.log('🔍 Investigating SalesBinder items pagination...\n');
  
  // Test first few pages to understand pattern
  for (let page = 1; page <= 5; page++) {
    console.log(`📄 Testing page ${page}...`);
    
    const response = await fetchPage(page);
    if (!response) {
      console.log(`❌ Failed to fetch page ${page}`);
      break;
    }
    
    const { count, page: currentPage, pages, items } = response;
    const actualItems = items ? items.length : 0;
    
    console.log(`   Total items: ${count}`);
    console.log(`   Page: ${currentPage}/${pages}`);
    console.log(`   Items on this page: ${actualItems}`);
    
    if (actualItems > 0) {
      const firstItem = items[0][0];
      console.log(`   First item: "${firstItem.name}" (#${firstItem.item_number})`);
    }
    
    console.log('');
    
    // If no items, we've reached the end
    if (actualItems === 0) {
      console.log('✅ Reached end of pagination');
      break;
    }
    
    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('🎯 Pagination pattern identified!');
}

investigatePagination().catch(console.error);