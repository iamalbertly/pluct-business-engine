export interface Env {
  KV_USERS: any;
}

export class PluctRateLimiter {
  constructor(private env: Env) {}

  async checkRateLimit(key: string, limit: number = 100, windowSeconds: number = 60): Promise<boolean> {
    try {
      const rateLimitKey = `rate_limit:${key}`;
      const current = await this.env.KV_USERS.get(rateLimitKey);
      if (!current) {
        await this.env.KV_USERS.put(rateLimitKey, '1', { expirationTtl: windowSeconds });
        return true;
      }
      const count = parseInt(current, 10);
      if (count >= limit) return false;
      await this.env.KV_USERS.put(rateLimitKey, String(count + 1), { expirationTtl: windowSeconds });
      return true;
    } catch (error) {
      // If rate limiting fails, allow the request to proceed
      // This prevents rate limiting from blocking legitimate requests
      console.log(`be:rate_limit msg=Rate limiting check failed, allowing request metadata=${JSON.stringify({ error: (error as Error).message, key })}`);
      return true;
    }
  }

  async checkRateLimitPerUserAndIP(userId: string, ip: string): Promise<boolean> {
    const userLimit = await this.checkRateLimit(`user:${userId}`, 50, 60); // 50 requests per minute per user
    const ipLimit = await this.checkRateLimit(`ip:${ip}`, 200, 60); // 200 requests per minute per IP
    
    return userLimit && ipLimit;
  }
}
