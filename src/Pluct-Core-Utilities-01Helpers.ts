// Core utility functions for Pluct Business Engine
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

import { Env, EffectiveConfig, BuildInfo, ConfigurationDiagnostics } from './Pluct-Core-Interfaces-01Types';

// Environment configuration resolver with aliases
export function pickFirst(env: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

export function resolveConfig(env: any): EffectiveConfig {
  const config = {
    // Accept legacy names so existing Cloudflare secrets keep working:
    ENGINE_JWT_SECRET: pickFirst(env, ['ENGINE_JWT_SECRET', 'JWT_SECRET', 'ENGINE_SHARED_SECRET']),
    ENGINE_ADMIN_KEY: pickFirst(env, ['ENGINE_ADMIN_KEY', 'ADMIN_SECRET', 'ADMIN_API_KEY', 'ADMIN_KEY']),
    TTT_SHARED_SECRET: pickFirst(env, ['TTT_SHARED_SECRET', 'ENGINE_SHARED_SECRET']),
    TTT_BASE: pickFirst(env, ['TTT_BASE']),
    KV_USERS: env.KV_USERS,
    DB: env.DB
  };
  
  console.log('🔧 Secret Resolution Debug:');
  console.log('TTT_SHARED_SECRET sources:', {
    TTT_SHARED_SECRET: !!env.TTT_SHARED_SECRET,
    ENGINE_SHARED_SECRET: !!env.ENGINE_SHARED_SECRET,
    resolved: !!config.TTT_SHARED_SECRET
  });
  
  return config;
}

// Build information extractor
export function buildInfo(env: Env): BuildInfo {
  return {
    ref: env.BUILD_REF || 'unknown',
    deployedAt: env.BUILD_TIME || new Date().toISOString()
  };
}

// Configuration diagnostics
export function getConfigurationDiagnostics(env: any): ConfigurationDiagnostics {
  const cfg = resolveConfig(env);
  const configStatus = {
    ENGINE_JWT_SECRET: !!cfg.ENGINE_JWT_SECRET,
    ENGINE_ADMIN_KEY: !!cfg.ENGINE_ADMIN_KEY,
    TTT_SHARED_SECRET: !!cfg.TTT_SHARED_SECRET,
    TTT_BASE: !!cfg.TTT_BASE,
    KV_USERS: !!cfg.KV_USERS
  };
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!cfg.ENGINE_JWT_SECRET) errors.push('Missing ENGINE_JWT_SECRET');
  if (!cfg.ENGINE_ADMIN_KEY) errors.push('Missing ENGINE_ADMIN_KEY');
  if (!cfg.TTT_SHARED_SECRET) errors.push('Missing TTT_SHARED_SECRET');
  if (!cfg.TTT_BASE) errors.push('Missing TTT_BASE');
  if (!cfg.KV_USERS) errors.push('Missing KV_USERS');
  
  const missing = Object.entries(configStatus).filter(([,ok])=>!ok).map(([k])=>k);
  
  return { errors, warnings, configStatus, missing };
}

// Environment validation
export function validateEnvironment(env: any): void {
  const { errors, warnings } = getConfigurationDiagnostics(env);
  if (errors.length) {
    throw Object.assign(
      new Error(
        `Configuration validation failed: ${errors.length} error(s), ${warnings.length} warning(s). Details: ${errors.join('; ')}`
      ),
      { code: 'configuration_error', status: 500 }
    );
  }
}

// Logging utility
export function log(stage: string, message: string, metadata?: any) {
  console.log(`be:${stage} msg=${message}${metadata ? ` metadata=${JSON.stringify(metadata)}` : ''}`);
}

// JSON error response helper
export function jsonError(c: any, status: number, code: string, message: string, details?: Record<string, any>, guidance?: string) {
  return c.json({ 
    ok: false, 
    code, 
    message, 
    details, 
    build: buildInfo(c.env),
    guidance 
  }, status);
}
