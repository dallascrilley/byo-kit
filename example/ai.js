// Provider calls for the optional "describe this dataset" button. No DOM.
import { requestFor, getProvider, normalizeProvider } from '../dist/byo-kit.js';

export const DEFAULT_MODELS = { openrouter: 'openai/gpt-4o-mini', anthropic: 'claude-haiku-4-5', openai: 'gpt-4o-mini' };

export function buildPrompt(summary) {
  return (
    'Below is a profile of a dataset: row count, then each column with its type, counts and range. ' +
    'You are not shown any cell values. In 3 to 5 plain sentences, say what this dataset probably records, ' +
    'which columns look like identifiers, measures or categories, and one data quality issue worth checking.\n\n' +
    JSON.stringify(summary)
  );
}

export function buildDescribeRequest(providerId, model, summary) {
  const prompt = buildPrompt(summary);
  if (providerId === 'anthropic') {
    return { path: '/v1/messages', body: { model, max_tokens: 400, messages: [{ role: 'user', content: prompt }] } };
  }
  if (providerId === 'openrouter') {
    return {
      path: '/api/v1/chat/completions',
      body: { model, max_tokens: 400, messages: [{ role: 'user', content: prompt }] },
    };
  }
  if (providerId === 'openai') {
    return {
      path: '/v1/chat/completions',
      body: { model, max_completion_tokens: 400, messages: [{ role: 'user', content: prompt }] },
    };
  }
  throw new Error('The example does not know how to call "' + providerId + '".');
}

export function extractText(providerId, json) {
  if (providerId === 'anthropic') {
    return (json?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }
  return (json?.choices?.[0]?.message?.content || '').trim();
}

const scrub = (text, key) => (key ? String(text).split(key).join('[key]') : String(text));

export async function describeDataset({ providerId, key, model, summary, fetchImpl, origin = '' }) {
  const provider = normalizeProvider(getProvider(providerId));
  const { path, body } = buildDescribeRequest(providerId, model, summary);
  const { url, headers } = requestFor(provider, key, path, origin);
  const doFetch = fetchImpl || globalThis.fetch;
  const res = await doFetch(url, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const detail = json?.error?.message ? ': ' + scrub(json.error.message, key) : '';
    throw new Error(provider.label + ' answered HTTP ' + res.status + detail);
  }
  const text = extractText(providerId, json);
  if (!text) throw new Error(provider.label + ' returned no text.');
  return { text, url };
}
