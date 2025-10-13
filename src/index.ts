import { Hono } from 'hono';
import { cors } from './cors';
import { vendToken } from './auth';
import { getCredits, addCredits, spendCredit } from './credits';
import { callTTT } from './proxy';
import { resolveMeta } from './meta';
import { jwtVerify } from 'jose';

const app = new Hono();

app.use('*', cors());

app.get('/health', c => c.json({ 
  ok: true, 
  routes: ['/vend-token', '/ttt/transcribe', '/ttt/status/:id', '/meta/resolve'] 
}));

app.post('/v1/credits/add', async c => {
  if (c.req.header('X-API-Key') !== c.env.ENGINE_ADMIN_KEY) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const { userId, amount } = await c.req.json();
  await addCredits(c.env, userId, amount);
  return c.json({ ok: true });
});

app.post('/vend-token', async c => {
  const { userId } = await c.req.json();
  try {
    await spendCredit(c.env, userId);
    const token = await vendToken(c.env, userId);
    console.log(`be:vending user=${userId} ok=true`);
    return c.json({ token });
  } catch (e: any) {
    console.log(`be:vending user=${userId} ok=false reason=${e.message}`);
    return c.json({ error: 'no_credits' }, 403);
  }
});

async function verifyAppJWT(env: any, auth?: string) {
  if (!auth?.startsWith('Bearer ')) throw new Error('no_auth');
  const token = auth.slice(7);
  const key = await crypto.subtle.importKey(
    'raw', 
    new TextEncoder().encode(env.ENGINE_JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['verify']
  );
  const { payload } = await jwtVerify(token, key);
  if (payload.scope !== 'ttt:transcribe') throw new Error('bad_scope');
  return payload;
}

app.post('/ttt/transcribe', async c => {
  try { 
    await verifyAppJWT(c.env, c.req.header('Authorization')); 
  } catch { 
    return c.json({ error: 'unauthorized' }, 401); 
  }
  const body = await c.req.text();
  const r = await callTTT(c.env, '/transcribe', { 
    method: 'POST', 
    body, 
    headers: { 'content-type': 'application/json' } 
  });
  console.log(`be:ttt call=transcribe http=${r.status}`);
  return new Response(r.body, { status: r.status, headers: r.headers });
});

app.get('/ttt/status/:id', async c => {
  try { 
    await verifyAppJWT(c.env, c.req.header('Authorization')); 
  } catch { 
    return c.json({ error: 'unauthorized' }, 401); 
  }
  const r = await callTTT(c.env, `/status/${c.req.param('id')}`, { method: 'GET' });
  console.log(`be:ttt call=status http=${r.status}`);
  return new Response(r.body, { status: r.status, headers: r.headers });
});

app.post('/meta/resolve', async c => {
  const { url } = await c.req.json();
  const meta = await resolveMeta(c.env, url);
  return c.json(meta);
});

export default app;