// OpenRouter Decisions API helper. No DOM, so it runs under node --test.
//
//   const { answers } = await openrouterDecide({
//     key, state: { ... },
//     questions: [{ id: 'tone', choices: ['formal', 'casual'] }],
//   });
//   answers.tone  // { type, choice, probabilities, confidence }
//
// The default model is TypeSafe's Jev decision model. A question may list
// `choices` (strings, or objects with id, value or label); when it does, the
// answer must be one of them. Without `choices`, any non-empty choice is accepted.

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

function choiceValues(list) {
  return list.map((c) => (c && typeof c === 'object' ? c.id ?? c.value ?? c.label : c)).map(String);
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
  if (!Array.isArray(questions) || questions.length === 0) throw new TypeError('Give at least one question.');
  for (const q of questions) {
    if (!q || typeof q.id !== 'string' || !q.id) throw new TypeError('Every question needs a string id.');
  }
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
  for (const q of questions) {
    const a = answers[q.id];
    const choice = a?.choice;
    if (choice === undefined || choice === null || choice === '') {
      throw new OpenRouterError('The model gave no choice for question "' + q.id + '".', res.status);
    }
    const allowed = Array.isArray(q.choices) ? choiceValues(q.choices) : null;
    if (allowed && !allowed.includes(String(choice))) {
      throw new OpenRouterError(
        'The model chose "' + choice + '" for question "' + q.id + '", which is not one of: ' + allowed.join(', ') + '.',
        res.status,
      );
    }
  }
  return { model: json.model || model, answers };
}
