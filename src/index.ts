import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { SignJWT } from 'jose';

// Define the environment bindings, including our new D1 database
export type Bindings = {
  DB: D1Database;
  PLUCT_KV: KVNamespace;
  JWT_SECRET: string;
  WEBHOOK_SECRET: string;
  ADMIN_SECRET: string; // For securing admin endpoints
};

const app = new Hono<{ Bindings: Bindings }>();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      'POST /vend-token': 'Vend JWT token (requires credits)',
      'POST /add-credits': 'Add credits (requires webhook secret)',
      'GET /admin/users': 'Get user data (requires admin token)',
      'GET /admin/transactions': 'Get transactions (requires admin token)',
      'POST /admin/credits/add': 'Add credits via admin (requires admin token)'
    }
  });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({ 
    message: 'Pluct Business Engine API',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /vend-token': 'Vend JWT token',
      'POST /add-credits': 'Add credits',
      'GET /admin/*': 'Admin endpoints'
    }
  });
});

// --- CORE BUSINESS LOGIC ---

app.post('/vend-token', async (c) => {
  try {
    const { userId } = await c.req.json<{ userId: string }>();
    
    // Input validation
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return c.json({ error: 'Valid user ID is required' }, 400);
    }

    const creditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
    const credits = creditsStr ? parseInt(creditsStr, 10) : 0;
    
    if (credits <= 0) {
      return c.json({ error: 'Insufficient credits' }, 403);
    }

    const newCredits = credits - 1;
    
    // Create the transaction statement for D1
    const transactionId = crypto.randomUUID();
    const stmt = c.env.DB.prepare(
      'INSERT INTO transactions (id, user_id, type, amount, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).bind(transactionId, userId, 'spend', 1, new Date().toISOString());

    // Perform KV update and DB insert in parallel with error handling
    await Promise.all([
      c.env.PLUCT_KV.put(`user:${userId}`, newCredits.toString()),
      stmt.run()
    ]);

    const payload = { 
      sub: userId, 
      jti: crypto.randomUUID(), 
      exp: Math.floor(Date.now() / 1000) + 60 
    };
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const jwt = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(secret);

    return c.json({ token: jwt });
  } catch (error) {
    console.error('Error in vend-token:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/add-credits', async (c) => {
  try {
    if (c.req.header('x-webhook-secret') !== c.env.WEBHOOK_SECRET) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { userId, amount } = await c.req.json<{ userId: string; amount: number }>();
    
    // Enhanced input validation
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return c.json({ error: 'Valid user ID is required' }, 400);
    }
    
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000) {
      return c.json({ error: 'Valid amount between 1 and 10000 is required' }, 400);
    }

    const currentCreditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
    const currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;
    const newCredits = currentCredits + amount;
    
    const transactionId = crypto.randomUUID();
    const stmt = c.env.DB.prepare(
      'INSERT INTO transactions (id, user_id, type, amount, timestamp, reason) VALUES (?, ?, ?, ?, ?)'
    ).bind(transactionId, userId, 'add_webhook', amount, new Date().toISOString(), 'Payment gateway');

    await Promise.all([
        c.env.PLUCT_KV.put(`user:${userId}`, newCredits.toString()),
        stmt.run()
    ]);

    return c.json({ success: true, newBalance: newCredits });
  } catch (error) {
    console.error('Error in add-credits:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});


// --- SECURE ADMIN ENDPOINTS ---
// Your control panel is NOT a UI. It is a secure API you access with tools like Postman or curl.
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
    const combinedResults = results.map((row: any) => ({
        ...row,
        current_credits: userMap.get(row.user_id) || 0
    }));

    return c.json(combinedResults);
  } catch (error) {
    console.error('Error in admin/users:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

admin.get('/transactions', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 100').all();
    return c.json(results);
  } catch (error) {
    console.error('Error in admin/transactions:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

admin.post('/credits/add', async (c) => {
  try {
    const { userId, amount, reason } = await c.req.json<{ userId: string; amount: number; reason: string }>();
    
    // Enhanced input validation
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return c.json({ error: 'Valid user ID is required' }, 400);
    }
    
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000) {
        return c.json({ error: 'Valid amount between 1 and 10000 is required' }, 400);
    }

    const currentCreditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
    const currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;
    const newCredits = currentCredits + amount;
    
    const transactionId = crypto.randomUUID();
    const stmt = c.env.DB.prepare(
        'INSERT INTO transactions (id, user_id, type, amount, timestamp, reason) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(transactionId, userId, 'admin_add', amount, new Date().toISOString(), reason || 'Manual credit addition by admin');

    await Promise.all([
        c.env.PLUCT_KV.put(`user:${userId}`, newCredits.toString()),
        stmt.run()
    ]);

    return c.json({ 
        success: true, 
        newBalance: newCredits,
        message: `Manually added ${amount} credits to ${userId}` 
    });
  } catch (error) {
    console.error('Error in admin/credits/add:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Mount the secure admin API under the /admin path
app.route('/admin', admin);

export default app;