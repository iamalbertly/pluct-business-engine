import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import { cors } from 'hono/cors';

interface Env {
  KV_USERS: any;
  ENGINE_JWT_SECRET: string;
  ENGINE_ADMIN_KEY: string;
  TTT_SHARED_SECRET: string;
  TTT_BASE: string;
}

interface TokenPayload {
  sub: string;
  scope: string;
  iat: number;
  exp: number;
}

// Utilities
function log(stage: string, message: string, metadata?: any) {
  console.log(`be:${stage} msg=${message}${metadata ? ` metadata=${JSON.stringify(metadata)}` : ''}`);
}

function jsonError(c: any, status: number, code: string, message: string, details?: Record<string, any>) {
  return c.json({ ok: false, code, message, details: details || {} }, status);
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
  
  constructor() {
    this.app = new Hono<{ Bindings: Env }>();
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
        return c.json({
          ok: true,
          routes: ['/vend-token', '/ttt/transcribe', '/ttt/status/:id', '/meta/resolve'],
          diagnostics: { kv: 'healthy', responseTime: Date.now() }
        });
      } catch (error) {
        return jsonError(c, 500, 'health_check_failed', 'Health check failed');
      }
    });
    
    // Token Vending
    this.app.post('/vend-token', async c => {
      try {
        const { userId } = await c.req.json();
        if (!userId) return jsonError(c, 400, 'missing_user_id', 'User ID is required');
        
        const rateLimitAllowed = await checkRateLimit(c.env, `token_vend:${userId}`);
        if (!rateLimitAllowed) return jsonError(c, 429, 'rate_limit_exceeded', 'Rate limit exceeded. Please try again later.', { userId });
        
        // Distinguish missing user vs zero credits
        const raw = await c.env.KV_USERS.get(`credits:${userId}`);
        const credits = raw === null ? 0 : parseInt(raw || '0', 10);
        if (credits <= 0) {
          const reason = raw === null ? 'user_not_found_or_no_credits' : 'no_credits';
          return jsonError(c, 403, 'insufficient_credits', 'Insufficient credits for token vending', { userId, credits, reason });
        }
        
        await this.spendCredit(c.env, userId);
        const token = await this.generateToken(c.env, userId);
        
        log('token_vending', 'token vended successfully', { userId });
        return c.json({ token, expires_in: 900, user_id: userId });
      } catch (error) {
        log('token_vending', 'token vending failed', { error: (error as Error).message });
        return jsonError(c, 500, 'token_generation_failed', 'Token generation failed', { error: (error as Error).message });
      }
    });
    
    // TTTranscribe Proxy
    this.app.post('/ttt/transcribe', async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) return jsonError(c, 401, 'missing_auth', 'Authorization header required');
        
        const token = auth.slice(7);
        const payload = await this.verifyToken(c.env, token);
        
        const body = await c.req.text();
        const response = await this.callTTT(c.env, '/transcribe', {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/json' }
        });
        
        log('ttt_proxy', `call=transcribe http=${response.status}`, { userId: payload.sub });
        return new Response(response.body, { status: response.status, headers: response.headers });
      } catch (error) {
        log('ttt_proxy', 'transcribe request failed', { error: (error as Error).message });
        return jsonError(c, 500, 'proxy_failed', 'TTTranscribe proxy call failed', { error: (error as Error).message });
      }
    });
    
    // Status Check
    this.app.get('/ttt/status/:id', async c => {
      try {
        const auth = c.req.header('Authorization');
        if (!auth?.startsWith('Bearer ')) return jsonError(c, 401, 'missing_auth', 'Authorization header required');
        
        const token = auth.slice(7);
        await this.verifyToken(c.env, token);
        
        const requestId = c.req.param('id');
        const response = await this.callTTT(c.env, `/status/${requestId}`, { method: 'GET' });
        
        log('ttt_proxy', `call=status http=${response.status}`, { requestId });
        return new Response(response.body, { status: response.status, headers: response.headers });
      } catch (error) {
        log('ttt_proxy', 'status check failed', { error: (error as Error).message });
        return jsonError(c, 500, 'status_check_failed', 'TTTranscribe status check failed', { error: (error as Error).message });
      }
    });
    
    // Metadata Resolution
    this.app.post('/meta/resolve', async c => {
      try {
        const { url } = await c.req.json();
        if (!url) return jsonError(c, 400, 'missing_url', 'URL is required');
        
        const meta = await this.resolveMetadata(c.env, url);
        return c.json(meta);
      } catch (error) {
        log('meta_resolve', 'metadata resolution failed', { error: (error as Error).message });
        return jsonError(c, 500, 'metadata_resolution_failed', 'Metadata resolution failed', { error: (error as Error).message });
      }
    });
    
    // Admin Credit Addition
    this.app.post('/v1/credits/add', async c => {
      try {
        const apiKey = c.req.header('X-API-Key');
        if (apiKey !== c.env.ENGINE_ADMIN_KEY) return jsonError(c, 401, 'unauthorized', 'Invalid admin API key');
        
        const { userId, amount } = await c.req.json();
        if (!userId || typeof amount !== 'number') {
          return jsonError(c, 400, 'invalid_request', 'userId and numeric amount are required', { userId, amount });
        }
        await this.addCredits(c.env, userId, amount);
        
        log('credits', 'credits added', { userId, amount });
        return c.json({ ok: true, userId, amount });
      } catch (error) {
        log('credits', 'credit addition failed', { error: (error as Error).message });
        return jsonError(c, 500, 'credits_add_failed', 'Failed to add credits', { error: (error as Error).message });
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
    return payload as TokenPayload;
  }
  
  private async callTTT(env: Env, path: string, init: RequestInit): Promise<Response> {
    const url = `${env.TTT_BASE}${path}`;
    const requestInit: RequestInit = {
      ...init,
      headers: { ...(init.headers || {}), 'X-Engine-Auth': env.TTT_SHARED_SECRET }
    };
    return await fetch(url, requestInit);
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