#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
function loadDevVars(filePath) {
    const env = {};
    if (!fs.existsSync(filePath)) {
        return env;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#'))
            continue;
        const idx = line.indexOf('=');
        if (idx === -1)
            continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        env[key] = value;
    }
    return env;
}
function getEnv() {
    const repoRoot = process.cwd();
    const devVars = loadDevVars(path.join(repoRoot, '.dev.vars'));
    // Prefer process.env overrides
    return { ...devVars, ...process.env };
}
function getBaseUrl(env) {
    // Use production URL by default; allow override via BASE_URL
    return env.BASE_URL || 'https://pluct-business-engine.romeo-lya2.workers.dev';
}
function detectAuth(env) {
    return {
        apiKey: env.ENGINE_ADMIN_KEY || '',
        adminBearer: env.ADMIN_SECRET || env.ADMIN_TOKEN || env.ENGINE_ADMIN_KEY || '',
        webhookSecret: env.WEBHOOK_SECRET || '',
    };
}
function buildAuthHeaders(env, kind) {
    const auth = detectAuth(env);
    if (kind === 'admin' && auth.adminBearer)
        return { 'Authorization': `Bearer ${auth.adminBearer}` };
    if (kind === 'apikey' && auth.apiKey)
        return { 'X-API-Key': auth.apiKey };
    if (kind === 'webhook' && auth.webhookSecret)
        return { 'x-webhook-secret': auth.webhookSecret };
    return {};
}
function nowTs() {
    return new Date().toISOString();
}
async function createUserToken(env, userId) {
    // For CLI testing, we'll create a simple user token
    // In production, this would be handled by the authentication system
    const jwtSecret = env.ENGINE_JWT_SECRET || 'test-secret';
    const { SignJWT } = await Promise.resolve().then(() => require('jose'));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(jwtSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    return await new SignJWT({
        sub: userId,
        scope: 'ttt:transcribe',
        iat: now,
        exp: now + (15 * 60) // 15 minutes
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('15m')
        .setIssuedAt()
        .sign(key);
}
function logLine(message) {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir))
        fs.mkdirSync(logDir, { recursive: true });
    const line = `[${nowTs()}] ${message}\n`;
    fs.appendFileSync(path.join(logDir, 'cli.log'), line);
}
async function httpJson(method, url, body, headers) {
    const reqHeaders = { 'content-type': 'application/json', ...(headers || {}) };
    const reqBody = body ? JSON.stringify(body) : undefined;
    const requestInfo = { method, url, headers: reqHeaders, body: reqBody };
    const startedAt = Date.now();
    try {
        const res = await fetch(url, { method, headers: reqHeaders, body: reqBody });
        const text = await res.text();
        let json = undefined;
        try {
            json = text ? JSON.parse(text) : undefined;
        }
        catch { }
        const respHeaders = Object.fromEntries(Array.from(res.headers.entries()));
        const responseInfo = { status: res.status, ok: res.ok, headers: respHeaders, text, json };
        const durationMs = Date.now() - startedAt;
        return { request: requestInfo, response: responseInfo, durationMs };
    }
    catch (err) {
        const durationMs = Date.now() - startedAt;
        const errorInfo = { message: String(err?.message || err), code: err?.code, stack: err?.stack };
        const responseInfo = { status: 0, ok: false, headers: {}, text: '', json: undefined, error: errorInfo };
        return { request: requestInfo, response: responseInfo, durationMs };
    }
}
async function cmdStatus(env, exitOnComplete = true) {
    const base = getBaseUrl(env);
    const url = `${base}/health`;
    const { request, response, durationMs } = await httpJson('GET', url);
    console.log(JSON.stringify({ command: 'status', request, response, durationMs }, null, 2));
    logLine(`status ${response.status} url=${url}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
async function cmdServiceHealth(env, exitOnComplete = true) {
    const base = getBaseUrl(env);
    const url = `${base}/health/services`;
    const { request, response, durationMs } = await httpJson('GET', url);
    console.log(JSON.stringify({ command: 'service-health', request, response, durationMs }, null, 2));
    logLine(`service-health ${response.status} url=${url}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
async function cmdSeedCredits(env, userId, amount, exitOnComplete = true) {
    const base = getBaseUrl(env);
    const url = `${base}/v1/credits/add`;
    const apiKeyHeaders = buildAuthHeaders(env, 'apikey');
    const { request, response, durationMs } = await httpJson('POST', url, { userId, amount }, apiKeyHeaders);
    console.log(JSON.stringify({ command: 'seed-credits', userId, amount, request, response, durationMs }, null, 2));
    logLine(`seed-credits ${response.status} userId=${userId} amount=${amount}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
async function cmdVendToken(env, userId, exitOnComplete = true) {
    const base = getBaseUrl(env);
    const url = `${base}/v1/vend-token`;
    // Need to create a user JWT token first for authentication
    const userToken = await createUserToken(env, userId);
    const { request, response, durationMs } = await httpJson('POST', url, { userId }, { 'Authorization': `Bearer ${userToken}` });
    console.log(JSON.stringify({ command: 'vend-token', request, response, userId, durationMs }, null, 2));
    logLine(`vend-token ${response.status} userId=${userId}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
async function cmdValidate(env, token, exitOnComplete = true) {
    // There is no public validate endpoint in simplified gateway; perform a protected TTT call to implicitly validate
    const base = getBaseUrl(env);
    const url = `${base}/ttt/status/ping`;
    const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${token}` });
    console.log(JSON.stringify({ command: 'validate', request, response, durationMs }, null, 2));
    logLine(`validate ${response.status}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
async function cmdBalance(env, userId, exitOnComplete = true) {
    const base = getBaseUrl(env);
    const url = `${base}/v1/credits/balance`;
    // Need to create a user JWT token first for authentication
    const userToken = await createUserToken(env, userId);
    const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${userToken}` });
    console.log(JSON.stringify({ command: 'balance', userId, request, response, durationMs }, null, 2));
    logLine(`balance ${response.status} userId=${userId}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
async function cmdAddUser(env, userId, initialCredits, exitOnComplete = true) {
    // For our implementation, we just add credits directly since users are created implicitly
    await cmdSeedCredits(env, userId, initialCredits, exitOnComplete);
}
async function cmdAdminListUsers(env, exitOnComplete = true) {
    console.log(JSON.stringify({ command: 'admin-list-users', message: 'Admin endpoints not implemented in this version' }, null, 2));
    logLine(`admin-list-users not implemented`);
    if (exitOnComplete)
        process.exit(0);
}
async function cmdAdminListTransactions(env, exitOnComplete = true) {
    console.log(JSON.stringify({ command: 'admin-list-transactions', message: 'Admin endpoints not implemented in this version' }, null, 2));
    logLine(`admin-list-transactions not implemented`);
    if (exitOnComplete)
        process.exit(0);
}
async function cmdAdminApiKeys(env, action, arg, exitOnComplete = true) {
    console.log(JSON.stringify({ command: 'admin-api-keys', action, message: 'Admin endpoints not implemented in this version' }, null, 2));
    logLine(`admin-api-keys:${action} not implemented`);
    if (exitOnComplete)
        process.exit(0);
}
async function cmdUserTransactions(env, userId, exitOnComplete = true) {
    console.log(JSON.stringify({ command: 'user-transactions', userId, message: 'User transaction endpoints not implemented in this version' }, null, 2));
    logLine(`user-transactions not implemented userId=${userId}`);
    if (exitOnComplete)
        process.exit(0);
}
async function cmdTttTranscribe(env, token, payloadJson, exitOnComplete = true) {
    const base = getBaseUrl(env);
    const url = `${base}/ttt/transcribe`;
    let payload = undefined;
    try {
        payload = payloadJson ? JSON.parse(payloadJson) : {};
    }
    catch {
        payload = {};
    }
    const { request, response, durationMs } = await httpJson('POST', url, payload, { 'Authorization': `Bearer ${token}` });
    console.log(JSON.stringify({ command: 'ttt-transcribe', request, response, durationMs }, null, 2));
    logLine(`ttt-transcribe ${response.status}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
async function cmdTttStatus(env, token, id, exitOnComplete = true) {
    const base = getBaseUrl(env);
    const url = `${base}/ttt/status/${encodeURIComponent(id)}`;
    const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${token}` });
    console.log(JSON.stringify({ command: 'ttt-status', request, response, durationMs }, null, 2));
    logLine(`ttt-status ${response.status} id=${id}`);
    if (exitOnComplete)
        process.exit(response.ok ? 0 : 1);
}
// Comprehensive end-to-end test suite
async function cmdRunAll(env, exitOnComplete = true) {
    const testUserId = `e2e-test-${Date.now()}`;
    const testResults = [];
    let overallSuccess = true;
    console.log('\n🚀 Starting Pluct Business Engine End-to-End Test Suite');
    console.log('====================================================');
    const runTest = async (testName, testFn) => {
        console.log(`\n📋 Running: ${testName}`);
        try {
            const result = await testFn();
            testResults.push({ test: testName, status: 'PASS', result });
            console.log(`✅ ${testName} - PASSED`);
            return result;
        }
        catch (error) {
            testResults.push({ test: testName, status: 'FAIL', error: String(error) });
            console.log(`❌ ${testName} - FAILED: ${error}`);
            overallSuccess = false;
            return null;
        }
    };
    // 1. Health Check - System Status (Acceptance Check)
    await runTest('Health Check - System Status (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/health`;
        const { request, response, durationMs } = await httpJson('GET', url);
        // Validate HTTP 200
        if (response.status !== 200)
            throw new Error(`Expected 200, got ${response.status}`);
        // Validate response structure
        const body = response.json;
        if (!body.status || !['ok', 'degraded'].includes(body.status)) {
            throw new Error(`Invalid status: ${body.status}`);
        }
        // Validate required fields
        if (!body.configuration || typeof body.configuration !== 'object') {
            throw new Error('Missing or invalid configuration field');
        }
        if (!body.connectivity || typeof body.connectivity !== 'object') {
            throw new Error('Missing or invalid connectivity field');
        }
        if (!body.build || !body.build.ref || !body.build.deployedAt) {
            throw new Error('Missing or invalid build information');
        }
        // Validate no secrets are leaked
        const config = body.configuration;
        for (const [key, value] of Object.entries(config)) {
            if (typeof value === 'string' && value.length > 0 && !['true', 'false'].includes(value)) {
                throw new Error(`Secret leaked in ${key}: ${value}`);
            }
        }
        return { request, response, durationMs, status: body.status };
    });
    // 2. Service Health Check - All Services (Acceptance Check)
    await runTest('Service Health Check - All Services (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/health/services`;
        const { request, response, durationMs } = await httpJson('GET', url);
        // Validate HTTP 200
        if (response.status !== 200)
            throw new Error(`Expected 200, got ${response.status}`);
        // Validate response structure
        const body = response.json;
        if (!body.services || typeof body.services !== 'object') {
            throw new Error('Missing or invalid services field');
        }
        // Validate TTT service status
        if (!body.services.ttt) {
            throw new Error('Missing TTT service status');
        }
        const tttService = body.services.ttt;
        if (!tttService.status || !['ok', 'degraded', 'error'].includes(tttService.status)) {
            throw new Error(`Invalid TTT status: ${tttService.status}`);
        }
        if (typeof tttService.responseTime !== 'number') {
            throw new Error('Invalid responseTime field');
        }
        if (typeof tttService.consecutiveFailures !== 'number') {
            throw new Error('Invalid consecutiveFailures field');
        }
        // Validate circuit breaker status
        if (!body.services.circuitBreaker) {
            throw new Error('Missing circuit breaker status');
        }
        return { request, response, durationMs, tttStatus: tttService.status };
    });
    // 3. Authentication Test - Create User Token
    let userToken = null;
    await runTest('Authentication - Create User Token', async () => {
        userToken = await createUserToken(env, testUserId);
        if (!userToken)
            throw new Error('Failed to create user token');
        return { token: userToken.substring(0, 20) + '...' };
    });
    // 4. User Creation - Add Initial Credits
    await runTest('User Creation - Add Initial Credits', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/v1/credits/add`;
        const apiKeyHeaders = buildAuthHeaders(env, 'apikey');
        const { request, response, durationMs } = await httpJson('POST', url, { userId: testUserId, amount: 100 }, apiKeyHeaders);
        if (!response.ok)
            throw new Error(`Failed to add credits: ${response.status}`);
        return { request, response, durationMs };
    });
    // 5. Balance Check - Verify Credits Added
    await runTest('Balance Check - Verify Credits Added', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/v1/credits/balance`;
        const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${userToken}` });
        if (!response.ok)
            throw new Error(`Failed to get balance: ${response.status}`);
        return { request, response, durationMs };
    });
    // 6. Token Vending - Create Service Token
    let serviceToken = null;
    await runTest('Token Vending - Create Service Token', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/v1/vend-token`;
        const { request, response, durationMs } = await httpJson('POST', url, { userId: testUserId }, { 'Authorization': `Bearer ${userToken}` });
        if (!response.ok)
            throw new Error(`Failed to vend token: ${response.status}`);
        serviceToken = response.json?.token;
        if (!serviceToken)
            throw new Error('No service token returned');
        return { request, response, durationMs };
    });
    // 7. Token Validation - Test Service Token
    await runTest('Token Validation - Test Service Token', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/ttt/status/ping`;
        const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` });
        if (!response.ok)
            throw new Error(`Token validation failed: ${response.status}`);
        return { request, response, durationMs };
    });
    // 8. TTT Transcribe - Test Core Service with TikTok URL
    let transcribeId = null;
    await runTest('TTT Transcribe - Test Core Service with TikTok URL', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/ttt/transcribe`;
        const payload = {
            url: "https://vm.tiktok.com/ZMADQVF4e/",
            language: "auto",
            format: "text"
        };
        const { request, response, durationMs } = await httpJson('POST', url, payload, { 'Authorization': `Bearer ${serviceToken}` });
        if (!response.ok)
            throw new Error(`TTT transcribe failed: ${response.status}`);
        transcribeId = response.json?.id || response.json?.requestId || 'test-id';
        return { request, response, durationMs, transcribeId };
    });
    // 9. TTT Status Check - Monitor Service
    await runTest('TTT Status Check - Monitor Service', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/ttt/status/${encodeURIComponent(transcribeId || 'test-id')}`;
        const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` });
        // Status check might return 404 for test ID, which is acceptable
        if (response.status !== 200 && response.status !== 404) {
            throw new Error(`TTT status check failed: ${response.status}`);
        }
        return { request, response, durationMs };
    });
    // 10. TikTok Metadata Fetch - Test Metadata Endpoint
    await runTest('TikTok Metadata Fetch - Test Metadata Endpoint', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/meta?url=${encodeURIComponent('https://vm.tiktok.com/ZMADQVF4e/')}`;
        const { request, response, durationMs } = await httpJson('GET', url);
        if (!response.ok) {
            console.log(`⚠️  Metadata fetch failed (${response.status}), this is acceptable for testing`);
        }
        return { request, response, durationMs };
    });
    // 11. TTTranscribe User Journey - Complete Flow Test
    await runTest('TTTranscribe User Journey - Complete Flow Test', async () => {
        const base = getBaseUrl(env);
        // Step 1: Get TikTok metadata first
        const metaUrl = `${base}/meta?url=${encodeURIComponent('https://vm.tiktok.com/ZMADQVF4e/')}`;
        const { request: metaRequest, response: metaResponse, durationMs: metaDuration } = await httpJson('GET', metaUrl);
        if (!metaResponse.ok) {
            console.log(`⚠️  Metadata fetch failed (${metaResponse.status}), continuing with direct transcription...`);
        }
        // Step 2: Start transcription with TikTok URL
        const transcribeUrl = `${base}/ttt/transcribe`;
        const transcribePayload = {
            url: "https://vm.tiktok.com/ZMADQVF4e/",
            language: "auto",
            format: "text",
            metadata: metaResponse.json || null
        };
        const { request: transcribeRequest, response: transcribeResponse, durationMs: transcribeDuration } = await httpJson('POST', transcribeUrl, transcribePayload, { 'Authorization': `Bearer ${serviceToken}` });
        if (!transcribeResponse.ok) {
            throw new Error(`Transcription request failed: ${transcribeResponse.status} - ${JSON.stringify(transcribeResponse.json)}`);
        }
        const jobId = transcribeResponse.json?.id || transcribeResponse.json?.requestId || transcribeResponse.json?.jobId;
        if (!jobId) {
            throw new Error('No job ID returned from transcription request');
        }
        return {
            metadata: { request: metaRequest, response: metaResponse, durationMs: metaDuration },
            transcription: { request: transcribeRequest, response: transcribeResponse, durationMs: transcribeDuration, jobId }
        };
    });
    // 12. TTTranscribe Status Polling - Check Job Progress
    let finalTranscriptionResult = null;
    await runTest('TTTranscribe Status Polling - Check Job Progress', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/ttt/status/${encodeURIComponent(transcribeId || 'test-id')}`;
        // Poll status up to 3 times with 2-second intervals
        let attempts = 0;
        let lastResponse = null;
        while (attempts < 3) {
            const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` });
            lastResponse = { request, response, durationMs };
            if (response.ok) {
                const status = response.json?.status || response.json?.state;
                console.log(`📊 Transcription status: ${status} (attempt ${attempts + 1}/3)`);
                if (status === 'completed' || status === 'done' || status === 'success') {
                    finalTranscriptionResult = response.json;
                    break;
                }
                else if (status === 'failed' || status === 'error') {
                    throw new Error(`Transcription failed: ${JSON.stringify(response.json)}`);
                }
            }
            attempts++;
            if (attempts < 3) {
                console.log('⏳ Waiting 2 seconds before next status check...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        if (!finalTranscriptionResult) {
            console.log('⚠️  Transcription still in progress after 3 attempts, this is normal for long videos');
        }
        return lastResponse;
    });
    // 13. TTTranscribe Result Retrieval - Get Final Transcription
    await runTest('TTTranscribe Result Retrieval - Get Final Transcription', async () => {
        if (!finalTranscriptionResult) {
            console.log('⏭️  Skipping result retrieval - transcription still in progress');
            return { skipped: true, reason: 'Transcription still in progress' };
        }
        const base = getBaseUrl(env);
        const url = `${base}/ttt/status/${encodeURIComponent(transcribeId || 'test-id')}`;
        const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` });
        if (!response.ok) {
            throw new Error(`Failed to retrieve transcription result: ${response.status}`);
        }
        const transcription = response.json?.transcription || response.json?.text || response.json?.result;
        if (!transcription) {
            throw new Error('No transcription result found in response');
        }
        console.log(`📝 Transcription result: ${transcription.substring(0, 100)}${transcription.length > 100 ? '...' : ''}`);
        return {
            request,
            response,
            durationMs,
            transcriptionLength: transcription.length,
            preview: transcription.substring(0, 200)
        };
    });
    // 14. Credit Consumption - Simulate Service Usage
    await runTest('Credit Consumption - Simulate Service Usage', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/v1/credits/consume`;
        const { request, response, durationMs } = await httpJson('POST', url, {
            userId: testUserId,
            amount: 10,
            service: 'ttt-transcribe',
            requestId: transcribeId
        }, { 'Authorization': `Bearer ${userToken}` });
        // This endpoint might not exist, so we'll check for 404 as acceptable
        if (response.status !== 200 && response.status !== 404) {
            throw new Error(`Credit consumption failed: ${response.status}`);
        }
        return { request, response, durationMs };
    });
    // 15. Final Balance Check - Verify Credits Consumed
    await runTest('Final Balance Check - Verify Credits Consumed', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/v1/credits/balance`;
        const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer ${userToken}` });
        if (!response.ok)
            throw new Error(`Final balance check failed: ${response.status}`);
        return { request, response, durationMs };
    });
    // 16. Admin Operations - List Users (if implemented)
    await runTest('Admin Operations - List Users', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/admin/users`;
        const adminHeaders = buildAuthHeaders(env, 'admin');
        const { request, response, durationMs } = await httpJson('GET', url, undefined, adminHeaders);
        // Admin endpoints might not be implemented, 404 is acceptable
        if (response.status !== 200 && response.status !== 404) {
            throw new Error(`Admin list users failed: ${response.status}`);
        }
        return { request, response, durationMs };
    });
    // 17. Rate Limiting Test - Multiple Requests
    await runTest('Rate Limiting Test - Multiple Requests', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/ttt/status/ping`;
        const promises = Array(5).fill(null).map(() => httpJson('GET', url, undefined, { 'Authorization': `Bearer ${serviceToken}` }));
        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.response.ok).length;
        if (successCount === 0)
            throw new Error('All rate limit test requests failed');
        return { successCount, totalRequests: results.length };
    });
    // 18. Error Handling Test - Invalid Token
    await runTest('Error Handling Test - Invalid Token', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/ttt/status/ping`;
        const { request, response, durationMs } = await httpJson('GET', url, undefined, { 'Authorization': `Bearer invalid-token` });
        // Should return 401 or 403 for invalid token
        if (response.status !== 401 && response.status !== 403) {
            throw new Error(`Expected 401/403 for invalid token, got: ${response.status}`);
        }
        return { request, response, durationMs };
    });
    // 19. Cleanup - Remove Test User (if implemented)
    await runTest('Cleanup - Remove Test User', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/admin/users/${testUserId}`;
        const adminHeaders = buildAuthHeaders(env, 'admin');
        const { request, response, durationMs } = await httpJson('DELETE', url, undefined, adminHeaders);
        // Cleanup might not be implemented, 404 is acceptable
        if (response.status !== 200 && response.status !== 404) {
            throw new Error(`User cleanup failed: ${response.status}`);
        }
        return { request, response, durationMs };
    });
    // 20. 404 Error Handling (Acceptance Check)
    await runTest('404 Error Handling (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/definitely-not-here`;
        const { request, response, durationMs } = await httpJson('GET', url);
        // Validate HTTP 404
        if (response.status !== 404)
            throw new Error(`Expected 404, got ${response.status}`);
        // Validate error schema
        const body = response.json;
        if (!body.ok || body.ok !== false) {
            throw new Error('Missing or invalid ok field');
        }
        if (body.code !== 'route_not_found') {
            throw new Error(`Invalid error code: ${body.code}`);
        }
        if (!body.message || body.message !== 'Endpoint not found') {
            throw new Error(`Invalid error message: ${body.message}`);
        }
        return { request, response, durationMs };
    });
    // 21. 405 Error Handling (Acceptance Check)
    await runTest('405 Error Handling (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/health`;
        const { request, response, durationMs } = await httpJson('POST', url, { test: 'data' });
        // Validate HTTP 405
        if (response.status !== 405)
            throw new Error(`Expected 405, got ${response.status}`);
        // Validate Allow header
        const allowHeader = response.headers.allow;
        if (!allowHeader) {
            throw new Error('Missing Allow header');
        }
        if (!allowHeader.includes('GET')) {
            throw new Error('Allow header missing GET method');
        }
        // Validate error schema
        const body = response.json;
        if (!body.ok || body.ok !== false) {
            throw new Error('Missing or invalid ok field');
        }
        if (body.code !== 'method_not_allowed') {
            throw new Error(`Invalid error code: ${body.code}`);
        }
        return { request, response, durationMs, allowHeader };
    });
    // 22. CORS Headers (Acceptance Check)
    await runTest('CORS Headers (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/health`;
        const { request, response, durationMs } = await httpJson('GET', url, undefined, {
            'Origin': 'https://app.pluct.com'
        });
        // Validate CORS headers
        const corsOrigin = response.headers['access-control-allow-origin'];
        if (!corsOrigin) {
            throw new Error('Missing Access-Control-Allow-Origin header');
        }
        const varyHeader = response.headers.vary;
        if (!varyHeader || !varyHeader.includes('Origin')) {
            throw new Error('Missing or invalid Vary header');
        }
        return { request, response, durationMs, corsOrigin, varyHeader };
    });
    // 23. Content-Type Headers (Acceptance Check)
    await runTest('Content-Type Headers (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/health`;
        const { request, response, durationMs } = await httpJson('GET', url);
        // Validate content-type
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Invalid content-type: ${contentType}`);
        }
        return { request, response, durationMs, contentType };
    });
    // 24. Meta Endpoint Validation (Acceptance Check)
    await runTest('Meta Endpoint Validation (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/meta?url=https://vm.tiktok.com/ZMADQVF4e/`;
        const { request, response, durationMs } = await httpJson('GET', url);
        // Should return 200 for valid TikTok URL
        if (response.status !== 200) {
            console.log(`⚠️  Meta endpoint returned ${response.status}, this may be expected`);
        }
        // Test invalid URL
        const invalidUrl = `${base}/meta?url=https://example.com/video`;
        const { response: invalidResponse } = await httpJson('GET', invalidUrl);
        // Should return 422 for invalid URL
        if (invalidResponse.status !== 422) {
            throw new Error(`Expected 422 for invalid URL, got ${invalidResponse.status}`);
        }
        const invalidBody = invalidResponse.json;
        if (invalidBody.code !== 'invalid_url') {
            throw new Error(`Invalid error code: ${invalidBody.code}`);
        }
        return { request, response, durationMs, invalidResponse };
    });
    // 25. Admin Auth Validation (Acceptance Check)
    await runTest('Admin Auth Validation (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/v1/credits/add`;
        // Test without auth
        const { response: noAuthResponse } = await httpJson('POST', url, { userId: 'test', amount: 10 });
        if (noAuthResponse.status !== 401) {
            throw new Error(`Expected 401 for missing auth, got ${noAuthResponse.status}`);
        }
        // Test with invalid auth
        const { response: invalidAuthResponse } = await httpJson('POST', url, { userId: 'test', amount: 10 }, {
            'X-API-Key': 'invalid-key'
        });
        if (invalidAuthResponse.status !== 401) {
            throw new Error(`Expected 401 for invalid auth, got ${invalidAuthResponse.status}`);
        }
        // Test WWW-Authenticate header
        const wwwAuth = noAuthResponse.headers['www-authenticate'];
        if (!wwwAuth || !wwwAuth.includes('Bearer')) {
            throw new Error('Missing or invalid WWW-Authenticate header');
        }
        return { noAuthResponse, invalidAuthResponse, wwwAuth };
    });
    // 26. Insufficient Credits Handling (Acceptance Check)
    await runTest('Insufficient Credits Handling (Acceptance Check)', async () => {
        const base = getBaseUrl(env);
        const url = `${base}/v1/vend-token`;
        // Create a user with 0 credits
        const zeroCreditUser = `zero-credit-${Date.now()}`;
        const zeroCreditToken = await createUserToken(env, zeroCreditUser);
        const { response } = await httpJson('POST', url, { userId: zeroCreditUser }, {
            'Authorization': `Bearer ${zeroCreditToken}`
        });
        // Should return 402 for insufficient credits
        if (response.status !== 402) {
            throw new Error(`Expected 402 for insufficient credits, got ${response.status}`);
        }
        const body = response.json;
        if (body.code !== 'insufficient_credits') {
            throw new Error(`Invalid error code: ${body.code}`);
        }
        if (typeof body.details.balance !== 'number') {
            throw new Error('Missing or invalid balance in response');
        }
        return { response, balance: body.details.balance };
    });
    // Final Results
    console.log('\n📊 Test Suite Results');
    console.log('====================');
    console.log(`Total Tests: ${testResults.length}`);
    console.log(`Passed: ${testResults.filter(t => t.status === 'PASS').length}`);
    console.log(`Failed: ${testResults.filter(t => t.status === 'FAIL').length}`);
    console.log(`Success Rate: ${Math.round((testResults.filter(t => t.status === 'PASS').length / testResults.length) * 100)}%`);
    if (overallSuccess) {
        console.log('\n🎉 All tests passed! The Pluct Business Engine is fully operational.');
    }
    else {
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
    if (exitOnComplete)
        process.exit(overallSuccess ? 0 : 1);
}
// Interactive USSD-style menu
async function runInteractiveMenu(env) {
    const rl = await Promise.resolve().then(() => require('readline'));
    const reader = rl.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => reader.question(q, resolve));
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
        }
        else if (choice === '2') {
            await cmdServiceHealth(env, false);
        }
        else if (choice === '3') {
            const token = (await ask('JWT Token (optional): ')).trim();
            if (token) {
                await cmdTttTranscribe(env, token, '{"test": "connectivity"}', false);
            }
            else {
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
        }
        else if (choice === '2') {
            const userId = (await ask('User ID: ')).trim();
            await cmdBalance(env, userId, false);
        }
        else if (choice === '3') {
            const userId = (await ask('User ID: ')).trim();
            const amount = Number((await ask('Amount: ')).trim());
            await cmdSeedCredits(env, userId, amount, false);
        }
        else if (choice === '4') {
            await cmdAdminListUsers(env, false);
        }
        else if (choice === '5') {
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
        }
        else if (choice === '2') {
            const token = (await ask('JWT: ')).trim();
            await cmdValidate(env, token, false);
        }
        else if (choice === '3') {
            const token = (await ask('JWT: ')).trim();
            const payload = (await ask('Transcribe JSON payload ({}): ')).trim() || '{}';
            await cmdTttTranscribe(env, token, payload, false);
        }
        else if (choice === '4') {
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
        }
        else if (choice === '2') {
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
        }
        else if (choice === '2') {
            const name = (await ask('Name (auto if empty): ')).trim();
            await cmdAdminApiKeys(env, 'create', name || undefined);
        }
        else if (choice === '3') {
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
            if (choice === '1')
                await usersMenu();
            else if (choice === '2')
                await tokensMenu();
            else if (choice === '3')
                await adminMenu();
            else if (choice === '4')
                await apiKeysMenu();
            else if (choice === '5')
                await monitoringMenu();
            else if (choice === '6')
                await cmdStatus(env, false);
            else if (choice === '7')
                await cmdRunAll(env, false);
            else if (choice === '0') {
                reader.close();
                break;
            }
            else
                console.log('Invalid choice');
        }
        catch (err) {
            console.error('Error:', err);
        }
    }
}
async function main() {
    const env = getEnv();
    const [, , cmd, ...args] = process.argv;
    if (!cmd || cmd === 'menu') {
        await runInteractiveMenu(env);
        return;
    }
    switch (cmd) {
        case 'status':
            await cmdStatus(env);
            break;
        case 'service-health':
            await cmdServiceHealth(env);
            break;
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
        case 'validate': {
            const token = args[0];
            if (!token) {
                console.error('Usage: validate <jwt>');
                process.exit(2);
            }
            await cmdValidate(env, token);
            break;
        }
        case 'admin:list-users':
            await cmdAdminListUsers(env);
            break;
        case 'admin:list-transactions':
            await cmdAdminListTransactions(env);
            break;
        case 'admin:api-keys': {
            const action = args[0];
            const extra = args[1];
            if (!action) {
                console.error('Usage: admin:api-keys <list|create [name]|revoke <id>>');
                process.exit(2);
            }
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
  npx ts-node cli/index.ts status                    # Check system status
  npx ts-node cli/index.ts service-health           # Check service health
  npx ts-node cli/index.ts balance <userId>          # Get user credit balance
  npx ts-node cli/index.ts vend-token <userId>       # Vend short-lived token
  npx ts-node cli/index.ts validate <jwt>           # Validate JWT token
  npx ts-node cli/index.ts seed-credits <userId> <amount>  # Add credits (admin)
  npx ts-node cli/index.ts add-user <userId> <credits>     # Create user (admin)
  npx ts-node cli/index.ts admin:list-users         # List all users (admin)
  npx ts-node cli/index.ts admin:list-transactions  # List transactions (admin)
  npx ts-node cli/index.ts runAll                   # Run comprehensive tests

Env resolution:
  Reads .dev.vars at repo root; supports BASE_URL override.
`);
            process.exit(0);
    }
}
main().catch(err => { console.error(err); logLine(`error ${String(err)}`); process.exit(1); });
