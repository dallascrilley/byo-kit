import test from 'node:test';
import assert from 'node:assert/strict';
import { openrouterDecide, OpenRouterError, DECISIONS_URL, JEV_MODEL } from '../src/core/openrouter.js';

const KEY = 'sk-or-v1-' + 'ab12'.repeat(16);
const questions = {
  topic: { type: 'choice', instructions: 'Which team handles `ticket`?', criteria: { billing: 'Charges', bug: 'Broken', other: null } },
  urgent: { type: 'noul', instructions: '`ticket` asks for help today' },
  anger: { type: 'score', instructions: 'How upset is the writer?', criteria: ['Calm', 'Annoyed', 'Furious'] },
};
const good = {
  topic: { type: 'choice', choice: 'billing', probabilities: { billing: 0.9, bug: 0.08, other: 0.02 }, confidence: 0.88 },
  urgent: { type: 'noul', noul: 0.71 },
  anger: { type: 'score', score: 1.2, probabilities: { 0: 0.1, 1: 0.6, 2: 0.3 }, confidence: 0.4 },
};

function stub(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

test('posts model, state and the question map with the bearer key', async () => {
  const { fetch, calls } = stub(200, { model: JEV_MODEL, answers: good });
  const out = await openrouterDecide({ key: ' ' + KEY + ' ', state: { ticket: 'hi' }, questions, fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DECISIONS_URL);
  assert.equal(DECISIONS_URL, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer ' + KEY);
  assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'typesafe/jev-1.14', state: { ticket: 'hi' }, questions });
  assert.equal(out.answers.topic.choice, 'billing');
  assert.equal(out.answers.urgent.noul, 0.71);
  assert.equal(out.model, JEV_MODEL);
});

test('a custom model is sent as given', async () => {
  const { fetch, calls } = stub(200, { answers: good });
  const out = await openrouterDecide({ key: KEY, model: 'other/model', state: {}, questions, fetch });
  assert.equal(JSON.parse(calls[0].init.body).model, 'other/model');
  assert.equal(out.model, 'other/model');
});

test('rejects answers that do not fit their question', async () => {
  const bad = async (patch) => {
    const { fetch } = stub(200, { answers: { ...good, ...patch } });
    return openrouterDecide({ key: KEY, state: {}, questions, fetch });
  };
  await assert.rejects(bad({ topic: { type: 'choice', choice: 'angry' } }), /chose "angry".*billing, bug, other/);
  await assert.rejects(bad({ urgent: { type: 'noul', noul: 1.4 } }), /"urgent".*between 0 and 1/);
  await assert.rejects(bad({ anger: { type: 'score', score: 3 } }), /"anger".*between 0 and 2/);
  await assert.rejects(bad({ urgent: undefined }), /"urgent": no answer/);
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch: stub(200, {}).fetch }), /no answers/);
});

test('rejects malformed questions before any request', async () => {
  const never = async () => { throw new Error('should not be called'); };
  const ask = (q) => openrouterDecide({ key: KEY, state: {}, questions: q, fetch: never });
  await assert.rejects(ask([]), /object of id to question/);
  await assert.rejects(ask({}), /at least one question/);
  await assert.rejects(ask({ a: { type: 'pick', instructions: 'x' } }), /choice, score or noul/);
  await assert.rejects(ask({ a: { type: 'choice', instructions: 'x', criteria: { only: null } } }), /at least two options/);
  await assert.rejects(ask({ a: { type: 'score', instructions: 'x', criteria: ['one'] } }), /at least two levels/);
  await assert.rejects(ask({ a: { type: 'noul' } }), /needs instructions/);
});

test('plain hints for 401, 402 and 404', async () => {
  const fail = async (status, body, model) => {
    try {
      await openrouterDecide({ key: KEY, model, state: {}, questions, fetch: stub(status, body).fetch });
    } catch (e) {
      return e;
    }
    throw new Error('did not throw');
  };
  const e401 = await fail(401, { error: { message: 'No auth' } });
  assert.ok(e401 instanceof OpenRouterError);
  assert.equal(e401.status, 401);
  assert.match(e401.message, /rejected the key.*settings\/keys/);
  assert.match((await fail(402, {})).message, /out of credit or over its limit/);
  assert.match((await fail(404, {})).message, /Jev may be blocked by your OpenRouter guardrails/);
  const other = await fail(404, {}, 'acme/model');
  assert.ok(!/Jev/.test(other.message));
  assert.match((await fail(500, { error: { message: 'boom' } })).message, /HTTP 500\. boom/);
});

test('the key never appears in an error message', async () => {
  const { fetch } = stub(401, { error: { message: 'bad key ' + KEY } });
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch }), (e) => !e.message.includes(KEY));
});

test('network failures and a missing key give plain errors', async () => {
  const down = async () => { throw new Error('socket'); };
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch: down }), /Could not reach openrouter\.ai/);
  await assert.rejects(openrouterDecide({ key: '', state: {}, questions, fetch: down }), /Enter an OpenRouter key/);
});
