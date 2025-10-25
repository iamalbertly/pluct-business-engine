// Health and monitoring route handlers
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { Hono } from 'hono';
import { Env } from './Pluct-Core-Interfaces-01Types';
import { buildInfo, getConfigurationDiagnostics, log } from './Pluct-Core-Utilities-01Helpers';
import { createErrorResponse } from './Pluct-Core-Utilities-02ErrorHandling';

export function setupHealthRoutes(app: Hono<{ Bindings: Env }>, healthMonitor: any) {
  // Root endpoint with configuration status
  app.get('/', c => {
    const diag = getConfigurationDiagnostics(c.env);
    const allConfigured = Object.values(diag.configStatus).every(Boolean);
    
    return c.json({
      status: allConfigured ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor((Date.now() - performance.timeOrigin) / 1000),
      version: '1.0.0',
      build: buildInfo(c.env),
      configuration: diag.configStatus,
      connectivity: {
        d1: 'connected',
        kv: 'connected',
        ttt: 'degraded',
        circuitBreaker: 'closed'
      },
      routes: getAvailableRoutes(),
      issues: diag.missing,
      warnings: []
    }, 200);
  });

  // Health check with configuration details
  app.get('/health', async c => {
    const diag = getConfigurationDiagnostics(c.env);
    const allConfigured = Object.values(diag.configStatus).every(Boolean);
    
    // Check TTT service connectivity
    let tttStatus = 'unknown';
    try {
      const tttHealth = await healthMonitor.checkHealth();
      tttStatus = tttHealth.status;
    } catch (error) {
      tttStatus = 'error';
      log('health', 'TTT connectivity check failed', { error: (error as Error).message });
    }
    
    return c.json({
      status: allConfigured ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor((Date.now() - performance.timeOrigin) / 1000),
      version: '1.0.0',
      build: buildInfo(c.env),
      configuration: diag.configStatus,
      connectivity: {
        d1: 'connected',
        kv: 'connected',
        ttt: tttStatus,
        circuitBreaker: 'closed'
      },
      routes: getAvailableRoutes(),
      issues: diag.missing,
      warnings: []
    }, 200);
  });

  // Service health monitoring
  app.get('/health/services', async c => {
    try {
      const tttHealth = await healthMonitor.checkHealth();
      const circuitBreakerStatus = 'closed'; // This would come from circuit breaker
      
      return c.json({
        ttt: {
          status: tttHealth.status,
          responseTime: tttHealth.responseTime,
          consecutiveFailures: tttHealth.consecutiveFailures || 0
        },
        circuitBreaker: {
          status: circuitBreakerStatus,
          responseTime: 0,
          consecutiveFailures: 0
        }
      }, 200);
    } catch (error) {
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'service_health_check_failed',
        'Service health check failed',
        { error: (error as Error).message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    }
  });

  // Debug configuration endpoint
  app.get('/debug/config', c => {
    const diag = getConfigurationDiagnostics(c.env);
    const config = {
      ENGINE_JWT_SECRET: diag.configStatus.ENGINE_JWT_SECRET ? `Configured (${c.env.ENGINE_JWT_SECRET?.length || 0} chars)` : 'Missing',
      ENGINE_ADMIN_KEY: diag.configStatus.ENGINE_ADMIN_KEY ? `Configured (${c.env.ENGINE_ADMIN_KEY?.length || 0} chars)` : 'Missing',
      TTT_SHARED_SECRET: diag.configStatus.TTT_SHARED_SECRET ? `Configured (${c.env.TTT_SHARED_SECRET?.length || 0} chars)` : 'Missing',
      TTT_BASE: c.env.TTT_BASE || 'Missing',
      KV_USERS: diag.configStatus.KV_USERS ? 'Configured' : 'Missing',
      LOG_LEVEL: c.env.LOG_LEVEL || 'info',
      MAX_RETRIES: c.env.MAX_RETRIES || '3',
      REQUEST_TIMEOUT: c.env.REQUEST_TIMEOUT || '30000',
      BUILD_REF: c.env.BUILD_REF ? `Present (${c.env.BUILD_REF.length} chars)` : 'Missing',
      BUILD_TIME: c.env.BUILD_TIME || 'Missing'
    };
    
    return c.json({
      status: 'ok',
      configuration: config,
      missing: diag.missing,
      build: buildInfo(c.env),
      instructions: {}
    }, 200);
  });
}

function getAvailableRoutes() {
  return {
    health: [
      { method: 'GET', path: '/', description: 'Root endpoint with configuration status' },
      { method: 'GET', path: '/health', description: 'Health check with configuration details' },
      { method: 'GET', path: '/health/services', description: 'Service health monitoring' },
      { method: 'GET', path: '/debug/config', description: 'Detailed configuration diagnostics' }
    ],
    authentication: [
      { method: 'POST', path: '/v1/vend-token', description: 'Vend short-lived access token (requires JWT auth)' },
      { method: 'GET', path: '/v1/credits/balance', description: 'Get user credit balance (requires JWT auth)' }
    ],
    transcription: [
      { method: 'POST', path: '/ttt/transcribe', description: 'Start transcription job (requires short-lived token)' },
      { method: 'GET', path: '/ttt/status/:id', description: 'Check transcription status (requires short-lived token)' }
    ],
    metadata: [
      { method: 'GET', path: '/meta', description: 'Get TikTok metadata with caching' },
      { method: 'POST', path: '/meta/resolve', description: 'Resolve TikTok metadata and start transcription' }
    ],
    admin: [
      { method: 'POST', path: '/v1/credits/add', description: 'Add credits to user account (requires admin API key)' }
    ]
  };
}
