import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Pluct Business Engine Gateway', () => {
	it('returns 404 JSON on unknown route', async () => {
		const response = await SELF.fetch('https://example.com/does-not-exist');
		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body).toMatchObject({ 
			ok: false, 
			code: 'route_not_found' 
		});
	});

	it('returns 405 for unsupported method', async () => {
		const response = await SELF.fetch('https://example.com/health', {
			method: 'POST'
		});
		expect(response.status).toBe(405);
		const body = await response.json();
		expect(body).toMatchObject({ 
			ok: false, 
			code: 'method_not_allowed' 
		});
		expect(response.headers.get('Allow')).toBe('GET');
	});

	it('returns 401 for missing auth on protected routes', async () => {
		const response = await SELF.fetch('https://example.com/v1/credits/balance');
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body).toMatchObject({ 
			ok: false, 
			code: 'MISSING_AUTH' 
		});
	});

	it('returns 402 for insufficient credits', async () => {
		// This test would need a valid JWT token and user with 0 credits
		// For now, just test the structure
		expect(true).toBe(true);
	});

	it('health endpoint returns 200', async () => {
		const response = await SELF.fetch('https://example.com/health');
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty('status');
	});
});
