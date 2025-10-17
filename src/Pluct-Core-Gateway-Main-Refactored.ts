import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { PluctAuthValidator } from './Pluct-Auth-Token-Validation';
import { PluctCreditsManager } from './Pluct-Credits-Balance-Management';
import { PluctRateLimiter } from './Pluct-Rate-Limiting-Protection';
import { PluctDatabaseManager } from './Pluct-Database-Initialization';
import { PluctCircuitBreaker } from './Pluct-Circuit-Breaker-Protection';
import { PluctHealthMonitor } from './Pluct-Health-Monitoring-Service';
import { PluctTTTranscribeProxy } from './Pluct-TTTranscribe-Proxy-Service';
import { PluctMetadataResolver } from './Pluct-Metadata-Resolver-Service';

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
  BUILD_REF?: string;
  BUILD_TIME?: string;
  // Legacy aliases
  JWT_SECRET?: string;
  ADMIN_SECRET?: string;
  ENGINE_SHARED_SECRET?: string;
  ADMIN_API_KEY?: string;
}

type EffectiveConfig = {
  ENGINE_JWT_SECRET?: string;
  ENGINE_ADMIN_KEY?: string;
  TTT_SHARED_SECRET?: string;
  TTT_BASE?: string;
  KV_USERS?: any;
  DB?: D1Database;
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

// Environment resolution helper
function pickFirst(env: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function resolveConfig(env: any): EffectiveConfig {
  return {
    // Accept legacy names so your current Cloudflare secrets keep working:
    ENGINE_JWT_SECRET: pickFirst(env, ['ENGINE_JWT_SECRET', 'JWT_SECRET', 'ENGINE_SHARED_SECRET']),
    ENGINE_ADMIN_KEY:  pickFirst(env, ['ENGINE_ADMIN_KEY', 'ADMIN_SECRET', 'ADMIN_API_KEY']),
    TTT_SHARED_SECRET: pickFirst(env, ['TTT_SHARED_SECRET', 'ENGINE_SHARED_SECRET']),
    TTT_BASE:          pickFirst(env, ['TTT_BASE']),
    KV_USERS:          env.KV_USERS,
    DB:                env.DB
  };
}

// Utilities
function log(stage: string, message: string, metadata?: any) {
  console.log(`be:${stage} msg=${message}${metadata ? ` metadata=${JSON.stringify(metadata)}` : ''}`);
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
    ref: env.BUILD_REF || null,
    deployedAt: env.BUILD_TIME || null
  };
}

function getConfigurationDiagnostics(env: any) {
  const cfg = resolveConfig(env);
  
  const configStatus = {
    ENGINE_JWT_SECRET: !!cfg.ENGINE_JWT_SECRET,
    ENGINE_ADMIN_KEY:  !!cfg.ENGINE_ADMIN_KEY,
    TTT_SHARED_SECRET: !!cfg.TTT_SHARED_SECRET,
    TTT_BASE:          !!cfg.TTT_BASE,
    KV_USERS:          !!cfg.KV_USERS
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!cfg.ENGINE_JWT_SECRET) errors.push('Missing ENGINE_JWT_SECRET (or JWT_SECRET/ENGINE_SHARED_SECRET)');
  if (!cfg.ENGINE_ADMIN_KEY)  errors.push('Missing ENGINE_ADMIN_KEY (or ADMIN_SECRET/ADMIN_API_KEY)');
  if (!cfg.TTT_SHARED_SECRET) errors.push('Missing TTT_SHARED_SECRET (or ENGINE_SHARED_SECRET)');
  if (!cfg.TTT_BASE)          errors.push('Missing TTT_BASE');
  if (!cfg.KV_USERS)          errors.push('Missing KV_USERS');

  // Add warnings for short secrets
  if (cfg.ENGINE_JWT_SECRET && cfg.ENGINE_JWT_SECRET.length < 16) {
    warnings.push(`ENGINE_JWT_SECRET is too short (${cfg.ENGINE_JWT_SECRET.length} chars). Recommended: 32+ characters`);
  }
  if (cfg.ENGINE_ADMIN_KEY && cfg.ENGINE_ADMIN_KEY.length < 16) {
    warnings.push(`ENGINE_ADMIN_KEY is too short (${cfg.ENGINE_ADMIN_KEY.length} chars). Recommended: 32+ characters`);
  }
  if (cfg.TTT_SHARED_SECRET && cfg.TTT_SHARED_SECRET.length < 16) {
    warnings.push(`TTT_SHARED_SECRET is too short (${cfg.TTT_SHARED_SECRET.length} chars). Recommended: 32+ characters`);
  }

  if (cfg.TTT_BASE) {
    try {
      const url = new URL(cfg.TTT_BASE);
      if (url.protocol !== 'https:') {
        warnings.push('TTT_BASE should use HTTPS protocol');
      }
    } catch {
      errors.push(`Invalid TTT_BASE URL: ${cfg.TTT_BASE}`);
    }
  }

  const missing = Object.entries(configStatus).filter(([_, ok]) => !ok).map(([k]) => k);
  return { errors, warnings, configStatus, missing };
}

function validateEnvironment(env: any): void {
  const { errors, warnings } = getConfigurationDiagnostics(env);
  if (errors.length) {
    throw Object.assign(
      new Error(
        `Configuration validation failed: ${errors.length} error(s), ${warnings.length} warning(s). Details: ${errors.join('; ')}`
      ),
      { code: 'configuration_error', status: 500 }
    );
  }
}

export class PluctGateway {
  private app: Hono<{ Bindings: Env }>;
  private authValidator: PluctAuthValidator;
  private creditsManager: PluctCreditsManager;
  private rateLimiter: PluctRateLimiter;
  private databaseManager: PluctDatabaseManager;
  private circuitBreaker: PluctCircuitBreaker;
  private healthMonitor: PluctHealthMonitor;
  private tttProxy: PluctTTTranscribeProxy;
  private metadataResolver: PluctMetadataResolver;
  
  constructor() {
    this.app = new Hono<{ Bindings: Env }>();
    // Initialize with dummy env to prevent undefined errors
    this.metadataResolver = new PluctMetadataResolver({} as any);
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  async initialize(env: Env): Promise<void> {
    this.authValidator = new PluctAuthValidator(env);
    this.creditsManager = new PluctCreditsManager(env);
    this.rateLimiter = new PluctRateLimiter(env);
    this.databaseManager = new PluctDatabaseManager(env);
    this.circuitBreaker = new PluctCircuitBreaker();
    this.healthMonitor = new PluctHealthMonitor(env);
    this.tttProxy = new PluctTTTranscribeProxy(env);
    // Reinitialize with real env
    this.metadataResolver = new PluctMetadataResolver(env);
    
    try {
      await this.databaseManager.initializeDatabase();
    } catch (error) {
      console.log('Database initialization failed, continuing with fallback:', error);
    }

    // Initialize circuit breaker with TTT service
    this.circuitBreaker.addService('ttt', {
      failureThreshold: 5,
      timeout: 30000,
      resetTimeout: 60000
    });
  }
  
  private setupMiddleware() {
    // Global middleware - only CORS and logging, no validation

    // Request logging middleware
    this.app.use('*', async (c, next) => {
      const start = Date.now();
      const method = c.req.method;
      const url = c.req.url;
      const userAgent = c.req.header('User-Agent') || 'unknown';
      const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
      
      await next();
      
      const duration = Date.now() - start;
      const status = c.res.status;
      log('request', `${method} ${url}`, { 
        status, 
        duration, 
        userAgent: userAgent.substring(0, 100), 
        ip: ip.substring(0, 50) 
      });
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
    // Create protected route groups with validation
    const protectedV1 = new Hono<{ Bindings: Env }>();
    const protectedTTT = new Hono<{ Bindings: Env }>();
    const protectedMeta = new Hono<{ Bindings: Env }>();

    // Add validation middleware to protected routes
    const requireConfig = async (c: any, next: any) => { 
      validateEnvironment(c.env); 
      await next(); 
    };

    protectedV1.use('*', requireConfig);
    protectedTTT.use('*', requireConfig);
    protectedMeta.use('*', requireConfig);

    // Public routes (no validation)
    this.setupPublicRoutes();
    
    // Protected routes
    this.setupProtectedV1Routes(protectedV1);
    this.setupProtectedTTTRoutes(protectedTTT);
    this.setupProtectedMetaRoutes(protectedMeta);

    // Mount protected route groups
    this.app.route('/v1', protectedV1);
    this.app.route('/ttt', protectedTTT);
    this.app.route('/meta', protectedMeta);

    // 404 handler
    this.app.notFound(c => c.json({ 
      ok: false, 
      code: 'route_not_found', 
      message: 'Endpoint not found' 
    }, 404));
  }

  private setupPublicRoutes() {
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
      const uptimeSeconds = Math.floor(Date.now() / 1000);
      
      // Check configuration status using resolved config
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

      // Check TTT service connectivity
      let tttStatus = 'unknown';
      try {
        const tttHealth = await this.healthMonitor.checkTTTHealth(c.env);
        tttStatus = tttHealth.status;
      } catch (error) {
        tttStatus = 'error';
        log('health', 'TTT connectivity check failed', { error: (error as Error).message });
      }

      // Check circuit breaker status
      const circuitBreakerStatus = this.circuitBreaker?.getServiceStatus?.('ttt') || 'unknown';
      
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
          kv: kvStatus,
          ttt: tttStatus,
          circuitBreaker: circuitBreakerStatus
        },
        routes: availableRoutes,
        issues: allConfigured ? [] : diag.missing.map(k => `Missing ${k}`),
        warnings: diag.warnings
      }, 200);
    });
    
    // Configuration Debug Endpoint
    this.app.get('/debug/config', async c => {
      const cfg = resolveConfig(c.env);
      const config = {
        ENGINE_JWT_SECRET: cfg.ENGINE_JWT_SECRET ? `Configured (${cfg.ENGINE_JWT_SECRET.length} chars)` : 'Missing',
        ENGINE_ADMIN_KEY:  cfg.ENGINE_ADMIN_KEY  ? `Configured (${cfg.ENGINE_ADMIN_KEY.length} chars)`  : 'Missing',
        TTT_SHARED_SECRET: cfg.TTT_SHARED_SECRET ? `Configured (${cfg.TTT_SHARED_SECRET.length} chars)` : 'Missing',
        TTT_BASE:          cfg.TTT_BASE || 'Missing',
        KV_USERS:          cfg.KV_USERS ? 'Configured' : 'Missing',
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
          ENGINE_JWT_SECRET: 'Run: wrangler secret put ENGINE_JWT_SECRET (or JWT_SECRET/ENGINE_SHARED_SECRET)',
          ENGINE_ADMIN_KEY: 'Run: wrangler secret put ENGINE_ADMIN_KEY (or ADMIN_SECRET/ADMIN_API_KEY)', 
          TTT_SHARED_SECRET: 'Run: wrangler secret put TTT_SHARED_SECRET (or ENGINE_SHARED_SECRET)',
          TTT_BASE: 'Check wrangler.toml [vars] section',
          KV_USERS: 'Check wrangler.toml [[kv_namespaces]] section'
        } : {}
      });
    });
    
    
    // Service Health Monitoring
    this.app.get('/health/services', async c => {
      try {
        const tttHealth = await this.healthMonitor.checkHealth();
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
        const payload = await this.authValidator.verifyToken(token, false);
        userId = payload.sub;
        
        // Check for required scope
        if (payload.scope !== 'ttt:transcribe') {
          return c.json({ error: 'INSUFFICIENT_SCOPE', message: 'Required scope: ttt:transcribe' }, 403);
        }
        
        // Rate limiting check
        const ip = c.req.header('CF-Connecting-IP') || 'unknown';
        const rateLimitOk = await this.rateLimiter.checkRateLimitPerUserAndIP(userId, ip);
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
        const creditResult = await this.creditsManager.spendCreditAtomic(
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
        
        const jwt = await this.authValidator.generateShortLivedToken(tokenPayload);
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
    
    
    // Metadata endpoint with randomized TTL caching
    this.app.get('/meta', zValidator('query', MetaQuerySchema), async c => {
      try {
        const { url } = c.req.valid('query');
        
        // Check if KV_USERS is available
        if (!c.env.KV_USERS) {
          log('meta', 'KV_USERS not available, fetching without cache');
          // Fetch metadata directly without caching
          const metadata = await this.metadataResolver.fetchTikTokMetadata(url);
          return c.json(metadata);
        }
        
        const cacheKey = `meta:${url}`;
        const cached = await c.env.KV_USERS.get(cacheKey);
        if (cached) {
          return c.json(JSON.parse(cached));
        }
        
        // Fetch metadata from TikTok
        const metadata = await this.metadataResolver.fetchTikTokMetadata(url);
        
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
    
    
  }
  
  private getServiceRecommendations(tttHealth: any, circuitState: any): string[] {
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

  private setupProtectedV1Routes(router: Hono<{ Bindings: Env }>) {
    // Credits Balance
    router.get('/credits/balance', async c => {
      try {
        // Extract and verify JWT authentication
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        const payload = await this.authValidator.verifyToken(token, false);
        const userId = payload.sub;
        
        // Get current balance
        const balance = await this.creditsManager.getCredits(userId);
        
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

    // Legacy Android compatibility endpoint
    router.post('/user/balance', async c => {
      try {
        // Extract and verify JWT authentication
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        const payload = await this.authValidator.verifyToken(token, false);
        const userId = payload.sub;
        
        // Get current balance
        const balance = await this.creditsManager.getCredits(userId);
        
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

    // Token Vending - Updated to /v1/vend-token with JWT auth and atomic credit deduction
    router.post('/vend-token', zValidator('json', VendTokenSchema), async c => {
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
        const payload = await this.authValidator.verifyToken(token, false);
        userId = payload.sub;
        
        // Get request data
        const { clientRequestId: reqId } = await c.req.json();
        clientRequestId = reqId;
        requestId = clientRequestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Check rate limiting
        const ip = c.req.header('CF-Connecting-IP') || 'unknown';
        const canProceed = await this.rateLimiter.checkRateLimitPerUserAndIP(userId, ip);
        if (!canProceed) {
          return jsonError(c, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
        }
        
        // Check idempotency
        const idempotencyKey = `idempotency:${userId}:${requestId}`;
        const existingResponse = await c.env.KV_USERS.get(idempotencyKey);
        if (existingResponse) {
          const cached = JSON.parse(existingResponse);
          if (cached.status === 'processing') {
            return jsonError(c, 409, 'REQUEST_IN_PROGRESS', 'Request is already being processed');
          }
          return c.json(cached.response);
        }
        
        // Mark as processing
        await c.env.KV_USERS.put(idempotencyKey, JSON.stringify({ status: 'processing' }), { expirationTtl: 900 });
        
        // Atomic credit deduction
        const creditResult = await this.creditsManager.spendCreditAtomic(userId, requestId, '/v1/vend-token', ip, c.req.header('User-Agent'));
        if (!creditResult.success) {
          return jsonError(c, 402, 'INSUFFICIENT_CREDITS', 'Insufficient credits', { balance: creditResult.balanceAfter });
        }
        
        // Generate short-lived token
        const shortLivedToken = await this.authValidator.generateShortLivedToken({
          sub: userId,
          scope: 'ttt:transcribe',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900 // 15 minutes
        });
        
        const response = {
          token: shortLivedToken,
          expiresIn: 900,
          balanceAfter: creditResult.balanceAfter,
          requestId
        };
        
        // Cache successful response
        await c.env.KV_USERS.put(idempotencyKey, JSON.stringify({ 
          status: 'completed', 
          response 
        }), { expirationTtl: 900 });
        
        const duration = Date.now() - startTime;
        log('vend_token', 'token vended successfully', { userId, requestId, duration, balanceAfter: creditResult.balanceAfter });
        
        return c.json(response);
        
      } catch (error) {
        log('vend_token', 'token vending failed', { error: (error as Error).message, userId, requestId });
        
        if ((error as any)?.code === 'invalid_token') {
          return jsonError(c, 401, 'INVALID_TOKEN', 'Invalid or expired token');
        }
        
        return jsonError(c, 500, 'TOKEN_VENDING_FAILED', 'Token vending failed');
      }
    });

    // Add Credits (Admin)
    router.post('/credits/add', zValidator('json', AddCreditsSchema), async c => {
      try {
        const adminKey = c.req.header('X-API-Key');
        if (adminKey !== c.env.ENGINE_ADMIN_KEY) {
          return jsonError(c, 403, 'INVALID_ADMIN_KEY', 'Invalid admin API key');
        }
        
        const { userId, amount } = await c.req.json();
        await this.creditsManager.addCredits(userId, amount);
        
        return c.json({ 
          message: 'Credits added successfully', 
          userId, 
          amount,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        log('add_credits', 'credit addition failed', { error: (error as Error).message });
        return jsonError(c, 500, 'CREDIT_ADDITION_FAILED', 'Failed to add credits');
      }
    });
  }

  private setupProtectedTTTRoutes(router: Hono<{ Bindings: Env }>) {
    // TTTranscribe Proxy - Transcription
    router.post('/transcribe', zValidator('json', TranscribeSchema), async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        const payload = await this.authValidator.verifyToken(token, true);
        
        const { url } = await c.req.json();
        
        // Use circuit breaker for resilience
        const result = await this.circuitBreaker.execute(async () => {
          return await this.tttProxy.callTTT('/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
        });
        
        if (!result.ok) {
          return jsonError(c, result.status, 'TTT_SERVICE_ERROR', 'TTTranscribe service error');
        }
        
        const data = await result.json();
        return c.json(data);
        
      } catch (error) {
        log('transcribe', 'transcription failed', { error: (error as Error).message });
        return jsonError(c, 500, 'TRANSCRIPTION_FAILED', 'Transcription failed');
      }
    });

    // TTTranscribe Proxy - Status Check
    router.get('/status/:id', async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          return jsonError(c, 401, 'MISSING_AUTH', 'Authorization header required');
        }
        
        const token = auth.slice(7);
        await this.authValidator.verifyToken(token, true);
        
        const id = c.req.param('id');
        
        const result = await this.circuitBreaker.execute(async () => {
          return await this.tttProxy.callTTT(`/status/${id}`, { method: 'GET' });
        });
        
        if (!result.ok) {
          return jsonError(c, result.status, 'TTT_SERVICE_ERROR', 'TTTranscribe service error');
        }
        
        const data = await result.json();
        return c.json(data);
        
      } catch (error) {
        log('status', 'status check failed', { error: (error as Error).message });
        return jsonError(c, 500, 'STATUS_CHECK_FAILED', 'Status check failed');
      }
    });
  }

  private setupProtectedMetaRoutes(router: Hono<{ Bindings: Env }>) {
    // Metadata Resolution
    router.post('/resolve', zValidator('json', MetaResolveSchema), async c => {
      try {
        const { url } = await c.req.json();
        
        const metadata = await this.metadataResolver.resolveMetadata(url);
        
        return c.json({
          url,
          metadata,
          cached: false,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        log('meta_resolve', 'metadata resolution failed', { error: (error as Error).message });
        return jsonError(c, 500, 'METADATA_RESOLUTION_FAILED', 'Metadata resolution failed');
      }
    });
  }

  public getApp() {
    return this.app;
  }
}

// Gateway will be instantiated in index.ts
