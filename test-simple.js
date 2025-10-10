// Simple test to verify the server is working
const http = require('http');

const testServer = () => {
  const options = {
    hostname: 'localhost',
    port: 8787,
    path: '/vend-token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Response:', data);
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(JSON.stringify({ userId: 'test-user-1' }));
  req.end();
};

console.log('Testing server connection...');
testServer();
