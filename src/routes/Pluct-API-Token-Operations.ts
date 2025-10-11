import { Hono } from 'hono';
import type { Bindings } from '../types';
import { validateUserId, safeParseInt } from '../helpers/Pluct-Core-Validation-Utilities';
import { ERROR_MESSAGES } from '../helpers/Pluct-Core-Constants-Configuration';
import { logError } from '../helpers/Pluct-Core-Logging-Utilities';
import { getUserBalance, updateUserBalance, createTransaction } from '../helpers/Pluct-Core-Database-Operations';
import { generateToken, validateToken } from '../helpers/Pluct-Core-JWT-Authentication';

const token = new Hono<{ Bindings: Bindings }>();

// Token validation endpoint
token.post('/validate-token', async (c) => {
  try {
    const { token } = await c.req.json<{ token: string }>();
    
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return c.json({ error: ERROR_MESSAGES.INVALID_TOKEN }, 400);
    }

    const result = await validateToken(token, c.env.JWT_SECRET);
    
    if (result.valid) {
      return c.json(result);
    } else {
      return c.json({ valid: false, reason: result.reason });
    }
  } catch (error) {
    logError('token_validation', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Token vending endpoint
token.post('/vend-token', async (c) => {
  let userId: string | undefined;
  try {
    const { userId: requestUserId } = await c.req.json<{ userId: string }>();
    userId = requestUserId;

    // Input validation
    if (!validateUserId(userId)) {
      return c.json({ error: 'Valid user ID is required' }, 400);
    }

    const credits = await getUserBalance(c.env.PLUCT_KV, userId);

    if (credits <= 0) {
      return c.json({ error: ERROR_MESSAGES.INSUFFICIENT_CREDITS }, 403);
    }

    const newCredits = credits - 1;
  
    // Create the transaction statement for D1
    await createTransaction(c.env.DB, userId, 'spend', 1);

    // Update balance
    await updateUserBalance(c.env.PLUCT_KV, userId, newCredits);

    // Generate JWT token
    const jwt = await generateToken(userId, c.env.JWT_SECRET);

    return c.json({ token: jwt });
  } catch (error) {
    logError('vend_token', error, userId);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_ERROR }, 500);
  }
});

export default token;
