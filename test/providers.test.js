import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS, openai, anthropic, typesafe, normalizeProvider, checkKeyFormat, describeRoute, requestFor, createKeyTest,
} from '../src/core/providers.js';
import { createKeyStore, maskKey } from '../src/core/key-store.js';

test('built-in descriptors have the documented modes', () => {
  assert.equal(openai.mode, 'direct');
  assert.equal(anthropic.mode, 'direct');
  assert.equal(typesafe.mode, 'relay');
  assert.equal(typesafe.relayPath, '/api/typesafe');
  assert.deepEqual(Object.keys(PROVIDERS), ['openai', 'anthropic', 'typesafe']);
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
  const r = describeRoute(typesafe, 'https://demo.test');
  assert.equal(r.kind, 'relay');
  assert.equal(r.url, 'https://demo.test/api/typesafe');
  assert.match(r.text, /https:\/\/demo\.test\/api\/typesafe/);
  assert.match(r.text, /stores nothing/);
  assert.match(r.text, /api\.typesafe\.ai/);
});

test('relay requests go to the relay origin, direct requests to the provider', () => {
  assert.equal(requestFor(typesafe, 'k'.repeat(20), '/v1/systemone', 'https://demo.test').url, 'https://demo.test/api/typesafe/v1/systemone');
  assert.equal(requestFor(openai, 'sk-' + 'a'.repeat(20), '/v1/models').url, 'https://api.openai.com/v1/models');
  assert.equal(requestFor(typesafe, 'k'.repeat(20), '/x', '').headers.authorization, 'Bearer ' + 'k'.repeat(20));
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
