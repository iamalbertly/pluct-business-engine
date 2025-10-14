import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import { cors } from 'hono/cors';

interface Env {
  KV_USERS: any;
  ENGINE_JWT_SECRET: string;
  ENGINE_ADMIN_KEY: string;
  TTT_SHARED_SECRET: string;
  TTT_BASE: string;
  LOG_LEVEL?: string;
  MAX_RETRIES?: string;
  REQUEST_TIMEOUT?: string;
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
    guidance: guidance || null
  }, status);
}

async function checkRateLimit(env: Env, key: string): Promise<boolean> {
  try {
    const rateLimitKey = `rate_limit:${key}`;
    const current = await env.KV_USERS.get(rateLimitKey);
    if (!current) {
      await env.KV_USERS.put(rateLimitKey, '1', { expirationTtl: 60 });
      return true;
    }
    const count = parseInt(current, 10);
    if (count >= 100) return false;
    await env.KV_USERS.put(rateLimitKey, String(count + 1), { expirationTtl: 60 });
    return true;
  } catch {
    return true;
  }
}

function validateEnvironment(env: Env): void {
  const required = ['ENGINE_JWT_SECRET', 'ENGINE_ADMIN_KEY', 'TTT_SHARED_SECRET', 'TTT_BASE'];
  for (const key of required) {
    if (!env[key as keyof Env]) throw new Error(`Missing ${key}`);
  }
  try { new URL(env.TTT_BASE); } catch { throw new Error('Invalid TTT_BASE URL'); }
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
  
  private setupMiddleware() {
    this.app.use('*', async (c, next) => {
      try {
        validateEnvironment(c.env);
      } catch (error) {
        return c.json({ error: 'configuration_error' }, 500);
      }
      await next();
    });

    this.app.use('*', cors({
      origin: '*',
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      allowMethods: ['POST', 'GET', 'OPTIONS'],
      maxAge: 86400
    }));
  }
  
  private setupRoutes() {
    // Health Check
    this.app.get('/health', async c => {
      try {
        await c.env.KV_USERS.put('health_check', 'ok', { expirationTtl: 60 });
        
        // Check TTT service health
        const tttHealth = await this.healthMonitor.checkHealth(c.env);
        const circuitState = this.circuitBreaker.getState();
        
        return c.json({
          ok: true,
          routes: [
            { method: 'GET', path: '/health', description: 'Health check and API discovery' },
            { method: 'GET', path: '/health/services', description: 'Service health monitoring' },
            { method: 'POST', path: '/vend-token', description: 'Get JWT token (costs 1 credit)', auth: 'none', body: '{ "userId": "string" }' },
            { method: 'POST', path: '/ttt/transcribe', description: 'Proxy to TTTranscribe', auth: 'Bearer JWT', body: 'TTTranscribe payload' },
            { method: 'GET', path: '/ttt/status/:id', description: 'Check transcription status', auth: 'Bearer JWT' },
            { method: 'POST', path: '/meta/resolve', description: 'Resolve TikTok metadata', auth: 'none', body: '{ "url": "string" }' },
            { method: 'POST', path: '/v1/credits/add', description: 'Add credits (admin)', auth: 'X-API-Key', body: '{ "userId": "string", "amount": number }' }
          ],
          diagnostics: { 
            kv: 'healthy', 
            responseTime: Date.now(),
            tttService: tttHealth,
            circuitBreaker: circuitState
          }
        });
      } catch (error) {
        return jsonError(c, 500, 'health_check_failed', 'Health check failed');
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
    
    // Token Vending
    this.app.post('/vend-token', async c => {
      try {
        const { userId } = await c.req.json();
        if (!userId) return jsonError(c, 400, 'missing_user_id', 'User ID is required', {}, 
          'Send POST to /vend-token with JSON body: { "userId": "your-user-id" }');
        
        const rateLimitAllowed = await checkRateLimit(c.env, `token_vend:${userId}`);
        if (!rateLimitAllowed) return jsonError(c, 429, 'rate_limit_exceeded', 'Rate limit exceeded. Please try again later.', { userId },
          'Wait 1 minute before retrying. Rate limit: 100 requests/minute per user.');
        
        // Distinguish missing user vs zero credits
        const raw = await c.env.KV_USERS.get(`credits:${userId}`);
        const credits = raw === null ? 0 : parseInt(raw || '0', 10);
        if (credits <= 0) {
          const reason = raw === null ? 'user_not_found_or_no_credits' : 'no_credits';
          return jsonError(c, 403, 'insufficient_credits', 'Insufficient credits for token vending', { userId, credits, reason },
            'Add credits via POST /v1/credits/add with X-API-Key header, or check balance first.');
        }
        
        await this.spendCredit(c.env, userId);
        const token = await this.generateToken(c.env, userId);
        
        log('token_vending', 'token vended successfully', { userId });
        return c.json({ token, expires_in: 900, user_id: userId });
      } catch (error) {
        log('token_vending', 'token vending failed', { error: (error as Error).message });
        return jsonError(c, 500, 'token_generation_failed', 'Token generation failed', { error: (error as Error).message },
          'Check server logs. Ensure ENGINE_JWT_SECRET is configured.');
      }
    });
    
    // TTTranscribe Proxy
    this.app.post('/ttt/transcribe', async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) return jsonError(c, 401, 'missing_auth', 'Authorization header required', {},
          'Include header: Authorization: Bearer <jwt-token>. Get token from /vend-token first.');
        
        const token = auth.slice(7);
        const payload = await this.verifyToken(c.env, token);
        
        const body = await c.req.text();
        
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
          return jsonError(c, 503, 'service_unavailable', 'TTTranscribe service is temporarily unavailable', 
            { circuitBreaker: this.circuitBreaker.getState() },
            'Service is experiencing issues. Please try again later or check /health/services for status.');
        }
        
        return jsonError(c, 500, 'proxy_failed', 'TTTranscribe proxy call failed', { error: (error as Error).message },
          'Check TTT_BASE and TTT_SHARED_SECRET configuration. Verify TTTranscribe service is running.');
      }
    });
    
    // Status Check
    this.app.get('/ttt/status/:id', async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) return jsonError(c, 401, 'missing_auth', 'Authorization header required', {},
          'Include header: Authorization: Bearer <jwt-token>. Get token from /vend-token first.');
        
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
          return jsonError(c, 503, 'service_unavailable', 'TTTranscribe service is temporarily unavailable', 
            { circuitBreaker: this.circuitBreaker.getState() },
            'Service is experiencing issues. Please try again later or check /health/services for status.');
        }
        
        return jsonError(c, 500, 'status_check_failed', 'TTTranscribe status check failed', { error: (error as Error).message },
          'Check TTT_BASE and TTT_SHARED_SECRET configuration. Verify TTTranscribe service is running.');
      }
    });
    
    // Metadata Resolution
    this.app.post('/meta/resolve', async c => {
      try {
        const { url } = await c.req.json();
        if (!url) return jsonError(c, 400, 'missing_url', 'URL is required', {},
          'Send POST to /meta/resolve with JSON body: { "url": "https://tiktok.com/..." }');
        
        const meta = await this.resolveMetadata(c.env, url);
        return c.json(meta);
      } catch (error) {
        log('meta_resolve', 'metadata resolution failed', { error: (error as Error).message });
        return jsonError(c, 500, 'metadata_resolution_failed', 'Metadata resolution failed', { error: (error as Error).message },
          'Check URL format. Ensure it\'s a valid TikTok URL.');
      }
    });
    
    // Admin Credit Addition
    this.app.post('/v1/credits/add', async c => {
      try {
        const apiKey = c.req.header('X-API-Key');
        if (apiKey !== c.env.ENGINE_ADMIN_KEY) return jsonError(c, 401, 'unauthorized', 'Invalid admin API key', {},
          'Include header: X-API-Key: <admin-key>. Get key from environment configuration.');
        
        const { userId, amount } = await c.req.json();
        if (!userId || typeof amount !== 'number') {
          return jsonError(c, 400, 'invalid_request', 'userId and numeric amount are required', { userId, amount },
            'Send POST to /v1/credits/add with JSON body: { "userId": "string", "amount": number } and X-API-Key header.');
        }
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
  
  // Core Methods
  private async getCredits(env: Env, userId: string): Promise<number> {
    const v = await env.KV_USERS.get(`credits:${userId}`);
    return parseInt(v || '0', 10);
  }
  
  private async addCredits(env: Env, userId: string, amount: number): Promise<void> {
    const cur = await this.getCredits(env, userId);
    await env.KV_USERS.put(`credits:${userId}`, String(cur + amount));
  }
  
  private async spendCredit(env: Env, userId: string): Promise<void> {
    const cur = await this.getCredits(env, userId);
    if (cur <= 0) throw new Error('insufficient_credits');
    await env.KV_USERS.put(`credits:${userId}`, String(cur - 1));
  }
  
  private async generateToken(env: Env, userId: string): Promise<string> {
    const sec = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.ENGINE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    return await new SignJWT({
      sub: userId,
      scope: 'ttt:transcribe',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60)
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .setIssuedAt()
      .sign(sec);
  }
  
  private async verifyToken(env: Env, token: string): Promise<TokenPayload> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.ENGINE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const { payload } = await jwtVerify(token, key);
    if (payload.scope !== 'ttt:transcribe') throw new Error('invalid_scope');
    return payload as unknown as TokenPayload;
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
  
  public getApp() {
    return this.app;
  }
}

const gateway = new PluctGateway();
export default gateway.getApp();