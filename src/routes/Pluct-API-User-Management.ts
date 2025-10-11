import { Hono } from 'hono';
import type { Bindings } from '../types';
import { validateUserId, validateAmount, safeParseInt } from '../helpers/Pluct-Core-Validation-Utilities';
import { ERROR_MESSAGES, DEFAULT_TRANSACTION_LIMIT, MAX_TRANSACTION_LIMIT } from '../helpers/Pluct-Core-Constants-Configuration';
import { logError } from '../helpers/Pluct-Core-Logging-Utilities';
import { getUserBalance, updateUserBalance, createTransaction } from '../helpers/Pluct-Core-Database-Operations';

const user = new Hono<{ Bindings: Bindings }>();

// User balance check endpoint
user.get('/user/:userId/balance', async (c) => {
  const userId = c.req.param('userId');
  try {
    if (!validateUserId(userId)) {
      return c.json({ error: ERROR_MESSAGES.INVALID_USER_ID }, 400);
    }

    const credits = await getUserBalance(c.env.PLUCT_KV, userId);

    return c.json({ 
      userId, 
      balance: credits,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logError('user_balance', error, userId);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// User transaction history endpoint
user.get('/user/:userId/transactions', async (c) => {
  const userId = c.req.param('userId');
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || DEFAULT_TRANSACTION_LIMIT.toString()), MAX_TRANSACTION_LIMIT);
    
    if (!validateUserId(userId)) {
      return c.json({ error: ERROR_MESSAGES.INVALID_USER_ID }, 400);
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).bind(userId, limit).all();

    return c.json({ 
      userId, 
      transactions: results,
      count: results.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logError('user_transactions', error, userId);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// User creation endpoint
user.post('/user/create', async (c) => {
  let userId: string | undefined;
  try {
    const { userId: requestUserId, initialCredits = 0 } = await c.req.json<{ userId: string; initialCredits?: number }>();
    userId = requestUserId;
    
    if (!validateUserId(userId)) {
      return c.json({ error: ERROR_MESSAGES.INVALID_USER_ID }, 400);
    }

    // Check if user already exists
    const existingCredits = await c.env.PLUCT_KV.get(`user:${userId}`);
    if (existingCredits !== null) {
      return c.json({ error: ERROR_MESSAGES.USER_EXISTS }, 409);
    }

    // Create user with initial credits
    await updateUserBalance(c.env.PLUCT_KV, userId, initialCredits);

    // Log the creation transaction
    if (initialCredits > 0) {
      await createTransaction(c.env.DB, userId, 'user_creation', initialCredits, 'User account creation');
    }

    return c.json({ 
      success: true, 
      userId, 
      initialBalance: initialCredits,
      message: 'User created successfully'
    });
  } catch (error) {
    logError('user_creation', error, userId);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_ERROR }, 500);
  }
});

export default user;
