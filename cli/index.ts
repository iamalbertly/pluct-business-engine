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

function detectAuth(env: EnvVars) {
  return {
    apiKey: env.ENGINE_ADMIN_KEY || '',
    adminBearer: env.ADMIN_SECRET || env.ADMIN_TOKEN || env.ENGINE_ADMIN_KEY || '',
    webhookSecret: env.WEBHOOK_SECRET || '',
  };
}

function buildAuthHeaders(env: EnvVars, kind: 'admin' | 'apikey' | 'webhook'): Record<string,string> {
  const auth = detectAuth(env);
  if (kind === 'admin' && auth.adminBearer) return { 'Authorization': `Bearer ${auth.adminBearer}` };
  if (kind === 'apikey' && auth.apiKey) return { 'X-API-Key': auth.apiKey };
  if (kind === 'webhook' && auth.webhookSecret) return { 'x-webhook-secret': auth.webhookSecret };
  return {};
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
  const reqHeaders = { 'content-type': 'application/json', ...(headers || {}) } as Record<string,string>;
  const reqBody = body ? JSON.stringify(body) : undefined;
  const requestInfo = { method, url, headers: reqHeaders, body: reqBody };
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { method, headers: reqHeaders, body: reqBody } as RequestInit);
    const text = await res.text();
    let json: any = undefined;
    try { json = text ? JSON.parse(text) : undefined; } catch {}
    const respHeaders = Object.fromEntries(Array.from(res.headers.entries()));
    const responseInfo = { status: res.status, ok: res.ok, headers: respHeaders, text, json };
    const durationMs = Date.now() - startedAt;
    return { request: requestInfo, response: responseInfo, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const errorInfo = { message: String(err?.message || err), code: err?.code, stack: err?.stack };
    const responseInfo = { status: 0, ok: false, headers: {}, text: '', json: undefined, error: errorInfo } as any;
    return { request: requestInfo, response: responseInfo, durationMs };
  }
}

async function cmdStatus(env: EnvVars, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/health`;
  const { request, response, durationMs } = await httpJson('GET', url);
  console.log(JSON.stringify({ command: 'status', request, response, durationMs }, null, 2));
  logLine(`status ${response.status} url=${url}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdServiceHealth(env: EnvVars, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/health/services`;
  const { request, response, durationMs } = await httpJson('GET', url);
  console.log(JSON.stringify({ command: 'service-health', request, response, durationMs }, null, 2));
  logLine(`service-health ${response.status} url=${url}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdSeedCredits(env: EnvVars, userId: string, amount: number, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const attempts: Array<{ url: string; headers: Record<string,string> }> = [];
  const apiKeyHeaders = buildAuthHeaders(env, 'apikey');
  const adminHeaders = buildAuthHeaders(env, 'admin');
  const webhookHeaders = buildAuthHeaders(env, 'webhook');

  if (Object.keys(apiKeyHeaders).length) attempts.push({ url: `${base}/v1/credits/add`, headers: apiKeyHeaders });
  if (Object.keys(adminHeaders).length) attempts.push({ url: `${base}/admin/credits/add`, headers: adminHeaders });
  if (Object.keys(webhookHeaders).length) attempts.push({ url: `${base}/add-credits`, headers: { ...webhookHeaders, 'Content-Type': 'application/json' } });

  let lastResp: any = null;
  for (const attempt of attempts) {
    const { request, response, durationMs } = await httpJson('POST', attempt.url, { userId, amount }, attempt.headers);
    lastResp = { request, response, durationMs };
    if (response.ok) {
      console.log(JSON.stringify({ command: 'seed-credits', userId, amount, request, response, durationMs }, null, 2));
      logLine(`seed-credits ${response.status} userId=${userId} amount=${amount} via=${attempt.url}`);
      if (exitOnComplete) process.exit(0);
      return;
    }
  }
  console.log(JSON.stringify({ command: 'seed-credits', userId, amount, ...lastResp }, null, 2));
  logLine(`seed-credits failed userId=${userId} amount=${amount}`);
  if (exitOnComplete) process.exit(1);
}

async function cmdVendToken(env: EnvVars, userId: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/vend-token`;
  const { request, response, durationMs } = await httpJson('POST', url, { userId });
  console.log(JSON.stringify({ command: 'vend-token', request, response, userId, durationMs }, null, 2));
  logLine(`vend-token ${response.status} userId=${userId}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdValidate(env: EnvVars, token: string, exitOnComplete: boolean = true) {
  // There is no public validate endpoint in simplified gateway; perform a protected TTT call to implicitly validate
  const base = getBaseUrl(env);
  const url = `${base}/ttt/status/ping`;
  const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${token}` });
  console.log(JSON.stringify({ command: 'validate', request, response, durationMs }, null, 2));
  logLine(`validate ${response.status}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdBalance(env: EnvVars, userId: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/user/${encodeURIComponent(userId)}/balance`;
  const { request, response, durationMs } = await httpJson('GET', url);
  console.log(JSON.stringify({ command: 'balance', userId, request, response, durationMs }, null, 2));
  logLine(`balance ${response.status} userId=${userId}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdAddUser(env: EnvVars, userId: string, initialCredits: number, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/user/create`;
  const { request, response, durationMs } = await httpJson('POST', url, { userId, initialCredits });
  console.log(JSON.stringify({ command: 'add-user', request, response, durationMs }, null, 2));
  logLine(`add-user ${response.status} userId=${userId} credits=${initialCredits}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdAdminListUsers(env: EnvVars, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/admin/users`;
  const { request, response, durationMs } = await httpJson('GET', url, undefined, buildAuthHeaders(env, 'admin'));
  console.log(JSON.stringify({ command: 'admin-list-users', request, response, durationMs }, null, 2));
  logLine(`admin-list-users ${response.status}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdAdminListTransactions(env: EnvVars, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/admin/transactions`;
  const { request, response, durationMs } = await httpJson('GET', url, undefined, buildAuthHeaders(env, 'admin'));
  console.log(JSON.stringify({ command: 'admin-list-transactions', request, response, durationMs }, null, 2));
  logLine(`admin-list-transactions ${response.status}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdAdminApiKeys(env: EnvVars, action: string, arg?: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const auth = buildAuthHeaders(env, 'admin');
  if (action === 'list') {
    const url = `${base}/admin/api-keys`;
    const { request, response, durationMs } = await httpJson('GET', url, undefined, auth);
    console.log(JSON.stringify({ command: 'admin-api-keys', action, request, response, durationMs }, null, 2));
    logLine(`admin-api-keys:list ${response.status}`);
    if (exitOnComplete) process.exit(response.ok ? 0 : 1);
    return;
  } else if (action === 'create') {
    const url = `${base}/admin/api-keys/create`;
    const name = arg || `cli-key-${Date.now()}`;
    const { request, response, durationMs } = await httpJson('POST', url, { name }, auth);
    console.log(JSON.stringify({ command: 'admin-api-keys', action, name, request, response, durationMs }, null, 2));
    logLine(`admin-api-keys:create ${response.status} name=${name}`);
    if (exitOnComplete) process.exit(response.ok ? 0 : 1);
    return;
  } else if (action === 'revoke') {
    const id = arg;
    if (!id) { console.error('Usage: admin:api-keys revoke <id>'); process.exit(2); }
    const url = `${base}/admin/api-keys/${encodeURIComponent(id)}/revoke`;
    const { request, response, durationMs } = await httpJson('POST', url, {}, auth);
    console.log(JSON.stringify({ command: 'admin-api-keys', action, id, request, response, durationMs }, null, 2));
    logLine(`admin-api-keys:revoke ${response.status} id=${id}`);
    if (exitOnComplete) process.exit(response.ok ? 0 : 1);
    return;
  } else {
    console.error('Usage: admin:api-keys <list|create [name]|revoke <id>>');
    process.exit(2);
  }
}

async function cmdUserTransactions(env: EnvVars, userId: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/user/${encodeURIComponent(userId)}/transactions`;
  const { request, response, durationMs } = await httpJson('GET', url);
  console.log(JSON.stringify({ command: 'user-transactions', userId, request, response, durationMs }, null, 2));
  logLine(`user-transactions ${response.status} userId=${userId}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdTttTranscribe(env: EnvVars, token: string, payloadJson: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/ttt/transcribe`;
  let payload: any = undefined;
  try { payload = payloadJson ? JSON.parse(payloadJson) : {}; } catch { payload = {}; }
  const { request, response, durationMs } = await httpJson('POST', url, payload, { 'Authorization': `Bearer ${token}` });
  console.log(JSON.stringify({ command: 'ttt-transcribe', request, response, durationMs }, null, 2));
  logLine(`ttt-transcribe ${response.status}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdTttStatus(env: EnvVars, token: string, id: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/ttt/status/${encodeURIComponent(id)}`;
  const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${token}` });
  console.log(JSON.stringify({ command: 'ttt-status', request, response, durationMs }, null, 2));
  logLine(`ttt-status ${response.status} id=${id}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

// Interactive USSD-style menu
async function runInteractiveMenu(env: EnvVars) {
  const rl = await import('readline');
  const reader = rl.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string) => new Promise<string>(resolve => reader.question(q, resolve));

  async function showHeader() {
    const base = getBaseUrl(env);
    const auth = detectAuth(env);
    console.log('\nPluct CLI – Interactive Menu');
    console.log('============================');
    console.log(`Base URL: ${base}`);
    console.log(`Auth: X-API-Key=${auth.apiKey ? 'yes' : 'no'}, AdminBearer=${auth.adminBearer ? 'yes' : 'no'}, WebhookSecret=${auth.webhookSecret ? 'yes' : 'no'}`);
  }

  async function monitoringMenu() {
    console.log('\n5) Service Monitoring');
    console.log('  1. Check service health');
    console.log('  2. View service recommendations');
    console.log('  3. Test TTT connectivity');
    console.log('  0. Back');
    const choice = (await ask('Choose: ')).trim();
    if (choice === '1') {
      await cmdServiceHealth(env, false);
    } else if (choice === '2') {
      await cmdServiceHealth(env, false);
    } else if (choice === '3') {
      const token = (await ask('JWT Token (optional): ')).trim();
      if (token) {
        await cmdTttTranscribe(env, token, '{"test": "connectivity"}', false);
      } else {
        console.log('Skipping TTT test - no token provided');
      }
    }
  }

  async function usersMenu() {
    console.log('\n1) Users');
    console.log('  1. Create user');
    console.log('  2. Show balance');
    console.log('  3. Add credits');
    console.log('  4. List all users');
    console.log('  5. User transactions');
    console.log('  0. Back');
    const choice = (await ask('Choose: ')).trim();
    if (choice === '1') {
      const userId = (await ask('User ID: ')).trim();
      const credits = Number((await ask('Initial credits (0): ')).trim() || '0');
      await cmdAddUser(env, userId, credits, false);
    } else if (choice === '2') {
      const userId = (await ask('User ID: ')).trim();
      await cmdBalance(env, userId, false);
    } else if (choice === '3') {
      const userId = (await ask('User ID: ')).trim();
      const amount = Number((await ask('Amount: ')).trim());
      await cmdSeedCredits(env, userId, amount, false);
    } else if (choice === '4') {
      await cmdAdminListUsers(env, false);
    } else if (choice === '5') {
      const userId = (await ask('User ID: ')).trim();
      await cmdUserTransactions(env, userId, false);
    }
  }

  async function tokensMenu() {
    console.log('\n2) Tokens');
    console.log('  1. Vend token');
    console.log('  2. Validate token');
    console.log('  3. TTT Transcribe (requires JWT)');
    console.log('  4. TTT Status (requires JWT)');
    console.log('  0. Back');
    const choice = (await ask('Choose: ')).trim();
    if (choice === '1') {
      const userId = (await ask('User ID: ')).trim();
      await cmdVendToken(env, userId, false);
    } else if (choice === '2') {
      const token = (await ask('JWT: ')).trim();
      await cmdValidate(env, token, false);
    } else if (choice === '3') {
      const token = (await ask('JWT: ')).trim();
      const payload = (await ask('Transcribe JSON payload ({}): ')).trim() || '{}';
      await cmdTttTranscribe(env, token, payload, false);
    } else if (choice === '4') {
      const token = (await ask('JWT: ')).trim();
      const id = (await ask('Request ID: ')).trim();
      await cmdTttStatus(env, token, id, false);
    }
  }

  async function adminMenu() {
    console.log('\n3) Admin');
    console.log('  1. List users');
    console.log('  2. List transactions');
    console.log('  0. Back');
    const choice = (await ask('Choose: ')).trim();
    if (choice === '1') {
      await cmdAdminListUsers(env);
    } else if (choice === '2') {
      await cmdAdminListTransactions(env);
    }
  }

  async function apiKeysMenu() {
    console.log('\n4) API Keys');
    console.log('  1. List keys');
    console.log('  2. Create key');
    console.log('  3. Revoke key');
    console.log('  0. Back');
    const choice = (await ask('Choose: ')).trim();
    if (choice === '1') {
      await cmdAdminApiKeys(env, 'list');
    } else if (choice === '2') {
      const name = (await ask('Name (auto if empty): ')).trim();
      await cmdAdminApiKeys(env, 'create', name || undefined);
    } else if (choice === '3') {
      const id = (await ask('Key ID: ')).trim();
      await cmdAdminApiKeys(env, 'revoke', id);
    }
  }

  while (true) {
    await showHeader();
    console.log('\nMain Menu');
    console.log('  1. Users');
    console.log('  2. Tokens');
    console.log('  3. Admin');
    console.log('  4. API Keys');
    console.log('  5. Service Monitoring');
    console.log('  6. Status');
    console.log('  0. Exit');
    const choice = (await ask('Choose: ')).trim();
    try {
      if (choice === '1') await usersMenu();
      else if (choice === '2') await tokensMenu();
      else if (choice === '3') await adminMenu();
      else if (choice === '4') await apiKeysMenu();
      else if (choice === '5') await monitoringMenu();
      else if (choice === '6') await cmdStatus(env, false);
      else if (choice === '0') { reader.close(); break; }
      else console.log('Invalid choice');
    } catch (err) {
      console.error('Error:', err);
    }
  }
}

async function main() {
  const env = getEnv();
  const [,, cmd, ...args] = process.argv;
  if (!cmd || cmd === 'menu') {
    await runInteractiveMenu(env);
    return;
  }
  switch (cmd) {
    case 'status':
      await cmdStatus(env); break;
    case 'service-health':
      await cmdServiceHealth(env); break;
    case 'seed-credits': {
      const userId = args[0] || 'cli-' + Date.now();
      const amount = Number(args[1] ?? '10');
      await cmdSeedCredits(env, userId, amount);
      break;
    }
    case 'add-user': {
      const userId = args[0] || 'cli-' + Date.now();
      const initialCredits = Number(args[1] ?? '0');
      await cmdAddUser(env, userId, initialCredits);
      break;
    }
    case 'vend-token': {
      const userId = args[0] || 'cli-' + Date.now();
      await cmdVendToken(env, userId);
      break;
    }
    case 'balance': {
      const userId = args[0] || 'cli-' + Date.now();
      await cmdBalance(env, userId);
      break;
    }
    case 'tokens': {
      const userId = args[0] || 'cli-' + Date.now();
      await cmdBalance(env, userId);
      break;
    }
    case 'validate': {
      const token = args[0];
      if (!token) { console.error('Usage: validate <jwt>'); process.exit(2); }
      await cmdValidate(env, token);
      break;
    }
    case 'admin:list-users':
      await cmdAdminListUsers(env); break;
    case 'admin:list-transactions':
      await cmdAdminListTransactions(env); break;
    case 'admin:api-keys': {
      const action = args[0];
      const extra = args[1];
      if (!action) { console.error('Usage: admin:api-keys <list|create [name]|revoke <id>>'); process.exit(2); }
      await cmdAdminApiKeys(env, action, extra);
      break;
    }
    case 'help':
    default:
      console.log(`Pluct CLI
Usage:
  npx ts-node cli/index.ts status
  npx ts-node cli/index.ts service-health
  npx ts-node cli/index.ts seed-credits <userId> <amount>
  npx ts-node cli/index.ts add-user <userId> <initialCredits>
  npx ts-node cli/index.ts vend-token <userId>
  npx ts-node cli/index.ts balance <userId>
  npx ts-node cli/index.ts tokens <userId>
  npx ts-node cli/index.ts validate <jwt>
  npx ts-node cli/index.ts admin:list-users
  npx ts-node cli/index.ts admin:list-transactions
  npx ts-node cli/index.ts admin:api-keys <list|create [name]|revoke <id>>

Env resolution:
  Reads .dev.vars at repo root; supports BASE_URL override.
`);
      process.exit(0);
  }
}

main().catch(err => { console.error(err); logLine(`error ${String(err)}`); process.exit(1); });


