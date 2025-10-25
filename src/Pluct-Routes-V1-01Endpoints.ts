// V1 API route handlers
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Env } from './Pluct-Core-Interfaces-01Types';
import { buildInfo, log, resolveConfig } from './Pluct-Core-Utilities-01Helpers';
import { createErrorResponse } from './Pluct-Core-Utilities-02ErrorHandling';
import { validateAdminAuth, validateUserAuth } from './Pluct-Core-Utilities-03Authentication';

// Zod schemas
const AddCreditsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().optional(),
  clientRequestId: z.string().optional()
});

const VendTokenSchema = z.object({
  userId: z.string().min(1),
  clientRequestId: z.string().optional()
});

export function setupV1Routes(app: Hono<{ Bindings: Env }>, authValidator: any, creditsManager: any, rateLimiter: any) {
  // Add credits to user account (Admin only)
  app.post('/credits/add', zValidator('json', AddCreditsSchema), async c => {
    try {
      const authResult = await validateAdminAuth(c);
      if (!authResult.isAuthenticated) {
        return c.json(authResult.error, 401, { 'WWW-Authenticate': 'Bearer' });
      }
      
      const { userId, amount, reason, clientRequestId } = await c.req.json();
      
      if (amount <= 0) {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'invalid_body',
          'Amount must be greater than 0',
          { providedAmount: amount },
          build,
          'Provide a positive amount value'
        );
        return c.json(errorResponse, 422);
      }
      
      if (clientRequestId) {
        const idempotencyKey = `idempotency:credits:add:${clientRequestId}`;
        const existing = await c.env.KV_USERS?.get(idempotencyKey);
        if (existing) {
          const cachedResult = JSON.parse(existing);
          return c.json(cachedResult, 200);
        }
      }
      
      const newBalance = await creditsManager.addCredits(userId, amount);
      
      const result = {
        ok: true,
        message: 'Credits added successfully',
        userId,
        amount,
        newBalance,
        reason: reason || 'Admin credit addition',
        timestamp: new Date().toISOString(),
        requestId: clientRequestId || `req_${Date.now()}`
      };
      
      if (clientRequestId) {
        const idempotencyKey = `idempotency:credits:add:${clientRequestId}`;
        await c.env.KV_USERS?.put(idempotencyKey, JSON.stringify(result), { expirationTtl: 3600 });
      }
      
      return c.json(result, 200);
    } catch (error) {
      log('credits_add', 'Failed to add credits', { error: (error as Error).message });
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'credits_add_failed',
        'Failed to add credits',
        { error: (error as Error).message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    }
  });

  // Get user credit balance
  app.get('/credits/balance', async c => {
    try {
      const authResult = await validateUserAuth(c, authValidator);
      if (!authResult.success) {
        return c.json(authResult.error, 401, { 'WWW-Authenticate': 'Bearer' });
      }
      
      const userId = authResult.payload.sub;
      
      const balance = await creditsManager.getCredits(userId);
      
      return c.json({
        ok: true,
        userId,
        balance,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      log('credits_balance', 'Failed to get balance', { error: (error as Error).message });
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'balance_check_failed',
        'Failed to retrieve balance',
        { error: (error as Error).message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    }
  });

  // Vend short-lived service token
  app.post('/vend-token', zValidator('json', VendTokenSchema), async c => {
    try {
      const authResult = await validateUserAuth(c, authValidator);
      if (!authResult.success) {
        return c.json(authResult.error, 401, { 'WWW-Authenticate': 'Bearer' });
      }
      
      const userId = authResult.payload.sub;
      
      // Rate limiting
      const rateLimitKey = `rate_limit:${userId}`;
      const rateLimitData = await c.env.KV_USERS?.get(rateLimitKey);
      if (rateLimitData) {
        const { count, resetTime } = JSON.parse(rateLimitData);
        if (Date.now() < resetTime && count >= 10) {
          const build = buildInfo(c.env);
          const errorResponse = createErrorResponse(
            'rate_limit_exceeded',
            'Rate limit exceeded',
            { limit: 10, resetTime: new Date(resetTime).toISOString() },
            build,
            'Please wait before making another request'
          );
          return c.json(errorResponse, 429);
        }
      }
      
      const { clientRequestId } = await c.req.json();
      
      // Idempotency check
      if (clientRequestId) {
        const idempotencyKey = `idempotency:token:${clientRequestId}`;
        const existing = await c.env.KV_USERS?.get(idempotencyKey);
        if (existing) {
          const cachedResult = JSON.parse(existing);
          return c.json(cachedResult, 200);
        }
      }
      
      // Check credits and deduct
      const creditResult = await creditsManager.spendCreditAtomic(userId, requestId, '/v1/vend-token');
      if (!creditResult.success) {
        const build = buildInfo(c.env);
        const errorResponse = createErrorResponse(
          'insufficient_credits',
          'Insufficient credits',
          { balance: creditResult.balanceAfter, required: 1 },
          build,
          'Add credits to your account to continue'
        );
        return c.json(errorResponse, 402);
      }
      
      // Generate short-lived service token
      const shortLivedToken = await authValidator.generateShortLivedToken({
        sub: userId,
        scope: 'ttt:transcribe',
        exp: Math.floor(Date.now() / 1000) + 900 // 15 minutes
      });
      
      const requestId = clientRequestId || `req_${Date.now()}`;
      const response = {
        ok: true,
        token: shortLivedToken,
        expiresIn: 900,
        balanceAfter: creditResult.balanceAfter,
        requestId
      };
      
      // Store for idempotency
      if (clientRequestId) {
        const idempotencyKey = `idempotency:token:${clientRequestId}`;
        await c.env.KV_USERS?.put(idempotencyKey, JSON.stringify(response), { expirationTtl: 3600 });
      }
      
      // Update rate limit
      const newCount = rateLimitData ? JSON.parse(rateLimitData).count + 1 : 1;
      await c.env.KV_USERS?.put(rateLimitKey, JSON.stringify({ 
        count: newCount, 
        resetTime: Date.now() + 3600000 // 1 hour
      }), { expirationTtl: 3600 });
      
      return c.json(response);
    } catch (error) {
      log('vend_token', 'Failed to vend token', { error: (error as Error).message });
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'token_vending_failed',
        'Failed to vend token',
        { error: (error as Error).message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    }
  });

  // Legacy endpoint for Android compatibility
  app.post('/user/balance', async c => {
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
      const payload = await authValidator.verifyToken(token, false);
      const userId = payload.sub;
      
      const balance = await creditsManager.getCredits(userId);
      
      return c.json({
        ok: true,
        userId,
        balance,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      log('user_balance', 'Failed to get balance', { error: (error as Error).message });
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'balance_check_failed',
        'Failed to retrieve balance',
        { error: (error as Error).message },
        build,
        'Please try again or contact support if the issue persists'
      );
      return c.json(errorResponse, 500);
    }
  });
}
