import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import type { Bindings } from '../types';
import { validateUserId, validateAmount, safeParseInt } from '../helpers/Pluct-Core-Validation-Utilities';
import { ERROR_MESSAGES } from '../helpers/Pluct-Core-Constants-Configuration';
import { logError } from '../helpers/Pluct-Core-Logging-Utilities';
import { getUserBalance, updateUserBalance, createTransaction } from '../helpers/Pluct-Core-Database-Operations';
import { hashApiKey } from '../helpers/Pluct-Core-JWT-Authentication';

const admin = new Hono<{ Bindings: Bindings }>();

// This middleware protects ALL routes defined under `admin`
admin.use('*', (c, next) => {
  const auth = bearerAuth({ token: c.env.ADMIN_SECRET });
  return auth(c, next);
});

admin.get('/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT user_id, COUNT(*) as transaction_count, SUM(CASE WHEN type LIKE '%spend%' THEN amount ELSE 0 END) as total_spent
       FROM transactions
       GROUP BY user_id
       ORDER BY MAX(timestamp) DESC`
    ).all();

    const userKeys = (await c.env.PLUCT_KV.list({ prefix: 'user:' })).keys;
    const userCredits = await Promise.all(userKeys.map(async (key) => {
        const credits = await c.env.PLUCT_KV.get(key.name);
        return { user_id: key.name.replace('user:', ''), credits: parseInt(credits || '0') };
    }));

    // Simple join in memory for the demo
    const userMap = new Map(userCredits.map(u => [u.user_id, u.credits]));
    const combinedResults = (results as { user_id: string; transaction_count: number; total_spent: number }[]).map((row) => ({
        ...row,
        current_credits: userMap.get(row.user_id) || 0
    }));

    return c.json(combinedResults);
  } catch (error) {
    logError('admin_users', error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_ERROR }, 500);
  }
});

admin.get('/transactions', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 100').all();
    return c.json(results);
  } catch (error) {
    logError('admin_transactions', error);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_ERROR }, 500);
  }
});

admin.post('/credits/add', async (c) => {
  let userId: string | undefined;
  try {
    const { userId: requestUserId, amount, reason } = await c.req.json<{ userId: string; amount: number; reason: string }>();
    userId = requestUserId;
    
    // Enhanced input validation
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return c.json({ error: 'Valid user ID is required' }, 400);
    }
    
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000) {
        return c.json({ error: 'Valid amount between 1 and 10000 is required' }, 400);
    }

    const currentCredits = await getUserBalance(c.env.PLUCT_KV, userId);
    const newCredits = currentCredits + amount;
    
    await createTransaction(c.env.DB, userId, 'admin_add', amount, reason || 'Manual credit addition by admin');
    await updateUserBalance(c.env.PLUCT_KV, userId, newCredits);
    
    return c.json({ 
      success: true, 
      newBalance: newCredits,
        message: `Manually added ${amount} credits to ${userId}` 
    });
  } catch (error) {
    logError('admin_credits_add', error, userId);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_ERROR }, 500);
  }
});

// API Key Management Endpoints
admin.post('/api-keys/create', async (c) => {
  try {
    const { description } = await c.req.json<{ description: string }>();
    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    // 1. Generate a new key. We will only show this to the admin ONCE.
    const apiKey = `pluct_api_${crypto.randomUUID().replaceAll('-', '')}`;
    
    // 2. Hash the key for storage.
    const keyHash = await hashApiKey(apiKey);

    // 3. Store the HASH in the database, never the raw key.
    await c.env.DB.prepare(
      'INSERT INTO api_keys (id, key_hash, description, created_at) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), keyHash, description, new Date().toISOString()).run();

    // 4. Return the raw key to the admin to be copied and stored securely.
    return c.json({
      message: "API Key created successfully. This is the only time you will see the key. Store it securely.",
      apiKey: apiKey,
    });

  } catch (error) {
    logError('admin_create_api_key', error);
    return c.json({ error: 'Failed to create API key' }, 500);
  }
});

admin.get('/api-keys', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, description, created_at, status FROM api_keys ORDER BY created_at DESC'
    ).all();

    return c.json(results);
  } catch (error) {
    logError('admin_list_api_keys', error);
    return c.json({ error: 'Failed to retrieve API keys' }, 500);
  }
});

admin.post('/api-keys/:id/revoke', async (c) => {
  try {
    const id = c.req.param('id');
    
    await c.env.DB.prepare(
      'UPDATE api_keys SET status = ? WHERE id = ?'
    ).bind('revoked', id).run();

    return c.json({ message: 'API key revoked successfully' });
  } catch (error) {
    logError('admin_revoke_api_key', error);
    return c.json({ error: 'Failed to revoke API key' }, 500);
  }
});

export default admin;
