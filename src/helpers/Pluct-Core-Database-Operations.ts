import { safeParseInt } from './Pluct-Core-Validation-Utilities';

// Database transaction helpers
export const createTransaction = async (
  db: D1Database, 
  userId: string, 
  type: string, 
  amount: number, 
  reason?: string
) => {
  const transactionId = crypto.randomUUID();
  const stmt = db.prepare(
    'INSERT INTO transactions (id, user_id, type, amount, timestamp, reason) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(transactionId, userId, type, amount, new Date().toISOString(), reason || '');
  
  return stmt.run();
};

// Get user balance from KV
export const getUserBalance = async (kv: KVNamespace, userId: string): Promise<number> => {
  const creditsStr = await kv.get(`user:${userId}`);
  return safeParseInt(creditsStr);
};

// Update user balance in KV
export const updateUserBalance = async (kv: KVNamespace, userId: string, newBalance: number) => {
  return kv.put(`user:${userId}`, newBalance.toString());
};
