import { Hono } from 'hono';
import type { Bindings } from '../types';
import { validateUserId, validateAmount, safeParseInt } from '../helpers/Pluct-Core-Validation-Utilities';
import { ERROR_MESSAGES } from '../helpers/Pluct-Core-Constants-Configuration';
import { logError } from '../helpers/Pluct-Core-Logging-Utilities';
import { getUserBalance, updateUserBalance, createTransaction } from '../helpers/Pluct-Core-Database-Operations';

const credits = new Hono<{ Bindings: Bindings }>();

// Add credits via webhook
credits.post('/add-credits', async (c) => {
  let userId: string | undefined;
  try {
    if (c.req.header('x-webhook-secret') !== c.env.WEBHOOK_SECRET) {
      return c.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, 401);
    }

    const { userId: requestUserId, amount } = await c.req.json<{ userId: string; amount: number }>();
    userId = requestUserId;

    // Enhanced input validation
    if (!validateUserId(userId)) {
      return c.json({ error: ERROR_MESSAGES.INVALID_USER_ID }, 400);
    }
    
    if (!validateAmount(amount)) {
      return c.json({ error: ERROR_MESSAGES.INVALID_AMOUNT }, 400);
    }

    const currentCredits = await getUserBalance(c.env.PLUCT_KV, userId);
    const newCredits = currentCredits + amount;

    await createTransaction(c.env.DB, userId, 'add_webhook', amount, 'Payment gateway');
    await updateUserBalance(c.env.PLUCT_KV, userId, newCredits);

    return c.json({ success: true, newBalance: newCredits });
  } catch (error) {
    logError('add_credits', error, userId);
    return c.json({ error: ERROR_MESSAGES.INTERNAL_ERROR }, 500);
  }
});

export default credits;
