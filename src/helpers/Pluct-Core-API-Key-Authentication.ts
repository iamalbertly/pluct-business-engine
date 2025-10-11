import { hashApiKey } from './Pluct-Core-JWT-Authentication';
import { logError } from './Pluct-Core-Logging-Utilities';

// API Key authentication middleware
export const apiKeyAuth = async (c: any, next: any) => {
  try {
    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) {
      return c.json({ error: 'API Key is required' }, 401);
    }

    // Hash the provided API key
    const keyHash = await hashApiKey(apiKey);

    // Check if the hashed key exists and is active
    const keyRecord = await c.env.DB.prepare(
      'SELECT status FROM api_keys WHERE key_hash = ?'
    ).bind(keyHash).first<{ status: string }>();

    if (!keyRecord || keyRecord.status !== 'active') {
      return c.json({ error: 'Invalid or revoked API Key' }, 403);
    }
    
    // API key is valid, continue to the next middleware/route
    await next();
  } catch (error) {
    logError('api_key_auth', error);
    return c.json({ error: 'API Key authentication failed' }, 500);
  }
};
