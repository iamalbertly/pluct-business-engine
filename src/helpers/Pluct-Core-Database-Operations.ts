import { safeParseInt } from './Pluct-Core-Validation-Utilities';

// Database transaction helpers
export const createTransaction = async (
  db: D1Database,
  userId: string,
  type: string,
  amount: number,
  reason?: string
) => {
  try {
    const transactionId = crypto.randomUUID();
    const stmt = db.prepare(
      'INSERT INTO transactions (id, user_id, type, amount, timestamp, reason) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(transactionId, userId, type, amount, new Date().toISOString(), reason || '');

    const result = await stmt.run();
    
    if (!result.success) {
      throw new Error(`Database transaction failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error('createTransaction error:', error);
    throw new Error(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Get user balance from KV
export const getUserBalance = async (kv: KVNamespace, userId: string): Promise<number> => {
  try {
    const creditsStr = await kv.get(`user:${userId}`);
    return safeParseInt(creditsStr);
  } catch (error) {
    console.error('getUserBalance error:', error);
    return 0; // Return 0 if KV read fails
  }
};

// Update user balance in KV
export const updateUserBalance = async (kv: KVNamespace, userId: string, newBalance: number) => {
  try {
    const result = await kv.put(`user:${userId}`, newBalance.toString());
    if (!result) {
      throw new Error('KV put operation failed');
    }
    return result;
  } catch (error) {
    console.error('updateUserBalance error:', error);
    throw new Error(`Failed to update user balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
