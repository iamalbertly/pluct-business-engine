import { SignJWT, jwtVerify } from 'jose';

export interface TokenPayload {
  sub: string;
  scope: string;
  iat: number;
  exp: number;
}

export interface Env {
  ENGINE_JWT_SECRET: string;
}

export class PluctAuthValidator {
  constructor(private env: Env) {}

  async verifyToken(token: string, requireScope: boolean = true): Promise<TokenPayload> {
    try {
      console.log('🔧 JWT Verification Debug:', { 
        hasSecret: !!this.env.ENGINE_JWT_SECRET,
        secretLength: this.env.ENGINE_JWT_SECRET?.length,
        tokenLength: token.length,
        requireScope
      });
      
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(this.env.ENGINE_JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      
      const { payload } = await jwtVerify(token, key);
      console.log('🔧 JWT Payload:', { 
        sub: payload.sub, 
        scope: payload.scope, 
        exp: payload.exp,
        iat: payload.iat 
      });
      
      if (requireScope && payload.scope !== 'ttt:transcribe') {
        throw new Error('invalid_scope');
      }
      
      return payload as unknown as TokenPayload;
    } catch (error) {
      console.log('🔧 JWT Verification Error:', { 
        error: (error as Error).message,
        tokenStart: token.substring(0, 20) + '...'
      });
      throw error;
    }
  }
  
  async generateShortLivedToken(payload: any): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.env.ENGINE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .setIssuedAt()
      .sign(key);
  }
}
