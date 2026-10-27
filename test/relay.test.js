import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../relay/index.js';

const ORIGIN = 'https://demo.test';

function setup(overrides = {}) {
  const calls = [];
  const upstream = overrides.upstream || (async (url, init) => {
    calls.push({ url, init });
    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'a=b', 'access-control-allow-origin': '*', 'x-request-id': 'r1' },
    });
  });
  const relay = createRelay({
    allowedOrigins: overrides.allowedOrigins ?? [],
    fetch: upstream,
    routes: overrides.routes || {
      '/api/typesafe': {
        upstream: 'https://api.typesafe.ai',
        methods: ['GET', 'POST'],
        allowPaths: ['/v1/'],
        headers: ['x-extra'],
        maxBodyBytes: 100,
        timeoutMs: overrides.timeoutMs ?? 1000,
      },
    },
  });
  return { relay, calls };
}

const req = (path, init = {}) => new Request(ORIGIN + path, init);

test('forwards to the upstream URL with only allowlisted headers and no cookies', async () => {
  const { relay, calls } = setup();
  const res = await relay(req('/api/typesafe/v1/systemone?x=1', {
    method: 'POST',
    headers: {
      origin: ORIGIN, authorization: 'Bearer k', 'content-type': 'application/json', cookie: 'sid=1',
      'x-extra': 'yes', 'x-other': 'no', referer: 'https://demo.test/p',
    },
    body: '{"a":1}',
  }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.typesafe.ai/v1/systemone?x=1');
  const sent = Object.fromEntries(calls[0].init.headers.entries());
  assert.deepEqual(sent, { authorization: 'Bearer k', 'content-type': 'application/json', 'x-extra': 'yes' });
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(Buffer.from(calls[0].init.body).toString(), '{"a":1}');
});

test('passes upstream status and body through, drops cookies and upstream CORS', async () => {
  const { relay } = setup();
  const res = await relay(req('/api/typesafe/v1/models', { headers: { origin: ORIGIN } }));
  assert.equal(await res.text(), '{"ok":true}');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('x-request-id'), 'r1');
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN); // ours, not "*"
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('upstream error statuses pass through unchanged', async () => {
  const { relay } = setup({ upstream: async () => new Response('{"error":"bad key"}', { status: 401 }) });
  const res = await relay(req('/api/typesafe/v1/models'));
  assert.equal(res.status, 401);
  assert.equal(await res.text(), '{"error":"bad key"}');
});

test('CORS: same origin and listed origins get headers; others are refused', async () => {
  const { relay, calls } = setup({ allowedOrigins: ['https://friend.test'] });
  const friend = await relay(req('/api/typesafe/v1/models', { headers: { origin: 'https://friend.test' } }));
  assert.equal(friend.status, 200);
  assert.equal(friend.headers.get('access-control-allow-origin'), 'https://friend.test');
  assert.equal(friend.headers.get('vary'), 'Origin');
  const evil = await relay(req('/api/typesafe/v1/models', { headers: { origin: 'https://evil.test' } }));
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  assert.equal(calls.length, 1); // the refused request never reached the upstream
});

test('default is same origin only', async () => {
  const { relay } = setup();
  const res = await relay(req('/api/typesafe/v1/models', { headers: { origin: 'https://friend.test' } }));
  assert.equal(res.status, 403);
});

test('OPTIONS preflight: allowed origin gets methods and headers, others do not', async () => {
  const { relay, calls } = setup({ allowedOrigins: ['https://friend.test'] });
  const ok = await relay(req('/api/typesafe/v1/systemone', { method: 'OPTIONS', headers: { origin: 'https://friend.test' } }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://friend.test');
  assert.equal(ok.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(ok.headers.get('access-control-allow-headers'), 'authorization, content-type, x-extra');
  const no = await relay(req('/api/typesafe/v1/systemone', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }));
  assert.equal(no.status, 403);
  assert.equal(calls.length, 0);
});

test('methods outside the route list get 405', async () => {
  const { relay } = setup();
  const res = await relay(req('/api/typesafe/v1/models', { method: 'DELETE' }));
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, POST');
});

test('unknown routes get 404 and matches() agrees', async () => {
  const { relay } = setup();
  assert.equal((await relay(req('/other'))).status, 404);
  assert.equal((await relay(req('/api/typesafe-evil/v1/models'))).status, 404);
  assert.equal(relay.matches(req('/api/typesafe/v1/x')), true);
  assert.equal(relay.matches(req('/api/typesafe-evil/v1/x')), false);
  assert.equal(relay.matches(ORIGIN + '/index.html'), false);
});

test('path allowlist and traversal are enforced', async () => {
  const { relay, calls } = setup();
  assert.equal((await relay(req('/api/typesafe/admin/users'))).status, 403);
  // The URL parser resolves dot segments first, so these leave the route entirely.
  assert.equal((await relay(req('/api/typesafe/v1/../admin'))).status, 403); // becomes /api/typesafe/admin: outside allowPaths
  assert.equal((await relay(req('/api/typesafe/%2e%2e/admin'))).status, 404);
  // Encoded dots and slashes are refused rather than forwarded.
  assert.equal((await relay(req('/api/typesafe/v1/..%2f..%2fadmin'))).status, 400);
  assert.equal((await relay(req('/api/typesafe/v1/%2e%2e/x'))).status, 403); // parser resolves it to /api/typesafe/x, outside allowPaths
  assert.equal(calls.length, 0);
});

test('upstream host cannot be changed through the path', async () => {
  const { relay, calls } = setup({ routes: { '/r': { upstream: 'https://api.typesafe.ai/base', methods: ['GET'] } } });
  const res = await relay(req('/r//evil.test/x'));
  assert.equal(calls.length === 0 || new URL(calls[0].url).host === 'api.typesafe.ai', true);
  assert.ok([200, 403].includes(res.status));
  const up = await relay(req('/r/v1/ok'));
  assert.equal(up.status, 200);
  assert.equal(calls.at(-1).url, 'https://api.typesafe.ai/base/v1/ok');
});

test('body size limit: declared length and streamed length', async () => {
  const { relay, calls } = setup();
  const big = 'x'.repeat(101);
  const declared = await relay(req('/api/typesafe/v1/systemone', { method: 'POST', headers: { 'content-length': '101' }, body: big }));
  assert.equal(declared.status, 413);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const streamed = await relay(new Request(ORIGIN + '/api/typesafe/v1/systemone', { method: 'POST', body: stream, duplex: 'half' }));
  assert.equal(streamed.status, 413);
  assert.equal(calls.length, 0);
  const fine = await relay(req('/api/typesafe/v1/systemone', { method: 'POST', body: 'x'.repeat(100) }));
  assert.equal(fine.status, 200);
});

test('timeout returns 504 and aborts the upstream call', async () => {
  let aborted = false;
  const slow = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  });
  const { relay } = setup({ upstream: slow, timeoutMs: 20 });
  const res = await relay(req('/api/typesafe/v1/models'));
  assert.equal(res.status, 504);
  assert.equal(aborted, true);
});

test('network failure returns 502; upstream redirects are refused', async () => {
  const down = setup({ upstream: async () => { throw new Error('down'); } });
  assert.equal((await down.relay(req('/api/typesafe/v1/models'))).status, 502);
  const redirect = setup({ upstream: async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }) });
  const res = await redirect.relay(req('/api/typesafe/v1/models'));
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('location'), null);
});

test('never writes to the console', async () => {
  const names = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const originals = names.map((n) => console[n]);
  let writes = 0;
  for (const n of names) console[n] = () => { writes++; };
  try {
    const { relay } = setup();
    await relay(req('/api/typesafe/v1/systemone', { method: 'POST', headers: { authorization: 'Bearer secret' }, body: 'secret-body' }));
    await relay(req('/api/typesafe/nope'));
    await relay(req('/api/typesafe/v1/x', { method: 'PUT' }));
  } finally {
    names.forEach((n, i) => { console[n] = originals[i]; });
  }
  assert.equal(writes, 0);
});

test('configuration mistakes fail at creation time', () => {
  const route = { upstream: 'https://x.test' };
  assert.throws(() => createRelay({ routes: {} }), /at least one route/);
  assert.throws(() => createRelay({ routes: { '/': route } }), /whole site/);
  assert.throws(() => createRelay({ routes: { api: route } }), /start with/);
  assert.throws(() => createRelay({ routes: { '/a': { upstream: 'http://x.test' } } }), /https/);
  assert.throws(() => createRelay({ routes: { '/a': { ...route, headers: ['Cookie'] } } }), /cookie/);
  assert.throws(() => createRelay({ routes: { '/a': route }, allowedOrigins: ['*'] }), /cannot contain/);
  assert.doesNotThrow(() => createRelay({ routes: { '/a': { upstream: 'http://localhost:9999' } } }));
});

test('longest matching route wins', async () => {
  const calls = [];
  const relay = createRelay({
    fetch: async (url) => (calls.push(url), new Response('ok')),
    routes: { '/api': { upstream: 'https://a.test', methods: ['GET'] }, '/api/special': { upstream: 'https://b.test', methods: ['GET'] } },
  });
  await relay(req('/api/special/x'));
  await relay(req('/api/other'));
  assert.deepEqual(calls, ['https://b.test/x', 'https://a.test/other']);
});
