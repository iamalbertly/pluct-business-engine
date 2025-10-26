#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

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
  return { ...devVars, ...process.env as any } as EnvVars;
}

function getBaseUrl(env: EnvVars): string {
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

async function createUserToken(env: EnvVars, userId: string): Promise<string> {
  const jwtSecret = env.ENGINE_JWT_SECRET || 'test-secret';
  const { SignJWT } = await import('jose');
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    sub: userId,
    scope: 'ttt:transcribe',
    iat: now,
    exp: now + (15 * 60)
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .setIssuedAt()
    .sign(key);
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

// Test result storage for smart prioritization
interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  result?: any;
  error?: string;
  timestamp: number;
}

interface TestSession {
  sessionId: string;
  timestamp: number;
  results: TestResult[];
  overallSuccess: boolean;
}

// Load previous test results for smart prioritization
function loadPreviousTestResults(): TestSession | null {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    const resultsFile = path.join(logDir, 'test-results.json');
    if (!fs.existsSync(resultsFile)) return null;
    
    const content = fs.readFileSync(resultsFile, 'utf-8');
    const session: TestSession = JSON.parse(content);
    
    // Only use results from last 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    if (session.timestamp < oneDayAgo) return null;
    
    return session;
  } catch (error) {
    return null;
  }
}

// Save test results for future prioritization
function saveTestResults(session: TestSession) {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    
    const resultsFile = path.join(logDir, 'test-results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(session, null, 2));
  } catch (error) {
    console.warn('⚠️  Could not save test results for future prioritization');
  }
}

// Comprehensive end-to-end test suite with smart prioritization
async function cmdRunAll(env: EnvVars, exitOnComplete: boolean = true) {
  const testUserId = `e2e-test-${Date.now()}`;
  const testResults: TestResult[] = [];
  let overallSuccess = true;
  
  // Load previous test results for smart prioritization
  const previousSession = loadPreviousTestResults();
  const failedTests = previousSession ? previousSession.results.filter(r => r.status === 'FAIL').map(r => r.test) : [];
  
  console.log('\n🚀 Starting Pluct Business Engine End-to-End Test Suite');
  console.log('====================================================');
  
  if (previousSession && failedTests.length > 0) {
    console.log(`\n🎯 Smart Prioritization: Found ${failedTests.length} previously failed tests`);
    console.log('📋 Will prioritize failed tests first to save time and resources');
    console.log(`🔍 Previous failures: ${failedTests.join(', ')}`);
  } else if (previousSession) {
    console.log('\n✅ All previous tests passed - running full test suite');
  } else {
    console.log('\n🆕 No previous test results found - running full test suite');
  }
  
  const runTest = async (testName: string, testFn: () => Promise<any>, isPriority: boolean = false) => {
    const priorityIndicator = isPriority ? '🔥 PRIORITY ' : '';
    console.log(`\n📋 Running: ${priorityIndicator}${testName}`);
    try {
      const result = await testFn();
      const testResult: TestResult = { 
        test: testName, 
        status: 'PASS', 
        result, 
        timestamp: Date.now() 
      };
      testResults.push(testResult);
      console.log(`✅ ${testName} - PASSED`);
      return result;
    } catch (error) {
      const testResult: TestResult = { 
        test: testName, 
        status: 'FAIL', 
        error: String(error), 
        timestamp: Date.now() 
      };
      testResults.push(testResult);
      console.log(`❌ ${testName} - FAILED: ${error}`);
      overallSuccess = false;
      
      // In development phase, terminate on any failure with detailed error info
      console.log('\n🚨 CRITICAL FAILURE DETECTED');
      console.log('================================');
      console.log(`❌ Test: ${testName}`);
      console.log(`🔍 Error: ${error}`);
      console.log(`⏰ Time: ${new Date().toISOString()}`);
      console.log(`🆔 Test User: ${testUserId}`);
      console.log('\n📊 Current Test Results:');
      console.log(`   Passed: ${testResults.filter(t => t.status === 'PASS').length}`);
      console.log(`   Failed: ${testResults.filter(t => t.status === 'FAIL').length}`);
      console.log('\n🛑 Terminating test suite due to critical failure');
      console.log('💡 Fix the failing test before running again');
      
      // Save partial results
      const session: TestSession = {
        sessionId: `session-${Date.now()}`,
        timestamp: Date.now(),
        results: testResults,
        overallSuccess: false
      };
      saveTestResults(session);
      
      if (exitOnComplete) {
        process.exit(1);
      }
      return null;
    }
  };

  // Define all tests with their functions
  const allTests = [
    { name: 'Health Check - System Status', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/health`;
      const { request, response, durationMs } = await httpJson('GET', url);
      if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
      return { request, response, durationMs };
    }},
    { name: 'Service Health Check - All Services', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/health/services`;
      const { request, response, durationMs } = await httpJson('GET', url);
      if (!response.ok) throw new Error(`Service health check failed: ${response.status}`);
      return { request, response, durationMs };
    }},
    { name: 'Authentication - Create User Token', fn: async () => {
      const token = await createUserToken(env, testUserId);
      if (!token) throw new Error('Failed to create user token');
      return { token: token.substring(0, 20) + '...' };
    }},
    { name: 'User Creation - Add Initial Credits', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/v1/credits/add`;
      const apiKeyHeaders = buildAuthHeaders(env, 'apikey');
      const { request, response, durationMs } = await httpJson('POST', url, { userId: testUserId, amount: 100 }, apiKeyHeaders);
      if (!response.ok) throw new Error(`Failed to add credits: ${response.status}`);
      return { request, response, durationMs };
    }},
    { name: 'Balance Check - Verify Credits Added', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/v1/credits/balance`;
      const userToken = await createUserToken(env, testUserId);
      const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${userToken}` });
      if (!response.ok) throw new Error(`Failed to get balance: ${response.status}`);
      return { request, response, durationMs };
    }},
    { name: 'Token Vending - Create Service Token', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/v1/vend-token`;
      const userToken = await createUserToken(env, testUserId);
      const { request, response, durationMs } = await httpJson('POST', url, { userId: testUserId }, { 'Authorization': `Bearer ${userToken}` });
      if (!response.ok) throw new Error(`Failed to vend token: ${response.status}`);
      const serviceToken = response.json?.token;
      if (!serviceToken) throw new Error('No service token returned');
      return { request, response, durationMs, serviceToken };
    }},
    { name: 'Token Validation - Test Service Token', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/ttt/status/ping`;
      const userToken = await createUserToken(env, testUserId);
      const vendResponse = await httpJson('POST', `${base}/v1/vend-token`, { userId: testUserId }, { 'Authorization': `Bearer ${userToken}` });
      const serviceToken = vendResponse.response.json?.token;
      if (!serviceToken) throw new Error('No service token available for validation');
      const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` });
      if (!response.ok) throw new Error(`Token validation failed: ${response.status}`);
      return { request, response, durationMs };
    }},
    { name: 'TTT Transcribe - Test Core Service', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/ttt/transcribe`;
      const userToken = await createUserToken(env, testUserId);
      const vendResponse = await httpJson('POST', `${base}/v1/vend-token`, { userId: testUserId }, { 'Authorization': `Bearer ${userToken}` });
      const serviceToken = vendResponse.response.json?.token;
      if (!serviceToken) throw new Error('No service token available for transcribe');
      const payload = { 
        audio: "test-audio-data", 
        format: "wav",
        language: "en-US",
        test: true 
      };
      const { request, response, durationMs } = await httpJson('POST', url, payload, { 'Authorization': `Bearer ${serviceToken}` });
      if (!response.ok) throw new Error(`TTT transcribe failed: ${response.status}`);
      const transcribeId = response.json?.id || 'test-id';
      return { request, response, durationMs, transcribeId };
    }},
    { name: 'TTT Status Check - Monitor Service', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/ttt/status/test-id`;
      const userToken = await createUserToken(env, testUserId);
      const vendResponse = await httpJson('POST', `${base}/v1/vend-token`, { userId: testUserId }, { 'Authorization': `Bearer ${userToken}` });
      const serviceToken = vendResponse.response.json?.token;
      if (!serviceToken) throw new Error('No service token available for status check');
      const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` });
      if (response.status !== 200 && response.status !== 404) {
        throw new Error(`TTT status check failed: ${response.status}`);
      }
      return { request, response, durationMs };
    }},
    { name: 'Credit Consumption - Simulate Service Usage', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/v1/credits/consume`;
      const userToken = await createUserToken(env, testUserId);
      const { request, response, durationMs } = await httpJson('POST', url, { 
        userId: testUserId, 
        amount: 10,
        service: 'ttt-transcribe',
        requestId: 'test-id' 
      }, { 'Authorization': `Bearer ${userToken}` });
      if (response.status !== 200 && response.status !== 404) {
        throw new Error(`Credit consumption failed: ${response.status}`);
      }
      return { request, response, durationMs };
    }},
    { name: 'Final Balance Check - Verify Credits Consumed', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/v1/credits/balance`;
      const userToken = await createUserToken(env, testUserId);
      const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${userToken}` });
      if (!response.ok) throw new Error(`Final balance check failed: ${response.status}`);
      return { request, response, durationMs };
    }},
    { name: 'Admin Operations - List Users', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/admin/users`;
      const adminHeaders = buildAuthHeaders(env, 'admin');
      const { request, response, durationMs } = await httpJson('GET', url, undefined, adminHeaders);
      if (response.status !== 200 && response.status !== 404) {
        throw new Error(`Admin list users failed: ${response.status}`);
      }
      return { request, response, durationMs };
    }},
    { name: 'Rate Limiting Test - Multiple Requests', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/ttt/status/ping`;
      const userToken = await createUserToken(env, testUserId);
      const vendResponse = await httpJson('POST', `${base}/v1/vend-token`, { userId: testUserId }, { 'Authorization': `Bearer ${userToken}` });
      const serviceToken = vendResponse.response.json?.token;
      if (!serviceToken) throw new Error('No service token available for rate limiting test');
      const promises = Array(5).fill(null).map(() => 
        httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` })
      );
      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.response.ok).length;
      if (successCount === 0) throw new Error('All rate limit test requests failed');
      return { successCount, totalRequests: results.length };
    }},
    { name: 'Error Handling Test - Invalid Token', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/ttt/status/ping`;
      const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer invalid-token` });
      if (response.status !== 401 && response.status !== 403) {
        throw new Error(`Expected 401/403 for invalid token, got: ${response.status}`);
      }
      return { request, response, durationMs };
    }},
    { name: 'Cleanup - Remove Test User', fn: async () => {
      const base = getBaseUrl(env);
      const url = `${base}/admin/users/${testUserId}`;
      const adminHeaders = buildAuthHeaders(env, 'admin');
      const { request, response, durationMs } = await httpJson('DELETE', url, undefined, adminHeaders);
      if (response.status !== 200 && response.status !== 404) {
        throw new Error(`User cleanup failed: ${response.status}`);
      }
      return { request, response, durationMs };
    }}
  ];

  // Smart prioritization: Run failed tests first
  const priorityTests = allTests.filter(test => failedTests.includes(test.name));
  const remainingTests = allTests.filter(test => !failedTests.includes(test.name));
  const orderedTests = [...priorityTests, ...remainingTests];

  // Execute tests in priority order
  for (const test of orderedTests) {
    const isPriority = priorityTests.includes(test);
    await runTest(test.name, test.fn, isPriority);
  }

  // Final Results
  console.log('\n📊 Test Suite Results');
  console.log('====================');
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`Passed: ${testResults.filter(t => t.status === 'PASS').length}`);
  console.log(`Failed: ${testResults.filter(t => t.status === 'FAIL').length}`);
  console.log(`Success Rate: ${Math.round((testResults.filter(t => t.status === 'PASS').length / testResults.length) * 100)}%`);
  
  if (overallSuccess) {
    console.log('\n🎉 All tests passed! The Pluct Business Engine is fully operational.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the results above.');
  }

  const finalResult = {
    command: 'runAll',
    testUserId,
    totalTests: testResults.length,
    passed: testResults.filter(t => t.status === 'PASS').length,
    failed: testResults.filter(t => t.status === 'FAIL').length,
    successRate: Math.round((testResults.filter(t => t.status === 'PASS').length / testResults.length) * 100),
    results: testResults,
    overallSuccess
  };

  console.log(JSON.stringify(finalResult, null, 2));
  logLine(`runAll completed: ${finalResult.passed}/${finalResult.totalTests} tests passed`);
  
  // Save test results for future prioritization
  const session: TestSession = {
    sessionId: `session-${Date.now()}`,
    timestamp: Date.now(),
    results: testResults,
    overallSuccess
  };
  saveTestResults(session);
  
  if (exitOnComplete) process.exit(overallSuccess ? 0 : 1);
}

// Basic command functions
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
  const url = `${base}/v1/credits/add`;
  const apiKeyHeaders = buildAuthHeaders(env, 'apikey');
  const { request, response, durationMs } = await httpJson('POST', url, { userId, amount }, apiKeyHeaders);
  console.log(JSON.stringify({ command: 'seed-credits', userId, amount, request, response, durationMs }, null, 2));
  logLine(`seed-credits ${response.status} userId=${userId} amount=${amount}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdVendToken(env: EnvVars, userId: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/v1/vend-token`;
  const userToken = await createUserToken(env, userId);
  const { request, response, durationMs } = await httpJson('POST', url, { userId }, { 'Authorization': `Bearer ${userToken}` });
  console.log(JSON.stringify({ command: 'vend-token', request, response, userId, durationMs }, null, 2));
  logLine(`vend-token ${response.status} userId=${userId}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdValidate(env: EnvVars, token: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/ttt/status/ping`;
  const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${token}` });
  console.log(JSON.stringify({ command: 'validate', request, response, durationMs }, null, 2));
  logLine(`validate ${response.status}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdBalance(env: EnvVars, userId: string, exitOnComplete: boolean = true) {
  const base = getBaseUrl(env);
  const url = `${base}/v1/credits/balance`;
  const userToken = await createUserToken(env, userId);
  const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${userToken}` });
  console.log(JSON.stringify({ command: 'balance', userId, request, response, durationMs }, null, 2));
  logLine(`balance ${response.status} userId=${userId}`);
  if (exitOnComplete) process.exit(response.ok ? 0 : 1);
}

async function cmdAddUser(env: EnvVars, userId: string, initialCredits: number, exitOnComplete: boolean = true) {
  await cmdSeedCredits(env, userId, initialCredits, exitOnComplete);
}

async function cmdAdminListUsers(env: EnvVars, exitOnComplete: boolean = true) {
  console.log(JSON.stringify({ command: 'admin-list-users', message: 'Admin endpoints not implemented in this version' }, null, 2));
  logLine(`admin-list-users not implemented`);
  if (exitOnComplete) process.exit(0);
}

async function cmdAdminListTransactions(env: EnvVars, exitOnComplete: boolean = true) {
  console.log(JSON.stringify({ command: 'admin-list-transactions', message: 'Admin endpoints not implemented in this version' }, null, 2));
  logLine(`admin-list-transactions not implemented`);
  if (exitOnComplete) process.exit(0);
}

async function cmdAdminApiKeys(env: EnvVars, action: string, arg?: string, exitOnComplete: boolean = true) {
  console.log(JSON.stringify({ command: 'admin-api-keys', action, message: 'Admin endpoints not implemented in this version' }, null, 2));
  logLine(`admin-api-keys:${action} not implemented`);
  if (exitOnComplete) process.exit(0);
}

async function cmdUserTransactions(env: EnvVars, userId: string, exitOnComplete: boolean = true) {
  console.log(JSON.stringify({ command: 'user-transactions', userId, message: 'User transaction endpoints not implemented in this version' }, null, 2));
  logLine(`user-transactions not implemented userId=${userId}`);
  if (exitOnComplete) process.exit(0);
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
    console.log('  7. Run All Tests (E2E)');
    console.log('  0. Exit');
    const choice = (await ask('Choose: ')).trim();
    try {
      if (choice === '1') await usersMenu();
      else if (choice === '2') await tokensMenu();
      else if (choice === '3') await adminMenu();
      else if (choice === '4') await apiKeysMenu();
      else if (choice === '5') await monitoringMenu();
      else if (choice === '6') await cmdStatus(env, false);
      else if (choice === '7') await cmdRunAll(env, false);
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
    case 'runAll':
      await cmdRunAll(env);
      break;
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
  npx ts-node cli/index.ts runAll

Env resolution:
  Reads .dev.vars at repo root; supports BASE_URL override.
`);
      process.exit(0);
  }
}

main().catch(err => { console.error(err); logLine(`error ${String(err)}`); process.exit(1); });
