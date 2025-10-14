#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

type EnvVars = Record<string, string>;

function loadDevVars(filePath: string): EnvVars {
  const env: EnvVars = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function getEnv(): EnvVars {
  const repoRoot = process.cwd();
  const devVars = loadDevVars(path.join(repoRoot, '.dev.vars'));
  // Prefer process.env overrides
  return { ...devVars, ...process.env as any } as EnvVars;
}

function getBaseUrl(env: EnvVars): string {
  // Use production URL by default; allow override via BASE_URL
  return (env.BASE_URL as string) || 'https://pluct-business-engine.romeo-lya2.workers.dev';
}

function nowTs(): string {
  return new Date().toISOString();
}

function logLine(message: string) {
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const line = `[${nowTs()}] ${message}\n`;
  fs.appendFileSync(path.join(logDir, 'cli.log'), line);
}

async function httpJson(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(headers || {})
    },
    body: body ? JSON.stringify(body) : undefined,
  } as RequestInit);
  const text = await res.text();
  let json: any = undefined;
  try { json = text ? JSON.parse(text) : undefined; } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

async function cmdStatus(env: EnvVars) {
  const base = getBaseUrl(env);
  const url = `${base}/health`;
  const resp = await httpJson('GET', url);
  console.log(JSON.stringify({ command: 'status', url, ...resp }, null, 2));
  logLine(`status ${resp.status} url=${url}`);
  process.exit(resp.ok ? 0 : 1);
}

async function cmdSeedCredits(env: EnvVars, userId: string, amount: number) {
  const base = getBaseUrl(env);
  const url = `${base}/v1/credits/add`;
  const apiKey = env.ENGINE_ADMIN_KEY || '';
  if (!apiKey) {
    console.error('ENGINE_ADMIN_KEY missing');
    process.exit(2);
  }
  const resp = await httpJson('POST', url, { userId, amount }, { 'X-API-Key': apiKey });
  console.log(JSON.stringify({ command: 'seed-credits', userId, amount, url, ...resp }, null, 2));
  logLine(`seed-credits ${resp.status} userId=${userId} amount=${amount}`);
  process.exit(resp.ok ? 0 : 1);
}

async function cmdVendToken(env: EnvVars, userId: string) {
  const base = getBaseUrl(env);
  const url = `${base}/vend-token`;
  const resp = await httpJson('POST', url, { userId });
  console.log(JSON.stringify({ command: 'vend-token', userId, url, ...resp }, null, 2));
  logLine(`vend-token ${resp.status} userId=${userId}`);
  process.exit(resp.ok ? 0 : 1);
}

async function cmdValidate(env: EnvVars, token: string) {
  // There is no public validate endpoint in simplified gateway; perform a protected TTT call to implicitly validate
  const base = getBaseUrl(env);
  const url = `${base}/ttt/status/ping`;
  const resp = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${token}` });
  console.log(JSON.stringify({ command: 'validate', url, statusOnly: resp.status, ok: resp.ok }, null, 2));
  logLine(`validate ${resp.status}`);
  process.exit(resp.ok ? 0 : 1);
}

async function main() {
  const env = getEnv();
  const [,, cmd, ...args] = process.argv;
  switch (cmd) {
    case 'status':
      await cmdStatus(env); break;
    case 'seed-credits': {
      const userId = args[0] || 'cli-' + Date.now();
      const amount = Number(args[1] ?? '10');
      await cmdSeedCredits(env, userId, amount);
      break;
    }
    case 'vend-token': {
      const userId = args[0] || 'cli-' + Date.now();
      await cmdVendToken(env, userId);
      break;
    }
    case 'validate': {
      const token = args[0];
      if (!token) { console.error('Usage: validate <jwt>'); process.exit(2); }
      await cmdValidate(env, token);
      break;
    }
    case 'help':
    default:
      console.log(`Pluct CLI
Usage:
  npx ts-node cli/index.ts status
  npx ts-node cli/index.ts seed-credits <userId> <amount>
  npx ts-node cli/index.ts vend-token <userId>
  npx ts-node cli/index.ts validate <jwt>

Env resolution:
  Reads .dev.vars at repo root; supports BASE_URL override.
`);
      process.exit(0);
  }
}

main().catch(err => { console.error(err); logLine(`error ${String(err)}`); process.exit(1); });


