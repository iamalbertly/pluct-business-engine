// Main gateway orchestrator - simplified and focused
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './Pluct-Core-Interfaces-01Types';
import { resolveConfig, validateEnvironment, log, jsonError, buildInfo } from './Pluct-Core-Utilities-01Helpers';
import { createErrorResponse } from './Pluct-Core-Utilities-02ErrorHandling';
import { setupHealthRoutes } from './Pluct-Routes-Health-01Endpoints';
import { setupMetaRoutes } from './Pluct-Routes-Meta-01Endpoints';
import { setupV1Routes } from './Pluct-Routes-V1-01Endpoints';
import { setupTTTRoutes } from './Pluct-Routes-TTT-01Endpoints';

// Import service classes
import { PluctAuthValidator } from './Pluct-Auth-Token-Validation';
import { PluctCreditsManager } from './Pluct-Credits-Balance-Management';
import { PluctRateLimiter } from './Pluct-Rate-Limiting-Protection';
import { PluctDatabaseManager } from './Pluct-Database-Initialization';
import { PluctCircuitBreaker } from './Pluct-Circuit-Breaker-Protection';
import { PluctHealthMonitor } from './Pluct-Health-Monitoring-Service';
import { PluctTTTranscribeProxy } from './Pluct-TTTranscribe-Proxy-Service';
import { PluctMetadataResolver } from './Pluct-Metadata-Resolver-Service';

export class PluctGateway {
  private app: Hono<{ Bindings: Env }>;
  private authValidator!: PluctAuthValidator;
  private creditsManager!: PluctCreditsManager;
  private rateLimiter!: PluctRateLimiter;
  private databaseManager!: PluctDatabaseManager;
  private circuitBreaker!: PluctCircuitBreaker;
  private healthMonitor!: PluctHealthMonitor;
  private tttProxy!: PluctTTTranscribeProxy;
  private metadataResolver!: PluctMetadataResolver;

  constructor() {
    this.app = new Hono<{ Bindings: Env }>();
    this.setupMiddleware();
  }

  private setupMiddleware() {
    // CORS configuration
    const corsConfig = {
      origin: (origin: string) => {
        const allowedOrigins = [
          'https://pluct.com',
          'https://app.pluct.com',
          'https://mobile.pluct.com',
          'http://localhost:3000',
          'http://localhost:8080'
        ];
        return allowedOrigins.includes(origin) || !origin ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Client-Request-Id'],
      exposeHeaders: ['X-API-Deprecation', 'X-Capabilities', 'WWW-Authenticate', 'Allow'],
      credentials: true
    };

    this.app.use('*', cors(corsConfig));

    // Content-Type middleware
    this.app.use('*', async (c, next) => {
      await next();
      c.res.headers.set('content-type', 'application/json');
    });

    // Request timeout protection middleware
    this.app.use('*', async (c, next) => {
      const start = Date.now();
      const method = c.req.method;
      const url = c.req.url;
      const userAgent = c.req.header('User-Agent') || 'unknown';
      const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
      
      // Set request timeout (30 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 30000);
      });
      
      try {
        await Promise.race([next(), timeoutPromise]);
      } catch (error) {
        if ((error as Error).message === 'Request timeout') {
          const build = buildInfo(c.env);
          const errorResponse = createErrorResponse(
            'request_timeout',
            'Request processing timeout',
            { timeoutMs: 30000 },
            build,
            'Please try again with a simpler request'
          );
          return c.json(errorResponse, 408);
        }
        throw error;
      }
      
      const duration = Date.now() - start;
      const status = c.res.status;
      log('request', `${method} ${url}`, { 
        status, 
        duration, 
        userAgent, 
        ip 
      });
    });

    // Request deduplication middleware
    this.app.use('*', async (c, next) => {
      const method = c.req.method;
      const clientRequestId = c.req.header('X-Client-Request-Id');
      
      if (['POST', 'PUT', 'PATCH'].includes(method) && clientRequestId) {
        const userId = 'system'; // This would be extracted from JWT in real implementation
        const dedupKey = `dedup:${userId}:${clientRequestId}`;
        const existing = await c.env.KV_USERS?.get(dedupKey);
        
        if (existing) {
          const cachedResponse = JSON.parse(existing);
          return c.json(cachedResponse.body, cachedResponse.status, cachedResponse.headers);
        }
        
        // Mark as processing
        await c.env.KV_USERS?.put(dedupKey, JSON.stringify({ status: 'processing' }), { expirationTtl: 300 });
      }
      
      await next();
      
      // Cache successful responses for deduplication
      if (clientRequestId && c.env.KV_USERS && c.res.status < 400) {
        const userId = 'system'; // This would be extracted from JWT in real implementation
        const dedupKey = `dedup:${userId}:${clientRequestId}`;
        const responseData = {
          body: await c.res.clone().json().catch(() => ({})),
          status: c.res.status,
          headers: Object.fromEntries(c.res.headers.entries())
        };
        await c.env.KV_USERS?.put(dedupKey, JSON.stringify(responseData), { expirationTtl: 300 });
      }
    });

    // Global error handler
    this.app.onError((err, c) => {
      log('error', 'unexpected error', { error: err.message, stack: err.stack });
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'internal_server_error',
        'An unexpected error occurred',
        { error: err.message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    });

    // 404 handler for unknown routes
    this.app.notFound((c) => {
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'route_not_found',
        'Endpoint not found',
        {},
        build,
        'Check the API documentation for available endpoints'
      );
      return c.json(errorResponse, 404);
    });
  }

  private setupRoutes() {
    // Health and monitoring routes (mounted at root)
    setupHealthRoutes(this.app, this.healthMonitor);
    
    // Metadata routes (mounted at root)
    setupMetaRoutes(this.app, this.metadataResolver);
    
    // V1 API routes (mounted at /v1)
    const v1Router = new Hono<{ Bindings: Env }>();
    setupV1Routes(v1Router, this.authValidator, this.creditsManager, this.rateLimiter);
    this.app.route('/v1', v1Router);
    
    // TTTranscribe routes (mounted at /ttt)
    const tttRouter = new Hono<{ Bindings: Env }>();
    setupTTTRoutes(tttRouter, this.authValidator, this.circuitBreaker, this.tttProxy);
    this.app.route('/ttt', tttRouter);
  }

  async initialize(env: Env) {
    const resolvedEnv = resolveConfig(env);
    
    // Initialize all services with resolved configuration
    this.authValidator = new PluctAuthValidator({ ENGINE_JWT_SECRET: resolvedEnv.ENGINE_JWT_SECRET! });
    this.creditsManager = new PluctCreditsManager(env);
    this.rateLimiter = new PluctRateLimiter(env);
    this.databaseManager = new PluctDatabaseManager(env);
    this.circuitBreaker = new PluctCircuitBreaker();
    this.healthMonitor = new PluctHealthMonitor({
      TTT_BASE: resolvedEnv.TTT_BASE!,
      TTT_SHARED_SECRET: resolvedEnv.TTT_SHARED_SECRET!
    });
    this.tttProxy = new PluctTTTranscribeProxy({
      TTT_BASE: resolvedEnv.TTT_BASE!,
      TTT_SHARED_SECRET: resolvedEnv.TTT_SHARED_SECRET!
    });
    this.metadataResolver = new PluctMetadataResolver({
      TTT_BASE: resolvedEnv.TTT_BASE!,
      TTT_SHARED_SECRET: resolvedEnv.TTT_SHARED_SECRET!,
      KV_USERS: resolvedEnv.KV_USERS!
    });
    
    // Initialize database
    await this.databaseManager.initializeDatabase();
    
    // Initialize circuit breaker services
    this.circuitBreaker.addService('ttt', {
      failureThreshold: 5,
      timeout: 30000,
      resetTimeout: 60000
    });
    
    this.circuitBreaker.addService('metadata', {
      failureThreshold: 3,
      timeout: 15000,
      resetTimeout: 30000
    });
    
    this.circuitBreaker.addService('database', {
      failureThreshold: 10,
      timeout: 5000,
      resetTimeout: 120000
    });
    
    // Setup routes after services are initialized
    this.setupRoutes();
  }

  getApp(): Hono<{ Bindings: Env }> {
    return this.app;
  }
}
