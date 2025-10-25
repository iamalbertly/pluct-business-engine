// Error handling utilities for Pluct Business Engine
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { ErrorResponse, BuildInfo } from './Pluct-Core-Interfaces-01Types';
import { buildInfo } from './Pluct-Core-Utilities-01Helpers';

// Global error response helper
export function createErrorResponse(
  code: string, 
  message: string, 
  details?: Record<string, any>,
  build?: BuildInfo,
  guidance?: string | null
): ErrorResponse {
  return {
    ok: false,
    code,
    message,
    details,
    build,
    guidance
  };
}

// Zod error handler for meta endpoints
export function handleMetaZodError(c: any, error: any) {
  const build = buildInfo(c.env);
  const errorResponse = createErrorResponse(
    'invalid_body',
    'Invalid query parameters',
    { errors: error.errors },
    build,
    'Provide a valid TikTok URL'
  );
  return c.json(errorResponse, 422);
}

// JWT error handler
export function handleJWTError(c: any, error: any) {
  const build = buildInfo(c.env);
  const errorMessage = (error as Error).message;
  
  if (errorMessage.includes('JWS') || errorMessage.includes('JWT') || errorMessage.includes('signature') || errorMessage.includes('invalid_scope')) {
    const errorResponse = createErrorResponse(
      'unauthorized',
      'Invalid or expired token',
      { error: errorMessage },
      build,
      'Provide a valid authentication token'
    );
    return c.json(errorResponse, 401, {
      'WWW-Authenticate': 'Bearer'
    });
  }
  
  const errorResponse = createErrorResponse(
    'authentication_failed',
    'Authentication failed',
    { error: errorMessage },
    build,
    'Please try again or contact support if the issue persists'
  );
  return c.json(errorResponse, 500);
}
