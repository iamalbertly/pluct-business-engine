import { SignJWT } from 'jose';

export async function vendToken(env: any, userId: string) {
  const sec = await crypto.subtle.importKey(
    'raw', 
    new TextEncoder().encode(env.ENGINE_JWT_SECRET), 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  
  const token = await new SignJWT({ sub: userId, scope: 'ttt:transcribe' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .setIssuedAt()
    .sign(sec);
    
  return token;
}
