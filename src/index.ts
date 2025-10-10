import { Hono } from 'hono';
import { SignJWT } from 'jose'; // CORRECTED IMPORT

// Define the structure of our environment variables for type safety.
// This tells TypeScript what `env` will contain.
export type Bindings = {
  PLUCT_KV: KVNamespace;
  JWT_SECRET: string;
  WEBHOOK_SECRET: string;
};

// Initialize our application router.
const app = new Hono<{ Bindings: Bindings }>();

/**
 * Endpoint to vend a single-use JWT for a premium API call.
 * The mobile app will call this endpoint before it calls the premium backend.
 * POST /vend-token
 * Body: { "userId": "some-unique-user-id" }
 */
app.post('/vend-token', async (c) => {
  const { userId } = await c.req.json<{ userId: string }>();

  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  // Get the user's current credit balance from our KV database.
  const creditsStr = await c.env.PLUCT_KV.get(userId);
  const credits = creditsStr ? parseInt(creditsStr, 10) : 0;

  if (credits <= 0) {
    return c.json({ error: 'Insufficient credits' }, 403);
  }

  // Decrement the user's credit balance.
  await c.env.PLUCT_KV.put(userId, (credits - 1).toString());

  // Create a short-lived (60 seconds) JSON Web Token (JWT).
  const payload = {
    sub: userId,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  
  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  
  // CORRECTED SIGNING CALL (removed 'jose.')
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);

  return c.json({ token: jwt });
});

/**
 * Webhook endpoint for the payment provider (e.g., M-Pesa).
 * The payment provider will call this after a successful transaction.
 * POST /add-credits
 * Headers: { "x-webhook-secret": "our-secret-string" }
 * Body: { "userId": "some-unique-user-id", "amount": 10 }
 */
app.post('/add-credits', async (c) => {
  const providedSecret = c.req.header('x-webhook-secret');
  if (providedSecret !== c.env.WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { userId, amount } = await c.req.json<{ userId: string; amount: number }>();

  if (!userId || !amount || amount <= 0) {
    return c.json({ error: 'User ID and positive amount are required' }, 400);
  }

  const currentCreditsStr = await c.env.PLUCT_KV.get(userId);
  const currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;
  const newCredits = currentCredits + amount;

  await c.env.PLUCT_KV.put(userId, newCredits.toString());

  console.log(`Credited user ${userId} with ${amount} credits. New balance: ${newCredits}`);
  return c.json({ success: true, newBalance: newCredits });
});

export default app;