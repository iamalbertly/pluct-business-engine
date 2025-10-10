// Simple test script to verify endpoints
const testEndpoints = async () => {
  const baseUrl = 'http://localhost:8787';
  
  console.log('Testing Pluct Business Engine endpoints...\n');
  
  try {
    // Test 1: Add credits to a user
    console.log('1. Testing /add-credits endpoint...');
    const addCreditsResponse = await fetch(`${baseUrl}/add-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': 'local-dev-webhook-secret-never-use-in-prod-67890'
      },
      body: JSON.stringify({
        userId: 'test-user-1',
        amount: 5
      })
    });
    
    const addCreditsResult = await addCreditsResponse.json();
    console.log('Add Credits Response:', addCreditsResult);
    console.log('Status:', addCreditsResponse.status);
    
    if (addCreditsResponse.ok) {
      // Test 2: Vend token
      console.log('\n2. Testing /vend-token endpoint...');
      const vendTokenResponse = await fetch(`${baseUrl}/vend-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: 'test-user-1'
        })
      });
      
      const vendTokenResult = await vendTokenResponse.json();
      console.log('Vend Token Response:', vendTokenResult);
      console.log('Status:', vendTokenResponse.status);
    }
    
    // Test 3: Admin endpoints
    console.log('\n3. Testing /admin/users endpoint...');
    const adminUsersResponse = await fetch(`${baseUrl}/admin/users`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer local-dev-admin-secret-never-use-in-prod-12345'
      }
    });
    
    const adminUsersResult = await adminUsersResponse.json();
    console.log('Admin Users Response:', adminUsersResult);
    console.log('Status:', adminUsersResponse.status);
    
  } catch (error) {
    console.error('Error testing endpoints:', error.message);
  }
};

testEndpoints();
