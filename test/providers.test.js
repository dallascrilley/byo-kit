import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS, openrouter, openai, anthropic, normalizeProvider, checkKeyFormat, describeRoute, requestFor, createKeyTest,
} from '../src/core/providers.js';
import { createKeyStore, maskKey } from '../src/core/key-store.js';

// A made-up provider that sends no CORS headers, for the relay-mode tests.
const acme = {
  id: 'acme', label: 'Acme', mode: 'relay', endpoint: 'https://api.acme.example', relayPath: '/api/acme',
  auth: { header: 'authorization', prefix: 'Bearer ' },
};

test('built-in descriptors are direct, with OpenRouter first', () => {
  for (const p of Object.values(PROVIDERS)) assert.equal(p.mode, 'direct', p.id);
  assert.deepEqual(Object.keys(PROVIDERS), ['openrouter', 'openai', 'anthropic']);
});

test('openrouter descriptor: endpoint, key test path, key shape and note', () => {
  const p = normalizeProvider(openrouter);
  assert.equal(p.endpoint, 'https://openrouter.ai');
  assert.equal(p.testPath, '/api/v1/key');
  assert.equal(p.docsUrl, 'https://openrouter.ai/settings/keys');
  assert.deepEqual(p.auth, { header: 'authorization', prefix: 'Bearer ' });
  assert.match(p.note, /small credit limit/);
  assert.equal(checkKeyFormat(p, 'sk-or-v1-' + 'a1b2c3d4'.repeat(8)), null);
  assert.match(checkKeyFormat(p, 'sk-or-v1-' + 'a'.repeat(63)), /does not match the OpenRouter key format/);
  assert.match(checkKeyFormat(p, 'sk-or-v1-' + 'g'.repeat(64)), /does not match/);
  assert.match(checkKeyFormat(p, 'sk-' + 'a'.repeat(64)), /does not match/);
  assert.match(describeRoute(p).text, /straight from your browser to openrouter\.ai/);
});

test('openrouter key test calls GET /api/v1/key with the bearer key', async () => {
  const seen = [];
  const key = 'sk-or-v1-' + 'ab12'.repeat(16);
  const test = createKeyTest(openrouter, { fetchImpl: async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200 }; } });
  assert.equal((await test(key)).ok, true);
  assert.equal(seen[0].url, 'https://openrouter.ai/api/v1/key');
  assert.equal(seen[0].init.method, 'GET');
  assert.equal(seen[0].init.headers.authorization, 'Bearer ' + key);
});

test('anthropic sends the browser access header and documents it', () => {
  const p = normalizeProvider(anthropic);
  assert.equal(p.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.match(p.note, /anthropic-dangerous-direct-browser-access: true/);
  const { headers } = requestFor(p, ' sk-ant-abc ', '/v1/messages');
  assert.equal(headers['x-api-key'], 'sk-ant-abc');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
});

test('key patterns accept real shapes and reject wrong ones', () => {
  assert.equal(checkKeyFormat(openai, 'sk-proj-' + 'a'.repeat(30)), null);
  assert.match(checkKeyFormat(openai, 'nope'), /does not match the/);
  assert.equal(checkKeyFormat(anthropic, 'sk-ant-api03-' + 'b'.repeat(30)), null);
  assert.match(checkKeyFormat(anthropic, 'sk-' + 'a'.repeat(30)), /does not match the/);
  assert.match(checkKeyFormat(openai, '  '), /Enter a key/);
});

test('route text: direct says straight to the provider', () => {
  const r = describeRoute(openai, 'https://demo.test');
  assert.equal(r.kind, 'direct');
  assert.match(r.text, /straight from your browser to api\.openai\.com/);
});

test('route text: relay names the origin and path and says it stores nothing', () => {
  const r = describeRoute(acme, 'https://demo.test');
  assert.equal(r.kind, 'relay');
  assert.equal(r.url, 'https://demo.test/api/acme');
  assert.match(r.text, /https:\/\/demo\.test\/api\/acme/);
  assert.match(r.text, /stores nothing/);
  assert.match(r.text, /api\.acme\.example/);
});

test('relay requests go to the relay origin, direct requests to the provider', () => {
  assert.equal(requestFor(acme, 'k'.repeat(20), '/v1/chat', 'https://demo.test').url, 'https://demo.test/api/acme/v1/chat');
  assert.equal(requestFor(openai, 'sk-' + 'a'.repeat(20), '/v1/models').url, 'https://api.openai.com/v1/models');
  assert.equal(requestFor(acme, 'k'.repeat(20), '/x', '').headers.authorization, 'Bearer ' + 'k'.repeat(20));
});

test('normalizeProvider validates the descriptor', () => {
  assert.throws(() => normalizeProvider({ id: 'x' }), /label/);
  assert.throws(() => normalizeProvider({ id: 'x', label: 'X', mode: 'odd', endpoint: 'https://x.test' }), /direct.*relay/);
  assert.throws(() => normalizeProvider({ id: 'x', label: 'X', mode: 'relay', endpoint: 'https://x.test' }), /relayPath/);
  const p = normalizeProvider({ id: 'x', label: 'X', mode: 'direct', endpoint: 'https://x.test//', keyPattern: /^x+$/ });
  assert.equal(p.endpoint, 'https://x.test');
});

test('createKeyTest maps responses to results', async () => {
  const make = (status) => createKeyTest(openai, { fetchImpl: async () => ({ ok: status < 300, status }) });
  assert.equal((await make(200)('sk-' + 'a'.repeat(20))).ok, true);
  assert.match((await make(401)('sk-' + 'a'.repeat(20))).message, /rejected the key/);
  assert.match((await make(500)('sk-' + 'a'.repeat(20))).message, /HTTP 500/);
  const down = createKeyTest(openai, { fetchImpl: async () => { throw new Error('x'); } });
  assert.match((await down('sk-' + 'a'.repeat(20))).message, /Could not reach/);
});

function fakeSession() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('key store: memory by default and writes nothing to session storage', () => {
  const session = fakeSession();
  const s = createKeyStore({ session });
  s.set('openai', 'sk-secret');
  assert.equal(s.get('openai'), 'sk-secret');
  assert.equal(session.m.size, 0);
  s.clear('openai');
  assert.equal(s.get('openai'), null);
});

test('key store: session mode uses sessionStorage only, and switching moves the key', () => {
  const session = fakeSession();
  const s = createKeyStore({ session });
  s.set('openai', 'sk-secret');
  s.setMode('session', 'openai');
  assert.equal(session.m.get('byo-kit:key:openai'), 'sk-secret');
  s.setMode('memory', 'openai');
  assert.equal(session.m.size, 0);
  assert.equal(s.get('openai'), 'sk-secret');
  s.setMode('session', 'openai');
  s.clear('openai');
  assert.equal(session.m.size, 0);
  assert.equal(s.get('openai'), null);
});

test('maskKey never shows the whole key', () => {
  assert.equal(maskKey('sk-ant-abcdefghijklmnop1234'), 'sk-…1234');
  assert.equal(maskKey('short'), '••••');
});
