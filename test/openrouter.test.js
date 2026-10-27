import test from 'node:test';
import assert from 'node:assert/strict';
import { openrouterDecide, OpenRouterError, DECISIONS_URL, JEV_MODEL } from '../src/core/openrouter.js';

const KEY = 'sk-or-v1-' + 'ab12'.repeat(16);
const questions = [{ id: 'tone', choices: ['formal', 'casual'] }, { id: 'urgent' }];
const answer = (choice) => ({ type: 'choice', choice, probabilities: { [choice]: 0.9 }, confidence: 0.9 });

function stub(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

test('posts model, state and questions to the Decisions API with the bearer key', async () => {
  const { fetch, calls } = stub(200, { model: JEV_MODEL, answers: { tone: answer('casual'), urgent: answer('no') } });
  const out = await openrouterDecide({ key: ' ' + KEY + ' ', state: { text: 'hi' }, questions, fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DECISIONS_URL);
  assert.equal(DECISIONS_URL, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer ' + KEY);
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'typesafe/jev-1.14', state: { text: 'hi' }, questions });
  assert.equal(out.answers.tone.choice, 'casual');
  assert.equal(out.model, JEV_MODEL);
});

test('a custom model is sent as given', async () => {
  const { fetch, calls } = stub(200, { answers: { a: answer('x') } });
  const out = await openrouterDecide({ key: KEY, model: 'other/model', state: {}, questions: [{ id: 'a' }], fetch });
  assert.equal(JSON.parse(calls[0].init.body).model, 'other/model');
  assert.equal(out.model, 'other/model');
});

test('rejects an answer whose choice is not one of the question choices', async () => {
  const { fetch } = stub(200, { answers: { tone: answer('angry'), urgent: answer('no') } });
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch }), /chose "angry" for question "tone".*formal, casual/);
});

test('rejects a missing answer or an empty choice', async () => {
  let r = stub(200, { answers: { tone: answer('casual') } });
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch: r.fetch }), /no choice for question "urgent"/);
  r = stub(200, { answers: { tone: answer('casual'), urgent: { type: 'choice', choice: '' } } });
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch: r.fetch }), /no choice for question "urgent"/);
  r = stub(200, {});
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch: r.fetch }), /no answers/);
});

test('choices may be objects with id, value or label', async () => {
  const { fetch } = stub(200, { answers: { q: answer('b') } });
  const out = await openrouterDecide({ key: KEY, state: {}, questions: [{ id: 'q', choices: [{ id: 'a' }, { value: 'b' }] }], fetch });
  assert.equal(out.answers.q.choice, 'b');
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
  assert.match(other.message, /acme\/model/);
  assert.match((await fail(500, { error: { message: 'boom' } })).message, /HTTP 500\. boom/);
});

test('the key never appears in an error message', async () => {
  const { fetch } = stub(401, { error: { message: 'bad key ' + KEY } });
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch }), (e) => !e.message.includes(KEY));
});

test('network failures and bad input give plain errors', async () => {
  const down = async () => { throw new Error('socket'); };
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions, fetch: down }), /Could not reach openrouter\.ai/);
  await assert.rejects(openrouterDecide({ key: '', state: {}, questions, fetch: down }), /Enter an OpenRouter key/);
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions: [], fetch: down }), /at least one question/);
  await assert.rejects(openrouterDecide({ key: KEY, state: {}, questions: [{}], fetch: down }), /string id/);
});
