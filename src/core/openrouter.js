// OpenRouter Decisions API helper. No DOM, so it runs under node --test.
//
//   const { answers } = await openrouterDecide({
//     key, state: { ticket: '...' },
//     questions: {
//       topic:  { type: 'choice', instructions: 'Which team handles `ticket`?',
//                 criteria: { billing: 'Charges and invoices', bug: 'Something broken', other: null } },
//       urgent: { type: 'noul',   instructions: '`ticket` asks for help today' },
//       anger:  { type: 'score',  instructions: 'How upset is the writer?', criteria: ['Calm', 'Annoyed', 'Furious'] },
//     },
//   });
//   answers.topic   // { type: 'choice', choice, probabilities, confidence }
//   answers.urgent  // { type: 'noul', noul }    probability of yes, 0..1
//   answers.anger   // { type: 'score', score, probabilities, confidence }
//
// The default model is TypeSafe's Jev. Every answer is checked against its question:
// a choice must be one of the criteria keys, a noul a number in [0, 1], a score a
// number within the levels. Anything else throws.

export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.14';

export class OpenRouterError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
  }
}

const scrub = (text, key) => (key ? String(text).split(key).join('[key]') : String(text));

const TYPES = new Set(['choice', 'score', 'noul']);

function checkQuestion(id, q) {
  if (!q || typeof q !== 'object' || !TYPES.has(q.type)) throw new TypeError('Question "' + id + '" needs type choice, score or noul.');
  if (!q.instructions) throw new TypeError('Question "' + id + '" needs instructions.');
  if (q.type === 'choice' && (!q.criteria || typeof q.criteria !== 'object' || Array.isArray(q.criteria) || Object.keys(q.criteria).length < 2)) {
    throw new TypeError('Choice question "' + id + '" needs criteria: an object with at least two options.');
  }
  if (q.type === 'score' && (!Array.isArray(q.criteria) || q.criteria.length < 2)) {
    throw new TypeError('Score question "' + id + '" needs criteria: a list of at least two levels, lowest first.');
  }
}

const inRange = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

function checkAnswer(id, q, a, status) {
  const fail = (why) => { throw new OpenRouterError('Question "' + id + '": ' + why, status); };
  if (!a || typeof a !== 'object') fail('no answer came back.');
  if (q.type === 'choice') {
    const options = Object.keys(q.criteria);
    if (!options.includes(a.choice)) fail('the model chose "' + a.choice + '", which is not one of: ' + options.join(', ') + '.');
  } else if (q.type === 'noul') {
    if (!inRange(a.noul, 0, 1)) fail('expected a probability between 0 and 1.');
  } else if (!inRange(a.score, 0, q.criteria.length - 1)) {
    fail('expected a score between 0 and ' + (q.criteria.length - 1) + '.');
  }
}

function statusHint(status, model) {
  if (status === 401) {
    return 'OpenRouter rejected the key (HTTP 401). Check you copied all of it, or make a new one at https://openrouter.ai/settings/keys.';
  }
  if (status === 402) {
    return 'OpenRouter says the key is out of credit or over its limit (HTTP 402). Add credit or raise the key limit.';
  }
  if (status === 404) {
    return model.startsWith('typesafe/')
      ? 'OpenRouter answered HTTP 404 for ' + model + '. Jev may be blocked by your OpenRouter guardrails. Check the guardrail settings for your account.'
      : 'OpenRouter answered HTTP 404 for ' + model + '. The model name may be wrong, or your OpenRouter guardrails may block it.';
  }
  return '';
}

export async function openrouterDecide({ key, model = JEV_MODEL, state, questions, fetch: fetchImpl } = {}) {
  if (typeof key !== 'string' || !key.trim()) throw new TypeError('Enter an OpenRouter key.');
  if (!questions || typeof questions !== 'object' || Array.isArray(questions) || !Object.keys(questions).length) {
    throw new TypeError('Give at least one question, as an object of id to question.');
  }
  for (const [id, q] of Object.entries(questions)) checkQuestion(id, q);
  const doFetch = fetchImpl || globalThis.fetch;
  const apiKey = key.trim();
  let res;
  try {
    res = await doFetch(DECISIONS_URL, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model, state, questions }),
    });
  } catch {
    throw new OpenRouterError('Could not reach openrouter.ai. Check your connection.');
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const hint = statusHint(res.status, model);
    const detail = json?.error?.message ? ' ' + scrub(json.error.message, apiKey) : '';
    throw new OpenRouterError(hint ? hint + detail : 'OpenRouter answered HTTP ' + res.status + '.' + detail, res.status);
  }
  const answers = json?.answers;
  if (!answers || typeof answers !== 'object') throw new OpenRouterError('OpenRouter returned no answers.', res.status);
  for (const [id, q] of Object.entries(questions)) checkAnswer(id, q, answers[id], res.status);
  return { model: json.model || model, answers };
}
