import { Hono } from 'hono';
import type { Bindings } from '../types';

const health = new Hono<{ Bindings: Bindings }>();

// Health check endpoint
health.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      // Core API
      'GET /': 'API documentation',
      'GET /health': 'Health check',
      'POST /user/create': 'Create new user account',
      'GET /user/:userId/balance': 'Get user credit balance',
      'GET /user/:userId/transactions': 'Get user transaction history',
      'POST /validate-token': 'Validate JWT token',
      'POST /vend-token': 'Vend JWT token (requires credits)',
      'POST /add-credits': 'Add credits (requires webhook secret)',
      
      // Admin API
      'GET /admin/users': 'Get all users (requires admin token)',
      'GET /admin/transactions': 'Get all transactions (requires admin token)',
      'POST /admin/credits/add': 'Add credits via admin (requires admin token)',
      
      // API Key Management
      'POST /admin/api-keys/create': 'Create new API key (requires admin token)',
      'GET /admin/api-keys': 'List all API keys (requires admin token)',
      'POST /admin/api-keys/:id/revoke': 'Revoke API key (requires admin token)',
      
      // API Key Protected Endpoints
      'POST /v1/credits/add': 'Add credits via API key (requires X-API-Key header)'
    }
  });
});

// Root endpoint
health.get('/', (c) => {
  return c.json({ 
    message: 'Pluct Business Engine API',
    version: '1.0.0',
    description: 'A secure credit-based token vending system for business applications',
    endpoints: {
      // Core API
      'GET /health': 'Health check and API documentation',
      'POST /user/create': 'Create new user account',
      'GET /user/:userId/balance': 'Get user credit balance',
      'GET /user/:userId/transactions': 'Get user transaction history',
      'POST /validate-token': 'Validate JWT token',
      'POST /vend-token': 'Vend JWT token (requires credits)',
      'POST /add-credits': 'Add credits (requires webhook secret)',
      
      // Admin API
      'GET /admin/users': 'Get all users (requires admin token)',
      'GET /admin/transactions': 'Get all transactions (requires admin token)',
      'POST /admin/credits/add': 'Add credits via admin (requires admin token)',
      
      // API Key Management
      'POST /admin/api-keys/create': 'Create new API key (requires admin token)',
      'GET /admin/api-keys': 'List all API keys (requires admin token)',
      'POST /admin/api-keys/:id/revoke': 'Revoke API key (requires admin token)',
      
      // API Key Protected Endpoints
      'POST /v1/credits/add': 'Add credits via API key (requires X-API-Key header)'
    },
    authentication: {
      'Webhook Secret': 'Required for /add-credits endpoint',
      'Admin Token': 'Required for /admin/* endpoints',
      'User ID': 'Required for user-specific endpoints',
      'API Key': 'Required for /v1/* endpoints (X-API-Key header)'
    }
  });
});

export default health;
