// Core interfaces and types for Pluct Business Engine
// Following naming convention: [Project]-[ParentScope]-[ChildScope]-[SeparationOfConcern][CoreResponsibility]

export interface Env {
  KV_USERS: any;
  DB: any;
  ENGINE_JWT_SECRET?: string;
  ENGINE_ADMIN_KEY?: string;
  TTT_SHARED_SECRET?: string;
  TTT_BASE?: string;
  BUILD_REF?: string;
  BUILD_TIME?: string;
  LOG_LEVEL?: string;
  MAX_RETRIES?: string;
  REQUEST_TIMEOUT?: string;
}

export interface EffectiveConfig {
  ENGINE_JWT_SECRET?: string;
  ENGINE_ADMIN_KEY?: string;
  TTT_SHARED_SECRET?: string;
  TTT_BASE?: string;
  KV_USERS?: any;
  DB?: any;
}

export interface ErrorResponse {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, any>;
  build?: {
    ref: string;
    deployedAt: string;
  };
  guidance?: string | null;
}

export interface SuccessResponse {
  ok: true;
  [key: string]: any;
}

export interface BuildInfo {
  ref: string;
  deployedAt: string;
}

export interface ConfigurationDiagnostics {
  errors: string[];
  warnings: string[];
  configStatus: Record<string, boolean>;
  missing: string[];
}
