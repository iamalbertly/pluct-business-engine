// Authentication utilities
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { Context } from 'hono';
import { Env } from './Pluct-Core-Interfaces-01Types';
import { resolveConfig, buildInfo } from './Pluct-Core-Utilities-01Helpers';
import { createErrorResponse } from './Pluct-Core-Utilities-02ErrorHandling';

export interface AuthResult {
  isAuthenticated: boolean;
  authMethod: string;
  error?: any;
}

export async function validateAdminAuth(c: Context<{ Bindings: Env }>): Promise<AuthResult> {
  const adminKey = c.req.header('X-API-Key');
  const authHeader = c.req.header('Authorization');
  const resolvedConfig = resolveConfig(c.env);
  
  let isAuthenticated = false;
  let authMethod = '';
  
  if (adminKey && adminKey === resolvedConfig.ENGINE_ADMIN_KEY) {
    isAuthenticated = true;
    authMethod = 'X-API-Key';
  } else if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === resolvedConfig.ENGINE_ADMIN_KEY) {
    isAuthenticated = true;
    authMethod = 'Authorization Bearer';
  }
  
  if (!isAuthenticated) {
    const build = buildInfo(c.env);
    const errorResponse = createErrorResponse(
      'unauthorized',
      'Missing or invalid admin authentication',
      { providedAuth: { hasApiKey: !!adminKey, hasAuthHeader: !!authHeader, authMethod: authMethod || 'none' } },
      build,
      'Provide valid X-API-Key or Authorization Bearer header'
    );
    return { isAuthenticated: false, authMethod: authMethod || 'none', error: errorResponse };
  }
  
  return { isAuthenticated: true, authMethod };
}

export async function validateUserAuth(c: Context<{ Bindings: Env }>, authValidator: any): Promise<{ success: boolean; payload?: any; error?: any }> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    const build = buildInfo(c.env);
    const errorResponse = createErrorResponse(
      'unauthorized',
      'Authorization header required',
      { providedAuth: !!auth },
      build,
      'Provide valid Authorization Bearer token'
    );
    return { success: false, error: errorResponse };
  }
  
  try {
    const token = auth.slice(7);
    const payload = await authValidator.verifyToken(token, false);
    return { success: true, payload };
  } catch (error) {
    const build = buildInfo(c.env);
    const errorResponse = createErrorResponse(
      'unauthorized',
      'Invalid or expired token',
      { error: (error as Error).message },
      build,
      'Provide a valid authentication token'
    );
    return { success: false, error: errorResponse };
  }
}

export async function validateServiceToken(c: Context<{ Bindings: Env }>, authValidator: any): Promise<{ success: boolean; payload?: any; error?: any }> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    const build = buildInfo(c.env);
    const errorResponse = createErrorResponse(
      'unauthorized',
      'Authorization header required',
      { providedAuth: !!auth },
      build,
      'Provide valid Authorization Bearer token'
    );
    return { success: false, error: errorResponse };
  }
  
  try {
    const token = auth.slice(7);
    const payload = await authValidator.verifyToken(token, true);
    
    if (payload.scope !== 'ttt:transcribe') {
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'forbidden',
        'Insufficient scope',
        { requiredScope: 'ttt:transcribe', providedScope: payload.scope },
        build,
        'Token must have ttt:transcribe scope'
      );
      return { success: false, error: errorResponse };
    }
    
    return { success: true, payload };
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('JWS') || errorMessage.includes('JWT') || errorMessage.includes('signature') || errorMessage.includes('invalid_scope')) {
      const build = buildInfo(c.env);
      const errorResponse = createErrorResponse(
        'unauthorized',
        'Invalid or expired token',
        { error: errorMessage },
        build,
        'Provide a valid authentication token'
      );
      return { success: false, error: errorResponse };
    }
    
    const build = buildInfo(c.env);
    const errorResponse = createErrorResponse(
      'unauthorized',
      'Token validation failed',
      { error: errorMessage },
      build,
      'Provide a valid authentication token'
    );
    return { success: false, error: errorResponse };
  }
}
