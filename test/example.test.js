import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseText, toCsv } from '../dist/byo-kit.js';
import { validateRows, profileColumns, profileToCsv, summarizeForModel } from '../example/profile.js';
import { buildDescribeRequest, extractText, describeDataset, buildPrompt } from '../example/ai.js';

const sample = readFileSync(new URL('../example/sample.csv', import.meta.url), 'utf8');

test('profiles the bundled sample', () => {
  const rows = parseText(sample, { name: 'sample.csv' }).data;
  assert.equal(rows.length, 120);
  const by = Object.fromEntries(profileColumns(rows).map((c) => [c.name, c]));
  assert.equal(by.ticket_id.type, 'number');
  assert.equal(by.ticket_id.unique, 120);
  assert.equal(by.opened.type, 'date');
  assert.ok(by.opened.min <= by.opened.max);
  assert.equal(by.hours_to_resolve.type, 'number');
  assert.ok(by.satisfaction.missing > 0);
  assert.equal(by.channel.type, 'text');
  assert.ok(by.channel.top.length > 0 && by.channel.top[0].count >= by.channel.top.at(-1).count);
});

test('types: boolean, empty, mixed and json values', () => {
  const p = profileColumns([
    { a: 'true', b: '', c: '1', d: { x: 1 } },
    { a: 'FALSE', b: ' ', c: 'two', d: [1] },
  ]);
  assert.deepEqual(p.map((c) => c.type), ['boolean', 'empty', 'text', 'json']);
});

test('validateRows', () => {
  assert.deepEqual(validateRows([{ a: 1 }]), []);
  assert.deepEqual(validateRows({ a: 1 }), []);
  assert.match(validateRows([])[0], /no rows/);
  assert.match(validateRows([1, 2])[0], /Row 1/);
  assert.match(validateRows('x')[0], /Expected a list/);
});

test('profile CSV neutralizes formulas in column names and values', () => {
  const p = profileColumns([{ '=cmd|calc': 'a' }, { '=cmd|calc': 'a' }]);
  const csv = profileToCsv(p);
  assert.match(csv, /^column,type,/);
  assert.ok(csv.includes("'=cmd|calc"));
  assert.ok(!/\r\n=/.test(csv));
  assert.ok(toCsv([['-1+2']]).startsWith("'-1+2"));
});

test('model summary has names, types and counts but no cell values', () => {
  const rows = [{ name: 'Ada Lovelace', n: '5' }, { name: 'Alan Turing', n: '7' }, { name: 'Ada Lovelace', n: '9' }];
  const summary = summarizeForModel(profileColumns(rows), rows.length);
  const text = JSON.stringify(summary) + buildPrompt(summary);
  assert.ok(!text.includes('Lovelace') && !text.includes('Turing'));
  assert.match(text, /"name":"name"/);
});

test('request shapes per provider', () => {
  const s = { rows: 1, columns: [] };
  const a = buildDescribeRequest('anthropic', 'm', s);
  assert.equal(a.path, '/v1/messages');
  assert.equal(a.body.model, 'm');
  const o = buildDescribeRequest('openai', 'm', s);
  assert.equal(o.path, '/v1/chat/completions');
  assert.throws(() => buildDescribeRequest('nope', 'm', s), /does not know/);
  assert.equal(extractText('anthropic', { content: [{ type: 'text', text: 'hi ' }, { type: 'tool_use' }] }), 'hi');
  assert.equal(extractText('openai', { choices: [{ message: { content: ' yo ' } }] }), 'yo');
});

test('describeDataset sends the key to the provider only, and scrubs it from errors', async () => {
  const key = 'sk-ant-' + 'z'.repeat(30);
  let seen;
  const ok = await describeDataset({
    providerId: 'anthropic', key, model: 'm', summary: { rows: 1, columns: [] },
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'A ticket log.' }] }) };
    },
  });
  assert.equal(ok.text, 'A ticket log.');
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.init.headers['x-api-key'], key);
  assert.equal(seen.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.ok(!seen.init.body.includes(key));

  await assert.rejects(
    describeDataset({
      providerId: 'anthropic', key, model: 'm', summary: {},
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key ' + key } }) }),
    }),
    (e) => /HTTP 401/.test(e.message) && !e.message.includes(key),
  );
});
