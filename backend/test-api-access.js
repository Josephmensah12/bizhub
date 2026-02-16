/**
 * Test API Access to Verify Customer Data
 */

const axios = require('axios');

async function testAPIAccess() {
  try {
    console.log('🔐 Testing Bizhub API access...');
    
    // Step 1: Login
    const loginResponse = await axios.post('http://localhost:3000/api/v1/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    if (loginResponse.data.success) {
      console.log('✅ Login successful!');
      const token = loginResponse.data.data.token;
      
      // Step 2: Get customers with token
      const customersResponse = await axios.get('http://localhost:3000/api/v1/customers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (customersResponse.data.success) {
        const customers = customersResponse.data.data;
        console.log(`✅ Found ${customers.length} migrated customers:`);
        
        // Show first few customers
        customers.slice(0, 5).forEach(customer => {
          const displayName = customer.first_name ? 
            `${customer.first_name} ${customer.last_name || ''}`.trim() : 
            customer.company_name;
          console.log(`   - ${displayName} (${customer.phone_raw || 'No phone'})`);
        });
        
        if (customers.length > 5) {
          console.log(`   ... and ${customers.length - 5} more`);
        }
        
        return { success: true, token, customerCount: customers.length };
      } else {
        console.log('❌ Failed to fetch customers:', customersResponse.data.error);
        return { success: false, error: 'Failed to fetch customers' };
      }
      
    } else {
      console.log('❌ Login failed:', loginResponse.data.error);
      return { success: false, error: 'Login failed' };
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    return { success: false, error: error.message };
  }
}

if (require.main === module) {
  testAPIAccess()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 API is working! Your migrated customers are accessible.');
        console.log('💡 Access via: http://localhost:3000 (when frontend is ready)');
        console.log('   Username: admin');
        console.log('   Password: admin123');
      } else {
        console.log('\n❌ API test failed:', result.error);
      }
    });
}

module.exports = { testAPIAccess };