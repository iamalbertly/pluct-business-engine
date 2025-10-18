export interface Env {
  DB: D1Database;
  KV_USERS: any;
}

export interface CreditResult {
  success: boolean;
  balanceAfter: number;
}

export class PluctCreditsManager {
  constructor(private env: Env) {}

  async getCredits(userId: string): Promise<number> {
    try {
      console.log('🔧 D1 Query Debug:', { userId, hasDB: !!this.env.DB });
      
      const result = await this.env.DB.prepare('SELECT balance FROM credits WHERE user_id = ?').bind(userId).first();
      console.log('🔧 D1 Query Result:', { result, balance: result?.balance });
      
      if (!result) {
        // User doesn't exist, create them with 0 balance
        console.log('🔧 Creating new user:', userId);
        await this.env.DB.prepare('INSERT INTO credits (user_id, balance) VALUES (?, 0)').bind(userId).run();
        return 0;
      }
      
      return result.balance as number;
    } catch (error) {
      console.log(`be:credits msg=Failed to get credits from D1, falling back to KV metadata=${JSON.stringify({ error: (error as Error).message, userId })}`);
      const v = await this.env.KV_USERS.get(`credits:${userId}`);
      console.log('🔧 KV Fallback:', { kvValue: v, parsed: parseInt(v || '0', 10) });
      return parseInt(v || '0', 10);
    }
  }
  
  async addCredits(userId: string, amount: number): Promise<void> {
    try {
      await this.env.DB.prepare(`
        INSERT INTO credits (user_id, balance) 
        VALUES (?, ?) 
        ON CONFLICT(user_id) DO UPDATE SET 
          balance = balance + ?, 
          updated_at = CURRENT_TIMESTAMP
      `).bind(userId, amount, amount).run();
    } catch (error) {
      console.log(`be:credits msg=Failed to add credits in D1, falling back to KV metadata=${JSON.stringify({ error: (error as Error).message, userId, amount })}`);
      const cur = await this.getCredits(userId);
      await this.env.KV_USERS.put(`credits:${userId}`, String(cur + amount));
    }
  }
  
  async spendCreditAtomic(userId: string, requestId: string, route: string, ip?: string, userAgent?: string): Promise<CreditResult> {
    try {
      // Use D1 transaction for atomic credit deduction
      await this.env.DB.batch([
        this.env.DB.prepare('SELECT balance FROM credits WHERE user_id = ? FOR UPDATE').bind(userId),
        this.env.DB.prepare(`
          UPDATE credits 
          SET balance = balance - 1, updated_at = CURRENT_TIMESTAMP 
          WHERE user_id = ? AND balance > 0
        `).bind(userId),
        this.env.DB.prepare(`
          INSERT INTO audits (user_id, request_id, action, route, status, credit_delta, balance_after, ip, user_agent)
          VALUES (?, ?, 'vend-token', ?, 200, -1, (SELECT balance FROM credits WHERE user_id = ?), ?, ?)
        `).bind(userId, requestId, route, userId, ip || 'unknown', userAgent || 'unknown')
      ]);
      
      const balanceResult = await this.env.DB.prepare('SELECT balance FROM credits WHERE user_id = ?').bind(userId).first();
      const balanceAfter = balanceResult ? (balanceResult.balance as number) : 0;
      
      return { success: balanceAfter >= 0, balanceAfter };
    } catch (error) {
      console.log(`be:credits msg=Atomic credit deduction failed, falling back to KV metadata=${JSON.stringify({ error: (error as Error).message, userId })}`);
      // Fallback to KV
      const cur = await this.getCredits(userId);
      if (cur <= 0) {
        return { success: false, balanceAfter: cur };
      }
      const newBalance = cur - 1;
      await this.env.KV_USERS.put(`credits:${userId}`, String(newBalance));
      return { success: true, balanceAfter: newBalance };
    }
  }
}
