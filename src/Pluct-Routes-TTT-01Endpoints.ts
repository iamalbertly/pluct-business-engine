// TTTranscribe route handlers
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Env } from './Pluct-Core-Interfaces-01Types';
import { buildInfo, log } from './Pluct-Core-Utilities-01Helpers';
import { createErrorResponse, handleJWTError } from './Pluct-Core-Utilities-02ErrorHandling';
import { validateServiceToken } from './Pluct-Core-Utilities-03Authentication';

// Zod schemas
const TranscribeSchema = z.object({
  url: z.string().url(),
  clientRequestId: z.string().optional()
});

export function setupTTTRoutes(app: Hono<{ Bindings: Env }>, authValidator: any, circuitBreaker: any, tttProxy: any) {
  // Start transcription job
  app.post('/transcribe', zValidator('json', TranscribeSchema), async c => {
    try {
      const auth = c.req.header('Authorization');
      if (!auth?.startsWith('Bearer ')) {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'unauthorized',
          'Authorization header required',
          { providedAuth: !!auth },
          build,
          'Provide valid Authorization Bearer token'
        );
        return c.json(errorResponse, 401, { 'WWW-Authenticate': 'Bearer' });
      }
      
      const token = auth.slice(7);
      const payload = await authValidator.verifyToken(token, true);
      if (payload.scope !== 'ttt:transcribe') {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'forbidden',
          'Insufficient scope',
          { requiredScope: 'ttt:transcribe', providedScope: payload.scope },
          build,
          'Token must have ttt:transcribe scope'
        );
        return c.json(errorResponse, 403);
      }
      
      const { url, clientRequestId } = await c.req.json();
      
      // Idempotency check
      if (clientRequestId) {
        const idempotencyKey = `idempotency:transcribe:${clientRequestId}`;
        const existing = await c.env.KV_USERS?.get(idempotencyKey);
        if (existing) {
          const cachedResult = JSON.parse(existing);
          return c.json(cachedResult, 202);
        }
      }
      
      // Execute with circuit breaker
      const result = await circuitBreaker.execute(async () => {
        return await tttProxy.callTTT('/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
      });
      
      if (!result.ok) {
        let statusCode = 500;
        let errorCode = 'upstream_error';
        if (result.status >= 400 && result.status < 500) { 
          statusCode = result.status; 
          errorCode = 'upstream_client_error'; 
        } else if (result.status >= 500) { 
          statusCode = result.status >= 504 ? 504 : 502; 
          errorCode = result.status >= 504 ? 'upstream_timeout' : 'upstream_error'; 
        }
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          errorCode,
          'TTTranscribe service error',
          { upstreamStatus: result.status, upstreamResponse: await result.text().catch(() => 'Unable to read response') },
          build,
          'Please try again or contact support if the issue persists'
        );
        return c.json(errorResponse, statusCode as any);
      }
      
      const data = await result.json() as any;
      const response = {
        ok: true,
        jobId: data.id || data.jobId || data.requestId,
        status: 'queued',
        submittedAt: new Date().toISOString(),
        ...data
      };
      
      // Store for idempotency
      if (clientRequestId) {
        const idempotencyKey = `idempotency:transcribe:${clientRequestId}`;
        await c.env.KV_USERS?.put(idempotencyKey, JSON.stringify(response), { expirationTtl: 3600 });
      }
      
      return c.json(response, 202);
    } catch (error) {
      log('transcribe', 'transcription failed', { error: (error as Error).message });
      return handleJWTError(c, error);
    }
  });

  // Check transcription status
  app.get('/status/:id', async c => {
    try {
      const auth = c.req.header('Authorization');
      if (!auth?.startsWith('Bearer ')) {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'unauthorized',
          'Authorization header required',
          { providedAuth: !!auth },
          build,
          'Provide valid Authorization Bearer token'
        );
        return c.json(errorResponse, 401, { 'WWW-Authenticate': 'Bearer' });
      }
      
      const token = auth.slice(7);
      const payload = await authValidator.verifyToken(token, true);
      if (payload.scope !== 'ttt:transcribe') {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'forbidden',
          'Insufficient scope',
          { requiredScope: 'ttt:transcribe', providedScope: payload.scope },
          build,
          'Token must have ttt:transcribe scope'
        );
        return c.json(errorResponse, 403);
      }
      
      const id = c.req.param('id');
      
      // Execute with circuit breaker
      const result = await circuitBreaker.execute(async () => {
        return await tttProxy.callTTT(`/status/${id}`, { method: 'GET' });
      });
      
      if (!result.ok) {
        if (result.status === 404) {
          const build = buildInfo(c.env);
          const errorResponse = createErrorResponse(
            'job_not_found',
            'Job not found',
            { jobId: id },
            build,
            'Check the job ID and try again'
          );
          return c.json(errorResponse, 404);
        }
        
        let statusCode = 500;
        let errorCode = 'upstream_error';
        if (result.status >= 400 && result.status < 500) { 
          statusCode = result.status; 
          errorCode = 'upstream_client_error'; 
        } else if (result.status >= 500) { 
          statusCode = result.status >= 504 ? 504 : 502; 
          errorCode = result.status >= 504 ? 'upstream_timeout' : 'upstream_error'; 
        }
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          errorCode,
          'TTTranscribe service error',
          { upstreamStatus: result.status, upstreamResponse: await result.text().catch(() => 'Unable to read response') },
          build,
          'Please try again or contact support if the issue persists'
        );
        return c.json(errorResponse, statusCode as any);
      }
      
      const data = await result.json() as any;
      return c.json({
        ok: true,
        jobId: id,
        status: data.status || data.state || 'unknown',
        progress: data.progress,
        result: data.result || data.transcription,
        ...data
      });
    } catch (error) {
      log('status', 'status check failed', { error: (error as Error).message });
      return handleJWTError(c, error);
    }
  });
}
