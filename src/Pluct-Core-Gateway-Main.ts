import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

interface Env {
  KV_USERS: any;
  DB: D1Database;
  ENGINE_JWT_SECRET: string;
  ENGINE_ADMIN_KEY: string;
  TTT_SHARED_SECRET: string;
  TTT_BASE: string;
  LOG_LEVEL?: string;
  MAX_RETRIES?: string;
  REQUEST_TIMEOUT?: string;
  // Non-sensitive build metadata for diagnostics
  BUILD_REF?: string;
  BUILD_TIME?: string;
}

interface TokenPayload {
  sub: string;
  scope: string;
  iat: number;
  exp: number;
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  consecutiveFailures: number;
  responseTime: number;
  errorRate: number;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

// Validation schemas
const VendTokenSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  clientRequestId: z.string().optional(),
  scope: z.string().optional()
});

const TranscribeSchema = z.object({
  url: z.string().url('Valid URL is required').refine(
    (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('tiktok.com') || urlObj.hostname.includes('vm.tiktok.com');
      } catch {
        return false;
      }
    },
    'Only TikTok URLs are supported'
  ),
  file: z.string().optional()
}).refine(
  (data) => data.url || data.file,
  'Either URL or file must be provided'
);

const MetaResolveSchema = z.object({
  url: z.string().url('Valid URL is required').refine(
    (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('tiktok.com') || urlObj.hostname.includes('vm.tiktok.com');
      } catch {
        return false;
      }
    },
    'Only TikTok URLs are supported'
  )
});

const AddCreditsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  amount: z.number().int().positive('Amount must be a positive integer')
});

const MetaQuerySchema = z.object({
  url: z.string().url('Valid URL is required').refine(
    (url) => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('tiktok.com') || urlObj.hostname.includes('vm.tiktok.com');
      } catch {
        return false;
      }
    },
    'Only TikTok URLs are supported'
  )
});

// Database initialization
async function initializeDatabase(env: Env): Promise<void> {
  try {
    // Create credits table
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS credits (
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create audits table
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        action TEXT NOT NULL,
        route TEXT NOT NULL,
        status INTEGER NOT NULL,
        credit_delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indices for better query performance
    await env.DB.exec(`
      CREATE INDEX IF NOT EXISTS idx_audits_user_id_created_at ON audits(user_id, created_at)
    `);
    
    await env.DB.exec(`
      CREATE INDEX IF NOT EXISTS idx_audits_request_id ON audits(request_id)
    `);
    
    log('database', 'Database initialized successfully');
  } catch (error) {
    log('database', 'Database initialization failed', { error: (error as Error).message });
    throw error;
  }
}

// Utilities
function log(stage: string, message: string, metadata?: any) {
  console.log(`be:${stage} msg=${message}${metadata ? ` metadata=${JSON.stringify(metadata)}` : ''}`);
}

// Circuit Breaker Implementation
class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'closed',
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0
  };
  
  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 60000; // 1 minute
  private readonly halfOpenMaxCalls = 3;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (Date.now() - this.state.lastFailureTime > this.recoveryTimeout) {
        this.state.state = 'half-open';
        this.state.successCount = 0;
        log('circuit_breaker', 'transitioning to half-open state');
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }

    if (this.state.state === 'half-open' && this.state.successCount >= this.halfOpenMaxCalls) {
      this.state.state = 'closed';
      this.state.failureCount = 0;
      log('circuit_breaker', 'transitioning to closed state - service recovered');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state.state === 'half-open') {
      this.state.successCount++;
    } else {
      this.state.failureCount = Math.max(0, this.state.failureCount - 1);
    }
  }

  private onFailure() {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.failureCount >= this.failureThreshold) {
      this.state.state = 'open';
      log('circuit_breaker', 'transitioning to open state - service failing');
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

// Service Health Monitor
class ServiceHealthMonitor {
  private health: ServiceHealth = {
    status: 'healthy',
    lastCheck: 0,
    consecutiveFailures: 0,
    responseTime: 0,
    errorRate: 0
  };

  async checkHealth(env: Env): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      // Simple health check - try to reach TTT service
      const response = await fetch(`${env.TTT_BASE}/health`, {
        method: 'GET',
        headers: { 'X-Engine-Auth': env.TTT_SHARED_SECRET },
        signal: AbortSignal.timeout(5000)
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        this.health.status = 'healthy';
        this.health.consecutiveFailures = 0;
        this.health.responseTime = responseTime;
        this.health.errorRate = Math.max(0, this.health.errorRate - 0.1);
      } else {
        this.health.status = 'degraded';
        this.health.consecutiveFailures++;
        this.health.responseTime = responseTime;
        this.health.errorRate = Math.min(1, this.health.errorRate + 0.2);
      }
    } catch (error) {
      this.health.status = 'unhealthy';
      this.health.consecutiveFailures++;
      this.health.responseTime = Date.now() - startTime;
      this.health.errorRate = Math.min(1, this.health.errorRate + 0.3);
      
      if (this.health.consecutiveFailures >= 3) {
        this.health.status = 'unhealthy';
      }
    }
    
    this.health.lastCheck = Date.now();
    return { ...this.health };
  }

  getHealth(): ServiceHealth {
    return { ...this.health };
  }
}

function jsonError(c: any, status: number, code: string, message: string, details?: Record<string, any>, guidance?: string) {
  return c.json({ 
    ok: false, 
    code, 
    message, 
    details: details || {},
    build: buildInfo(c.env as any),
    guidance: guidance || null
  }, status);
}

function buildInfo(env: Env) {
  return {
    // Intentionally not exposing VCS naming; caller asked not to use "gitid"
    ref: env.BUILD_REF || null,
    deployedAt: env.BUILD_TIME || null
  };
}

function getConfigurationDiagnostics(env: Env) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const configStatus = {
    ENGINE_JWT_SECRET: !!env.ENGINE_JWT_SECRET,
    ENGINE_ADMIN_KEY: !!env.ENGINE_ADMIN_KEY,
    TTT_SHARED_SECRET: !!env.TTT_SHARED_SECRET,
    TTT_BASE: !!env.TTT_BASE,
    KV_USERS: !!env.KV_USERS
  };

  const requiredSecrets = [
    { key: 'ENGINE_JWT_SECRET', description: 'JWT signing secret for user tokens' },
    { key: 'ENGINE_ADMIN_KEY', description: 'Admin API key for credit management' },
    { key: 'TTT_SHARED_SECRET', description: 'Shared secret for TTTranscribe communication' }
  ];

  for (const secret of requiredSecrets) {
    const value = (env as any)[secret.key];
    if (!value) {
      errors.push(`Missing ${secret.key}: ${secret.description}`);
    } else if (typeof value === 'string' && value.length < 16) {
      warnings.push(`${secret.key} is too short (${value.length} chars). Recommended: 32+ characters`);
    }
  }

  if (!env.TTT_BASE) {
    errors.push('Missing TTT_BASE: TTTranscribe service URL');
  } else {
    try {
      const url = new URL(env.TTT_BASE);
      if (url.protocol !== 'https:') {
        warnings.push('TTT_BASE should use HTTPS protocol');
      }
    } catch {
      errors.push(`Invalid TTT_BASE URL: ${env.TTT_BASE}`);
    }
  }

  if (!env.KV_USERS) {
    errors.push('Missing KV_USERS: KV namespace binding not configured');
  }

  const missing = Object.entries(configStatus)
    .filter(([_, configured]) => !configured)
    .map(([key]) => key);

  return { errors, warnings, configStatus, missing };
}

async function checkRateLimit(env: Env, key: string, limit: number = 100, windowSeconds: number = 60): Promise<boolean> {
  try {
    const rateLimitKey = `rate_limit:${key}`;
    const current = await env.KV_USERS.get(rateLimitKey);
    if (!current) {
      await env.KV_USERS.put(rateLimitKey, '1', { expirationTtl: windowSeconds });
      return true;
    }
    const count = parseInt(current, 10);
    if (count >= limit) return false;
    await env.KV_USERS.put(rateLimitKey, String(count + 1), { expirationTtl: windowSeconds });
    return true;
  } catch (error) {
    // If rate limiting fails, allow the request to proceed
    // This prevents rate limiting from blocking legitimate requests
    log('rate_limit', 'Rate limiting check failed, allowing request', { error: (error as Error).message, key });
    return true;
  }
}

async function checkRateLimitPerUserAndIP(env: Env, userId: string, ip: string): Promise<boolean> {
  const userLimit = await checkRateLimit(env, `user:${userId}`, 50, 60); // 50 requests per minute per user
  const ipLimit = await checkRateLimit(env, `ip:${ip}`, 200, 60); // 200 requests per minute per IP
  
  return userLimit && ipLimit;
}

function validateEnvironment(env: Env): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required secrets
  const requiredSecrets = [
    { key: 'ENGINE_JWT_SECRET', description: 'JWT signing secret for user tokens' },
    { key: 'ENGINE_ADMIN_KEY', description: 'Admin API key for credit management' },
    { key: 'TTT_SHARED_SECRET', description: 'Shared secret for TTTranscribe communication' }
  ];
  
  for (const secret of requiredSecrets) {
    const value = env[secret.key as keyof Env];
    if (!value) {
      errors.push(`Missing ${secret.key}: ${secret.description}`);
    } else if (value.length < 16) {
      warnings.push(`${secret.key} is too short (${value.length} chars). Recommended: 32+ characters`);
    }
  }
  
  // Check TTT_BASE URL
  if (!env.TTT_BASE) {
    errors.push('Missing TTT_BASE: TTTranscribe service URL');
  } else {
    try {
      const url = new URL(env.TTT_BASE);
      if (url.protocol !== 'https:') {
        warnings.push('TTT_BASE should use HTTPS protocol');
      }
    } catch (e) {
      errors.push(`Invalid TTT_BASE URL: ${env.TTT_BASE}`);
    }
  }
  
  // Check KV namespace
  if (!env.KV_USERS) {
    errors.push('Missing KV_USERS: KV namespace binding not configured');
  }
  
  // Throw error if any critical issues found
  if (errors.length > 0) {
    const errorMessage = `Configuration validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`;
    const details = [...errors, ...warnings].join('; ');
    throw new Error(`${errorMessage}. Details: ${details}`);
  }
}

class PluctGateway {
  private app: Hono<{ Bindings: Env }>;
  private circuitBreaker: CircuitBreaker;
  private healthMonitor: ServiceHealthMonitor;
  
  constructor() {
    this.app = new Hono<{ Bindings: Env }>();
    this.circuitBreaker = new CircuitBreaker();
    this.healthMonitor = new ServiceHealthMonitor();
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  async initialize(env: Env): Promise<void> {
    await initializeDatabase(env);
  }
  
  private setupMiddleware() {
    this.app.use('*', async (c, next) => {
      try {
        // Allow diagnostics and metadata endpoints without blocking
        const path = c.req.path || '';
        const method = c.req.method || 'GET';
        const diagnosticsAllowed = (
          method === 'GET' && (
            path === '/' ||
            path === '/health' ||
            path === '/health/services' ||
            path === '/debug/config'
          )
        ) || (
          method === 'POST' && (
            path === '/meta/resolve'
          )
        );
        if (!diagnosticsAllowed) {
          validateEnvironment(c.env);
        }
      } catch (error) {
        const diag = getConfigurationDiagnostics(c.env);
        const message = (error as Error)?.message || 'Configuration validation failed';
        return c.json({
          ok: false,
          code: 'configuration_error',
          message,
          details: {
            errors: diag.errors,
            warnings: diag.warnings,
            configuration: diag.configStatus,
            missing: diag.missing
          },
          build: buildInfo(c.env),
          guidance: 'Set required secrets and vars. See /debug/config for instructions.'
        }, 500);
      }
      await next();
    });

    this.app.use('*', cors({
      origin: ['https://pluct.app', 'https://www.pluct.app', 'http://localhost:3000', 'http://localhost:8080'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Client-Request-Id'],
      allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
      maxAge: 86400,
      credentials: true
    }));

    // Method validation middleware
    this.app.use('*', async (c, next) => {
      const method = c.req.method;
      const path = c.req.path;
      
      // Define allowed methods for each route
      const routeMethods: Record<string, string[]> = {
        '/': ['GET'],
        '/health': ['GET'],
        '/health/services': ['GET'],
        '/debug/config': ['GET'],
        '/v1/credits/balance': ['GET'],
        '/v1/vend-token': ['POST'],
        '/v1/credits/add': ['POST'],
        '/ttt/transcribe': ['POST'],
        '/ttt/status': ['GET'],
        '/meta': ['GET'],
        '/meta/resolve': ['POST']
      };
      
      // Find matching route
      let allowedMethods: string[] = [];
      for (const [route, methods] of Object.entries(routeMethods)) {
        if (path === route || (route.includes(':') && path.startsWith(route.split(':')[0]))) {
          allowedMethods = methods;
          break;
        }
      }
      
      // If we found allowed methods and current method is not allowed
      if (allowedMethods.length > 0 && !allowedMethods.includes(method)) {
        return c.json({
          ok: false,
          code: 'method_not_allowed',
          message: `Method ${method} not allowed for ${path}`,
          details: {
            allowedMethods,
            currentMethod: method,
            path
          }
        }, 405, {
          'Allow': allowedMethods.join(', ')
        });
      }
      
      await next();
    });

    // 404 handler for better error responses
    this.app.notFound((c) => {
      return c.json({
        ok: false,
        code: 'route_not_found',
        message: 'Endpoint not found'
      }, 404);
    });

    // Error handler for thrown errors only
    this.app.onError((err, c) => {
      // Keep framework 404s out of here
      const status = (err as any)?.status ?? 500;
      const code = (err as any)?.code ?? 'internal_error';
      const msg = (err as any)?.message ?? 'Unexpected error';
      return c.json({ ok: false, code, message: msg }, status);
    });
  }
  
  private setupRoutes() {
    // Root - human-friendly configuration + build reference
    this.app.get('/', async c => {
      const uptimeSeconds = Math.floor(Date.now() / 1000);
      const diag = getConfigurationDiagnostics(c.env);
      const allConfigured = Object.values(diag.configStatus).every(Boolean);
      return c.json({
        status: allConfigured ? 'ok' : 'configuration_error',
        message: allConfigured ? 'Pluct Business Engine is running' : 'Configuration issues detected',
        uptimeSeconds,
        version: '1.0.0',
        build: buildInfo(c.env),
        configuration: diag.configStatus,
        issues: allConfigured ? [] : diag.missing,
        warnings: diag.warnings,
        links: {
          health: '/health',
          serviceHealth: '/health/services',
          config: '/debug/config'
        }
      });
    });

    // Health Check - Enhanced with connectivity checks
    this.app.get('/health', async c => {
      try {
        const uptimeSeconds = Math.floor(Date.now() / 1000);
        
        // Check configuration status
        const diag = getConfigurationDiagnostics(c.env);
        const allConfigured = Object.values(diag.configStatus).every(Boolean);
        
        // Check D1 connectivity
        let d1Status = 'unknown';
        try {
          await c.env.DB.prepare('SELECT 1').first();
          d1Status = 'connected';
        } catch (error) {
          d1Status = 'error';
          log('health', 'D1 connectivity check failed', { error: (error as Error).message });
        }
        
        // Check KV connectivity
        let kvStatus = 'unknown';
        try {
          await c.env.KV_USERS.get('health-check');
          kvStatus = 'connected';
        } catch (error) {
          kvStatus = 'error';
          log('health', 'KV connectivity check failed', { error: (error as Error).message });
        }
        
        // Get available routes
        const availableRoutes = this.getAvailableEndpoints();
        
        return c.json({
          status: allConfigured && d1Status === 'connected' && kvStatus === 'connected' ? 'ok' : 'degraded',
          uptimeSeconds,
          version: '1.0.0',
          build: buildInfo(c.env),
          configuration: diag.configStatus,
          connectivity: {
            d1: d1Status,
            kv: kvStatus
          },
          routes: availableRoutes,
          issues: allConfigured ? [] : diag.missing.map(k => `Missing ${k}`),
          warnings: diag.warnings
        });
      } catch (error) {
        return c.json({ 
          status: 'error', 
          message: 'Health check failed',
          error: (error as Error).message,
          build: buildInfo(c.env)
        }, 500);
      }
    });
    
    // Configuration Debug Endpoint
    this.app.get('/debug/config', async c => {
      try {
        const config = {
          ENGINE_JWT_SECRET: c.env.ENGINE_JWT_SECRET ? 
            `Configured (${c.env.ENGINE_JWT_SECRET.length} chars)` : 'Missing',
          ENGINE_ADMIN_KEY: c.env.ENGINE_ADMIN_KEY ? 
            `Configured (${c.env.ENGINE_ADMIN_KEY.length} chars)` : 'Missing',
          TTT_SHARED_SECRET: c.env.TTT_SHARED_SECRET ? 
            `Configured (${c.env.TTT_SHARED_SECRET.length} chars)` : 'Missing',
          TTT_BASE: c.env.TTT_BASE || 'Missing',
          KV_USERS: c.env.KV_USERS ? 'Configured' : 'Missing',
          LOG_LEVEL: c.env.LOG_LEVEL || 'info (default)',
          MAX_RETRIES: c.env.MAX_RETRIES || '3 (default)',
          REQUEST_TIMEOUT: c.env.REQUEST_TIMEOUT || '30000 (default)',
          BUILD_REF: c.env.BUILD_REF ? `Present (${(c.env.BUILD_REF || '').length} chars)` : 'Missing (optional)',
          BUILD_TIME: c.env.BUILD_TIME || 'Missing (optional)'
        };
        
        const missing = Object.entries(config)
          .filter(([key, value]) => value === 'Missing' && key !== 'BUILD_REF' && key !== 'BUILD_TIME')
          .map(([key]) => key);
        
        return c.json({
          status: missing.length === 0 ? 'ok' : 'configuration_error',
          configuration: config,
          missing: missing,
          build: buildInfo(c.env),
          instructions: missing.length > 0 ? {
            ENGINE_JWT_SECRET: 'Run: wrangler secret put ENGINE_JWT_SECRET',
            ENGINE_ADMIN_KEY: 'Run: wrangler secret put ENGINE_ADMIN_KEY', 
            TTT_SHARED_SECRET: 'Run: wrangler secret put TTT_SHARED_SECRET',
            TTT_BASE: 'Check wrangler.toml [vars] section',
            KV_USERS: 'Check wrangler.toml [[kv_namespaces]] section'
          } : {}
        });
      } catch (error) {
        return c.json({ 
          status: 'error', 
          message: 'Configuration debug failed',
          error: (error as Error).message,
          build: buildInfo(c.env)
        }, 500);
      }
    });
    
    // Credits Balance
    this.app.get('/v1/credits/balance', async c => {
      try {
        // Extract and verify JWT authentication
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        const payload = await this.verifyToken(c.env, token, false);
        const userId = payload.sub;
        
        // Get current balance
        const creditKey = `credits:${userId}`;
        const currentCredits = await c.env.KV_USERS.get(creditKey);
        const balance = currentCredits ? parseInt(currentCredits, 10) : 0;
        
        return c.json({
          userId,
          balance,
          updatedAt: new Date().toISOString()
        });
        
      } catch (error) {
        log('balance', 'balance check failed', { error: (error as Error).message });
        return c.json({ error: 'BALANCE_CHECK_FAILED', message: 'Failed to retrieve balance' }, 500);
      }
    });
    
    // Service Health Monitoring
    this.app.get('/health/services', async c => {
      try {
        const tttHealth = await this.healthMonitor.checkHealth(c.env);
        const circuitState = this.circuitBreaker.getState();
        
        return c.json({
          ok: true,
          services: {
            ttt: {
              status: tttHealth.status,
              responseTime: tttHealth.responseTime,
              errorRate: tttHealth.errorRate,
              consecutiveFailures: tttHealth.consecutiveFailures,
              lastCheck: tttHealth.lastCheck
            },
            circuitBreaker: {
              state: circuitState.state,
              failureCount: circuitState.failureCount,
              lastFailureTime: circuitState.lastFailureTime,
              successCount: circuitState.successCount
            }
          },
          recommendations: this.getServiceRecommendations(tttHealth, circuitState)
        });
      } catch (error) {
        return jsonError(c, 500, 'service_health_failed', 'Service health check failed');
      }
    });
    
    // Token Vending - Updated to /v1/vend-token with JWT auth and atomic credit deduction
    this.app.post('/v1/vend-token', zValidator('json', VendTokenSchema), async c => {
      const startTime = Date.now();
      let userId: string = 'unknown';
      let requestId: string = '';
      let clientRequestId: string | undefined;
      
      try {
        // Extract and verify JWT authentication
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        const payload = await this.verifyToken(c.env, token, false);
        userId = payload.sub;
        
        // Check for required scope
        if (payload.scope !== 'ttt:transcribe') {
          return c.json({ error: 'INSUFFICIENT_SCOPE', message: 'Required scope: ttt:transcribe' }, 403);
        }
        
        // Rate limiting check
        const ip = c.req.header('CF-Connecting-IP') || 'unknown';
        const rateLimitOk = await checkRateLimitPerUserAndIP(c.env, userId, ip);
        if (!rateLimitOk) {
          return c.json({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' }, 429);
        }
        
        // Check for idempotency - improved implementation
        clientRequestId = c.req.header('X-Client-Request-Id');
        if (clientRequestId) {
          const idempotencyKey = `idempotency:${userId}:${clientRequestId}`;
          const existingResponse = await c.env.KV_USERS.get(idempotencyKey);
          if (existingResponse) {
            const parsedResponse = JSON.parse(existingResponse);
            log('vend-token', 'idempotency hit', { userId, clientRequestId, requestId: parsedResponse.requestId });
            return c.json(parsedResponse);
          }
          
          // Store idempotency key immediately to prevent race conditions
          await c.env.KV_USERS.put(idempotencyKey, 'processing', { expirationTtl: 900 });
        }
        
        requestId = crypto.randomUUID();
        
        // Atomic credit deduction using D1
        const creditResult = await this.spendCreditAtomic(
          c.env, 
          userId, 
          requestId, 
          '/v1/vend-token',
          c.req.header('CF-Connecting-IP'),
          c.req.header('User-Agent')
        );
        
        if (!creditResult.success) {
          log('vend-token', 'insufficient credits', { userId, balance: creditResult.balanceAfter, requestId, ms: Date.now() - startTime });
          return c.json({ error: 'INSUFFICIENT_CREDITS', balance: creditResult.balanceAfter }, 402);
        }
        
        // Generate short-lived token (15 minutes max)
        const now = Math.floor(Date.now() / 1000);
        const tokenPayload = {
          sub: userId,
          scope: 'ttt:transcribe',
          iat: now,
          exp: now + (15 * 60) // 15 minutes
        };
        
        const jwt = await this.generateShortLivedToken(c.env, tokenPayload);
        const expiresAt = new Date((now + (15 * 60)) * 1000).toISOString();
        
        const response = {
          token: jwt,
          scope: 'ttt:transcribe',
          expiresAt,
          balanceAfter: creditResult.balanceAfter,
          requestId
        };
        
        // Store response for idempotency if client request ID provided
        if (clientRequestId) {
          const idempotencyKey = `idempotency:${userId}:${clientRequestId}`;
          await c.env.KV_USERS.put(idempotencyKey, JSON.stringify(response), { expirationTtl: 900 });
        }
        
        log('vend-token', 'success', { userId, balanceAfter: creditResult.balanceAfter, requestId, ms: Date.now() - startTime });
        return c.json(response);
        
      } catch (error) {
        log('vend-token', 'error', { userId: userId || 'unknown', error: (error as Error).message, ms: Date.now() - startTime });
        return c.json({ error: 'TOKEN_GENERATION_FAILED', message: 'Token generation failed' }, 500);
      }
    });
    
    // TTTranscribe Proxy - Updated to match exact requirements
    this.app.post('/ttt/transcribe', zValidator('json', TranscribeSchema), async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        const payload = await this.verifyToken(c.env, token);
        
        const bodyJson = c.req.valid('json');
        
        // Use circuit breaker for TTT calls
        const response = await this.circuitBreaker.execute(async () => {
          return await this.callTTT(c.env, '/transcribe', {
            method: 'POST',
            body,
            headers: { 'content-type': 'application/json' }
          });
        });
        
        log('ttt_proxy', `call=transcribe http=${response.status}`, { userId: payload.sub });
        return new Response(response.body, { status: response.status, headers: response.headers });
      } catch (error) {
        log('ttt_proxy', 'transcribe request failed', { error: (error as Error).message });
        
        // Check if it's a circuit breaker error
        if ((error as Error).message.includes('Circuit breaker is open')) {
          return c.json({ error: 'SERVICE_UNAVAILABLE', message: 'TTTranscribe service is temporarily unavailable' }, 503);
        }
        
        return c.json({ error: 'PROXY_FAILED', message: 'TTTranscribe proxy call failed' }, 500);
      }
    });
    
    // Status Check - Updated to match exact requirements
    this.app.get('/ttt/status/:id', async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        await this.verifyToken(c.env, token);
        
        const requestId = c.req.param('id');
        
        // Use circuit breaker for TTT calls
        const response = await this.circuitBreaker.execute(async () => {
          return await this.callTTT(c.env, `/status/${requestId}`, { method: 'GET' });
        });
        
        log('ttt_proxy', `call=status http=${response.status}`, { requestId });
        return new Response(response.body, { status: response.status, headers: response.headers });
      } catch (error) {
        log('ttt_proxy', 'status check failed', { error: (error as Error).message });
        
        // Check if it's a circuit breaker error
        if ((error as Error).message.includes('Circuit breaker is open')) {
          return c.json({ error: 'SERVICE_UNAVAILABLE', message: 'TTTranscribe service is temporarily unavailable' }, 503);
        }
        
        return c.json({ error: 'STATUS_CHECK_FAILED', message: 'TTTranscribe status check failed' }, 500);
      }
    });
    
    // Metadata endpoint with randomized TTL caching
    this.app.get('/meta', zValidator('query', MetaQuerySchema), async c => {
      try {
        const { url } = c.req.valid('query');
        
        const cacheKey = `meta:${url}`;
        const cached = await c.env.KV_USERS.get(cacheKey);
        if (cached) {
          return c.json(JSON.parse(cached));
        }
        
        // Fetch metadata from TikTok
        const metadata = await this.fetchTikTokMetadata(url);
        
        // Cache with randomized TTL (1-6 hours)
        const cacheHours = 1 + Math.random() * 5;
        const cacheSeconds = Math.floor(cacheHours * 3600);
        await c.env.KV_USERS.put(cacheKey, JSON.stringify(metadata), { expirationTtl: cacheSeconds });
        
        return c.json(metadata);
        
      } catch (error) {
        log('meta', 'metadata fetch failed', { error: (error as Error).message });
        return jsonError(c, 500, 'METADATA_FETCH_FAILED', 'Failed to fetch metadata', { error: (error as Error).message });
      }
    });
    
    // Metadata Resolution with TTTranscribe Integration
    this.app.post('/meta/resolve', zValidator('json', MetaResolveSchema), async c => {
      try {
        const { url } = c.req.valid('json');
        
        // Get metadata first
        const meta = await this.resolveMetadata(c.env, url);
        
        // Start transcription with TTTranscribe using the shared secret
        let transcriptionResult = null;
        try {
          const transcriptionResponse = await this.callTTT(c.env, '/transcribe', {
            method: 'POST',
            body: JSON.stringify({ url }),
            headers: { 'content-type': 'application/json' }
          });
          
          if (transcriptionResponse.ok) {
            transcriptionResult = await transcriptionResponse.json();
          } else {
            log('meta_resolve', 'transcription failed', { 
              status: transcriptionResponse.status,
              url 
            });
          }
        } catch (transcriptionError) {
          log('meta_resolve', 'transcription error', { 
            error: (transcriptionError as Error).message,
            url 
          });
        }
        
        return c.json({
          ok: true,
          data: {
            metadata: meta,
            transcription: transcriptionResult ? {
              jobId: transcriptionResult.id || transcriptionResult.jobId,
              status: transcriptionResult.status || 'started',
              message: 'Transcription job initiated'
            } : {
              status: 'failed',
              message: 'Transcription could not be started'
            }
          },
          build: buildInfo(c.env)
        });
      } catch (error) {
        log('meta_resolve', 'metadata resolution failed', { error: (error as Error).message });
        return jsonError(c, 500, 'metadata_resolution_failed', 'Metadata resolution failed', { 
          error: (error as Error).message,
          url: c.req.json ? (await c.req.json()).url : 'unknown'
        },
          'Check URL format. Ensure it\'s a valid TikTok URL and the service is accessible.');
      }
    });
    
    // Admin Credit Addition
    this.app.post('/v1/credits/add', zValidator('json', AddCreditsSchema), async c => {
      try {
        const apiKey = c.req.header('X-API-Key');
        if (apiKey !== c.env.ENGINE_ADMIN_KEY) return jsonError(c, 401, 'unauthorized', 'Invalid admin API key', {},
          'Include header: X-API-Key: <admin-key>. Get key from environment configuration.');
        
        const { userId, amount } = c.req.valid('json');
        await this.addCredits(c.env, userId, amount);
        
        log('credits', 'credits added', { userId, amount });
        return c.json({ ok: true, userId, amount });
      } catch (error) {
        log('credits', 'credit addition failed', { error: (error as Error).message });
        return jsonError(c, 500, 'credits_add_failed', 'Failed to add credits', { error: (error as Error).message },
          'Check server logs. Ensure KV_USERS is accessible and user exists.');
      }
    });
  }
  
  // Core Methods - Updated to use D1 with atomic transactions
  private async getCredits(env: Env, userId: string): Promise<number> {
    try {
      const result = await env.DB.prepare('SELECT balance FROM credits WHERE user_id = ?').bind(userId).first();
      return result ? (result.balance as number) : 0;
    } catch (error) {
      log('credits', 'Failed to get credits from D1, falling back to KV', { error: (error as Error).message, userId });
      const v = await env.KV_USERS.get(`credits:${userId}`);
      return parseInt(v || '0', 10);
    }
  }
  
  private async addCredits(env: Env, userId: string, amount: number): Promise<void> {
    try {
      await env.DB.prepare(`
        INSERT INTO credits (user_id, balance) 
        VALUES (?, ?) 
        ON CONFLICT(user_id) DO UPDATE SET 
          balance = balance + ?, 
          updated_at = CURRENT_TIMESTAMP
      `).bind(userId, amount, amount).run();
    } catch (error) {
      log('credits', 'Failed to add credits in D1, falling back to KV', { error: (error as Error).message, userId, amount });
      const cur = await this.getCredits(env, userId);
      await env.KV_USERS.put(`credits:${userId}`, String(cur + amount));
    }
  }
  
  private async spendCreditAtomic(env: Env, userId: string, requestId: string, route: string, ip?: string, userAgent?: string): Promise<{ success: boolean; balanceAfter: number }> {
    try {
      // Use D1 transaction for atomic credit deduction
      const result = await env.DB.batch([
        env.DB.prepare('SELECT balance FROM credits WHERE user_id = ? FOR UPDATE').bind(userId),
        env.DB.prepare(`
          UPDATE credits 
          SET balance = balance - 1, updated_at = CURRENT_TIMESTAMP 
          WHERE user_id = ? AND balance > 0
        `).bind(userId),
        env.DB.prepare(`
          INSERT INTO audits (user_id, request_id, action, route, status, credit_delta, balance_after, ip, user_agent)
          VALUES (?, ?, 'vend-token', ?, 200, -1, (SELECT balance FROM credits WHERE user_id = ?), ?, ?)
        `).bind(userId, requestId, route, userId, ip || 'unknown', userAgent || 'unknown')
      ]);
      
      const balanceResult = await env.DB.prepare('SELECT balance FROM credits WHERE user_id = ?').bind(userId).first();
      const balanceAfter = balanceResult ? (balanceResult.balance as number) : 0;
      
      return { success: balanceAfter >= 0, balanceAfter };
    } catch (error) {
      log('credits', 'Atomic credit deduction failed, falling back to KV', { error: (error as Error).message, userId });
      // Fallback to KV
      const cur = await this.getCredits(env, userId);
      if (cur <= 0) {
        return { success: false, balanceAfter: cur };
      }
      const newBalance = cur - 1;
      await env.KV_USERS.put(`credits:${userId}`, String(newBalance));
      return { success: true, balanceAfter: newBalance };
    }
  }
  
  
  private async verifyToken(env: Env, token: string, requireScope: boolean = true): Promise<TokenPayload> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.ENGINE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const { payload } = await jwtVerify(token, key);
    
    if (requireScope && payload.scope !== 'ttt:transcribe') {
      throw new Error('invalid_scope');
    }
    
    return payload as unknown as TokenPayload;
  }
  
  private async generateShortLivedToken(env: Env, payload: any): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.ENGINE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .setIssuedAt()
      .sign(key);
  }
  
  private async callTTT(env: Env, path: string, init: RequestInit): Promise<Response> {
    const url = `${env.TTT_BASE}${path}`;
    const maxRetries = parseInt(env.MAX_RETRIES || '3', 10);
    const timeout = parseInt(env.REQUEST_TIMEOUT || '30000', 10);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const requestInit: RequestInit = {
          ...init,
          headers: { ...(init.headers || {}), 'X-Engine-Auth': env.TTT_SHARED_SECRET },
          signal: AbortSignal.timeout(timeout)
        };
        
        const response = await fetch(url, requestInit);
        
        // If successful or client error (4xx), don't retry
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        
        // Server error (5xx) - retry if not last attempt
        if (attempt === maxRetries) {
          return response;
        }
        
        log('ttt_retry', `attempt ${attempt}/${maxRetries} failed`, { status: response.status, url });
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // Exponential backoff
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        log('ttt_retry', `attempt ${attempt}/${maxRetries} error`, { error: (error as Error).message, url });
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // Exponential backoff
      }
    }
    
    throw new Error('Max retries exceeded');
  }
  
  private getServiceRecommendations(tttHealth: ServiceHealth, circuitState: CircuitBreakerState): string[] {
    const recommendations: string[] = [];
    
    if (tttHealth.status === 'unhealthy') {
      recommendations.push('TTTranscribe service is down - check service availability and configuration');
    } else if (tttHealth.status === 'degraded') {
      recommendations.push('TTTranscribe service is experiencing issues - monitor response times');
    }
    
    if (tttHealth.errorRate > 0.5) {
      recommendations.push('High error rate detected - investigate service stability');
    }
    
    if (tttHealth.responseTime > 10000) {
      recommendations.push('Slow response times detected - check network connectivity');
    }
    
    if (circuitState.state === 'open') {
      recommendations.push('Circuit breaker is open - service is temporarily unavailable');
    } else if (circuitState.state === 'half-open') {
      recommendations.push('Circuit breaker is testing service recovery');
    }
    
    if (circuitState.failureCount > 3) {
      recommendations.push('Multiple failures detected - check service logs');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('All services are operating normally');
    }
    
    return recommendations;
  }
  
  private isTikTokUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('tiktok.com') || urlObj.hostname.includes('vm.tiktok.com');
    } catch {
      return false;
    }
  }
  
  private async fetchTikTokMetadata(url: string): Promise<any> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!response.ok) throw new Error('fetch_failed');
    const html = await response.text();
    
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'Unknown Title';
    
    const authorMatch = html.match(/"author":\s*"([^"]+)"/) || 
                       html.match(/<meta property="og:site_name" content="([^"]+)"/);
    const author = authorMatch ? authorMatch[1] : 'Unknown Author';
    
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';
    
    const durationMatch = html.match(/"duration":\s*(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 0;
    
    const handleMatch = html.match(/@([a-zA-Z0-9_]+)/);
    const handle = handleMatch ? handleMatch[1] : '';
    
    return { title, author, description, duration, handle, url };
  }
  
  private async resolveMetadata(env: Env, url: string): Promise<any> {
    const cacheKey = `meta:${url}`;
    const cached = await env.KV_USERS.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!response.ok) throw new Error('fetch_failed');
    const html = await response.text();
    
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'Unknown Title';
    
    const authorMatch = html.match(/"author":\s*"([^"]+)"/) || 
                       html.match(/<meta property="og:site_name" content="([^"]+)"/);
    const author = authorMatch ? authorMatch[1] : 'Unknown Author';
    
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';
    
    const durationMatch = html.match(/"duration":\s*(\d+)/);
    const duration_sec = durationMatch ? parseInt(durationMatch[1]) : 0;
    
    const handleMatch = html.match(/@([a-zA-Z0-9_]+)/);
    const author_handle = handleMatch ? handleMatch[1] : '';
    
    const meta = { title, author, description, duration_sec, author_handle, resolved_at: Date.now() };
    
    const cacheHours = 1 + Math.random() * 5;
    const cacheSeconds = Math.floor(cacheHours * 3600);
    await env.KV_USERS.put(cacheKey, JSON.stringify(meta), { expirationTtl: cacheSeconds });
    
    return meta;
  }
  
  private getAvailableEndpoints() {
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

  private getEndpointSuggestions(requestedPath: string, availableEndpoints: any) {
    const suggestions: string[] = [];
    const pathSegments = requestedPath.split('/').filter(Boolean);
    
    // Check for common typos and suggest corrections
    for (const category of Object.values(availableEndpoints)) {
      for (const endpoint of category as any[]) {
        const endpointSegments = endpoint.path.split('/').filter(Boolean);
        
        // Check for similar paths
        if (endpointSegments.length === pathSegments.length) {
          let similarity = 0;
          for (let i = 0; i < pathSegments.length; i++) {
            if (endpointSegments[i] === pathSegments[i] || 
                endpointSegments[i].includes(':') || 
                pathSegments[i].includes(endpointSegments[i])) {
              similarity++;
            }
          }
          
          if (similarity > 0 && similarity >= pathSegments.length * 0.5) {
            suggestions.push(`${endpoint.method} ${endpoint.path} - ${endpoint.description}`);
          }
        }
      }
    }
    
    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  public getApp() {
    return this.app;
  }
}

const gateway = new PluctGateway();
export default gateway.getApp();