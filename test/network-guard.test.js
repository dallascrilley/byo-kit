import test from 'node:test';
import assert from 'node:assert/strict';
import { countNetworkCalls } from '../src/core/network-guard.js';

function fakeEnv() {
  const sent = [];
  class XHR {
    open(method, url) {
      this.url = url;
    }
    send() {
      sent.push(this.url);
    }
  }
  const env = {
    location: { href: 'https://demo.test/app/' },
    fetch: async (input) => {
      sent.push(String(input));
      return { ok: true };
    },
    XMLHttpRequest: XHR,
    navigator: { sendBeacon: (url) => (sent.push(url), true) },
  };
  return { env, sent };
}

test('reports zero when nothing touches the network', async () => {
  const { env } = fakeEnv();
  const out = await countNetworkCalls(() => 1 + 1, env);
  assert.deepEqual(out, { result: 2, count: 0, calls: [] });
});

test('counts fetch, XHR and beacon, and still performs the calls', async () => {
  const { env, sent } = fakeEnv();
  const out = await countNetworkCalls(async () => {
    await env.fetch('/a?secret=1#h');
    const x = new env.XMLHttpRequest();
    x.open('GET', 'https://other.test/x');
    x.send();
    env.navigator.sendBeacon('/beacon', 'data');
    return 'done';
  }, env);
  assert.equal(out.count, 3);
  assert.deepEqual(out.calls.map((c) => c.kind), ['fetch', 'xhr', 'beacon']);
  assert.equal(out.calls[0].url, 'https://demo.test/a'); // query and hash dropped
  assert.equal(sent.length, 3);
});

test('restores the originals, even when the callback throws', async () => {
  const { env } = fakeEnv();
  const f = env.fetch;
  const send = env.XMLHttpRequest.prototype.send;
  const beacon = env.navigator.sendBeacon;
  await assert.rejects(countNetworkCalls(() => { throw new Error('boom'); }, env), /boom/);
  assert.equal(env.fetch, f);
  assert.equal(env.XMLHttpRequest.prototype.send, send);
  assert.equal(env.navigator.sendBeacon, beacon);
});

test('works when an environment lacks some APIs', async () => {
  const out = await countNetworkCalls(() => 'ok', {});
  assert.equal(out.count, 0);
});
