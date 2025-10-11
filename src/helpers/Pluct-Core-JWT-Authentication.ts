import { SignJWT, jwtVerify } from 'jose';
import { JWT_EXPIRATION_SECONDS } from './Pluct-Core-Constants-Configuration';

// JWT token generation
export const generateToken = async (userId: string, jwtSecret: string): Promise<string> => {
  const payload = {
    sub: userId,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRATION_SECONDS 
  };
  const secret = new TextEncoder().encode(jwtSecret);
  return await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(secret);
};

// JWT token validation
export const validateToken = async (token: string, jwtSecret: string) => {
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, reason: 'Token expired' };
    }

    return {
      valid: true,
      userId: payload.sub,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
    };
  } catch (error) {
    return { valid: false, reason: 'Invalid token signature' };
  }
};

// API Key hashing for secure storage
export const hashApiKey = async (apiKey: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
