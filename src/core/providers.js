// Provider descriptors for <byo-key>. Plain data, so they can be JSON.
//
//   id          short name, used in events and storage names
//   label       shown to people
//   keyPattern  regex (RegExp or string) a key must match
//   docsUrl     where to get a key
//   mode        'direct'  the browser calls the provider
//               'relay'   the browser calls a stateless relay on your origin
//   endpoint    provider base URL (direct) or upstream base URL (relay)
//   relayPath   path of the relay on your origin (relay mode)
//   auth        { header, prefix } for the key
//   headers     extra fixed request headers
//   testPath    optional cheap GET path used by createKeyTest()
//   note        optional sentence shown under the route statement

export const openai = Object.freeze({
  id: 'openai',
  label: 'OpenAI',
  keyPattern: '^sk-[A-Za-z0-9_-]{20,}$',
  docsUrl: 'https://platform.openai.com/api-keys',
  mode: 'direct',
  endpoint: 'https://api.openai.com',
  auth: Object.freeze({ header: 'authorization', prefix: 'Bearer ' }),
  headers: Object.freeze({}),
  testPath: '/v1/models',
});

// Anthropic only allows browser calls when this header is sent. The header name
// says it plainly: the key is exposed to the page, so use a key you can revoke.
export const anthropic = Object.freeze({
  id: 'anthropic',
  label: 'Anthropic',
  keyPattern: '^sk-ant-[A-Za-z0-9_-]{20,}$',
  docsUrl: 'https://console.anthropic.com/settings/keys',
  mode: 'direct',
  endpoint: 'https://api.anthropic.com',
  note:
    'Browser calls send the header anthropic-dangerous-direct-browser-access: true. Use a key you can revoke.',
  auth: Object.freeze({ header: 'x-api-key', prefix: '' }),
  headers: Object.freeze({
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }),
  testPath: '/v1/models',
});

// api.typesafe.ai sends no Access-Control-Allow-Origin header, so a browser
// cannot call it directly. Calls go through the relay in relay/index.js.
export const typesafe = Object.freeze({
  id: 'typesafe',
  label: 'TypeSafe (Jev)',
  keyPattern: '^[A-Za-z0-9._-]{16,}$',
  docsUrl: 'https://docs.typesafe.ai',
  mode: 'relay',
  endpoint: 'https://api.typesafe.ai',
  relayPath: '/api/typesafe',
  auth: Object.freeze({ header: 'authorization', prefix: 'Bearer ' }),
  headers: Object.freeze({}),
  testPath: '/v1/models',
});

export const PROVIDERS = Object.freeze({ openai, anthropic, typesafe });

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

const NORMALIZED = new WeakSet();
const ensure = (p) => (NORMALIZED.has(p) ? p : normalizeProvider(p));

export function normalizeProvider(d) {
  if (!d || typeof d !== 'object') throw new TypeError('A provider descriptor must be an object.');
  for (const k of ['id', 'label', 'mode', 'endpoint']) {
    if (typeof d[k] !== 'string' || !d[k]) throw new TypeError('Provider descriptor needs a string "' + k + '".');
  }
  if (d.mode !== 'direct' && d.mode !== 'relay') throw new TypeError('Provider mode must be "direct" or "relay".');
  if (d.mode === 'relay' && !(typeof d.relayPath === 'string' && d.relayPath.startsWith('/'))) {
    throw new TypeError('A relay provider needs a relayPath that starts with "/".');
  }
  let pattern = null;
  if (d.keyPattern) {
    pattern = d.keyPattern instanceof RegExp ? d.keyPattern : new RegExp(d.keyPattern);
  }
  const out = {
    id: d.id,
    label: d.label,
    keyPattern: pattern,
    docsUrl: d.docsUrl || '',
    note: d.note || '',
    mode: d.mode,
    endpoint: d.endpoint.replace(/\/+$/, ''),
    relayPath: d.mode === 'relay' ? d.relayPath.replace(/\/+$/, '') : '',
    auth: { header: (d.auth?.header || 'authorization').toLowerCase(), prefix: d.auth?.prefix ?? 'Bearer ' },
    headers: { ...(d.headers || {}) },
    testPath: d.testPath || '',
  };
  NORMALIZED.add(out);
  return out;
}

// Returns an error message, or null when the key looks right.
export function checkKeyFormat(provider, key) {
  const p = ensure(provider);
  if (typeof key !== 'string' || !key.trim()) return 'Enter a key.';
  if (p.keyPattern && !p.keyPattern.test(key.trim())) {
    return 'That does not match the ' + p.label + ' key format. Check you copied all of it.';
  }
  return null;
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Plain statement of where the key goes.
export function describeRoute(provider, origin = '') {
  const p = ensure(provider);
  const host = hostOf(p.endpoint);
  if (p.mode === 'direct') {
    return {
      kind: 'direct',
      url: p.endpoint,
      text: 'Your key goes straight from your browser to ' + host + '. This site never receives it.',
    };
  }
  const relay = origin + p.relayPath;
  return {
    kind: 'relay',
    url: relay,
    text:
      'Browsers cannot call ' + host + ' directly. Your key goes through a stateless relay at ' + relay +
      ' that forwards the request to ' + host + ' and stores nothing. The relay sees the key while it passes through.',
  };
}

// Where a request for `path` (for example "/v1/messages") should be sent.
export function requestFor(provider, key, path, origin = '') {
  const p = ensure(provider);
  const base = p.mode === 'relay' ? origin + p.relayPath : p.endpoint;
  return {
    url: base + path,
    headers: { ...p.headers, [p.auth.header]: p.auth.prefix + key.trim() },
  };
}

// Builds a test hook for <byo-key>: one cheap GET to the provider.
export function createKeyTest(provider, { fetchImpl, origin = '' } = {}) {
  const p = normalizeProvider(provider);
  return async (key) => {
    if (!p.testPath) return { ok: true, message: 'Format looks right. This provider has no test call.' };
    const doFetch = fetchImpl || globalThis.fetch;
    const { url, headers } = requestFor(p, key, p.testPath, origin);
    let res;
    try {
      res = await doFetch(url, { method: 'GET', headers });
    } catch {
      return { ok: false, message: 'Could not reach ' + hostOf(url) + '. Check your connection or the relay.' };
    }
    if (res.ok) return { ok: true, message: p.label + ' accepted the key.' };
    if (res.status === 401 || res.status === 403) return { ok: false, message: p.label + ' rejected the key (HTTP ' + res.status + ').' };
    return { ok: false, message: p.label + ' answered HTTP ' + res.status + '.' };
  };
}
