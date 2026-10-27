// A stateless pass-through for Cloudflare Workers (any runtime with fetch,
// Request and Response). It exists for providers that send no CORS headers.
//
//   const relay = createRelay({
//     allowedOrigins: [],                       // empty = same origin only
//     routes: {
//       '/api/typesafe': {
//         upstream: 'https://api.typesafe.ai',
//         methods: ['GET', 'POST'],
//         allowPaths: ['/v1/'],                 // optional path prefixes
//         headers: [],                          // extra request headers to forward
//         maxBodyBytes: 200000,
//         timeoutMs: 30000,
//       },
//     },
//   });
//   if (relay.matches(request)) return relay(request);
//
// It keeps nothing: no storage, no logging of headers or bodies, no cookies.
// Anyone who can reach the relay can send their own key through it. Requests
// from other browser origins are refused, but non-browser clients can still
// call it, so give it only routes you are happy to forward.

const BASE_FORWARD = ['authorization', 'content-type'];
const FORBIDDEN_EXTRA = new Set([
  'cookie', 'set-cookie', 'host', 'content-length', 'connection', 'transfer-encoding', 'origin', 'referer',
]);
const DROP_RESPONSE = new Set([
  'set-cookie', 'set-cookie2', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authenticate',
]);

function isLocalHttp(u) {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

function normalizeRoutes(routes) {
  if (!routes || typeof routes !== 'object' || Object.keys(routes).length === 0) {
    throw new TypeError('createRelay needs at least one route.');
  }
  const out = [];
  for (const [rawPrefix, r] of Object.entries(routes)) {
    if (!rawPrefix.startsWith('/')) throw new TypeError('Route prefix must start with "/": ' + rawPrefix);
    const prefix = rawPrefix.replace(/\/+$/, '') || '/';
    if (prefix === '/') throw new TypeError('A route cannot be the whole site. Use a prefix such as /api/provider.');
    let upstream;
    try {
      upstream = new URL(r.upstream);
    } catch {
      throw new TypeError('Route ' + prefix + ' needs a valid upstream URL.');
    }
    if (upstream.protocol !== 'https:' && !isLocalHttp(upstream)) {
      throw new TypeError('Route ' + prefix + ' upstream must be https.');
    }
    if (upstream.search || upstream.hash) throw new TypeError('Route ' + prefix + ' upstream must not have a query or hash.');
    const extras = (r.headers || []).map((h) => String(h).toLowerCase());
    for (const h of extras) {
      if (FORBIDDEN_EXTRA.has(h)) throw new TypeError('Route ' + prefix + ' cannot forward the "' + h + '" header.');
    }
    const allowPaths = r.allowPaths || null;
    if (allowPaths && !allowPaths.every((p) => typeof p === 'string' && p.startsWith('/'))) {
      throw new TypeError('Route ' + prefix + ' allowPaths must be strings that start with "/".');
    }
    out.push({
      prefix,
      upstream,
      basePath: upstream.pathname.replace(/\/+$/, ''),
      methods: (r.methods || ['POST']).map((m) => m.toUpperCase()),
      forward: [...new Set([...BASE_FORWARD, ...extras])],
      allowPaths,
      maxBodyBytes: r.maxBodyBytes ?? 1_000_000,
      timeoutMs: r.timeoutMs ?? 30_000,
    });
  }
  // Longest prefix first.
  return out.sort((a, b) => b.prefix.length - a.prefix.length);
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function readBody(request, max) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.byteLength;
  }
  return body;
}

export function createRelay({ routes, allowedOrigins = [], fetch: fetchImpl } = {}) {
  const table = normalizeRoutes(routes);
  const allowed = new Set(
    allowedOrigins.map((o) => {
      if (o === '*') throw new TypeError('allowedOrigins cannot contain "*". List each origin.');
      return new URL(o).origin;
    }),
  );

  const find = (pathname) => table.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/')) || null;

  function cors(request, url) {
    const origin = request.headers.get('origin');
    if (origin === null) return { ok: true, headers: {} };
    if (origin === url.origin || allowed.has(origin)) {
      return { ok: true, headers: { 'access-control-allow-origin': origin, vary: 'Origin' } };
    }
    return { ok: false, headers: {} };
  }

  async function relay(request) {
    const url = new URL(request.url);
    const route = find(url.pathname);
    if (!route) return json(404, { error: 'not_found' });

    const gate = cors(request, url);
    if (!gate.ok) return json(403, { error: 'origin_not_allowed' });

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...gate.headers,
          'access-control-allow-methods': [...route.methods, 'OPTIONS'].join(', '),
          'access-control-allow-headers': route.forward.join(', '),
          'access-control-max-age': '600',
          'cache-control': 'no-store',
        },
      });
    }

    if (!route.methods.includes(request.method)) {
      return json(405, { error: 'method_not_allowed' }, { ...gate.headers, allow: route.methods.join(', ') });
    }

    const rest = url.pathname.slice(route.prefix.length); // '' or '/...'
    // An upstream may decode these and climb out of the allowed prefix.
    if (/%2e|%2f|%5c|\\/i.test(rest)) return json(400, { error: 'bad_path' }, gate.headers);
    const target = new URL(route.upstream.origin + route.basePath + rest + url.search);
    if (target.origin !== route.upstream.origin || !(target.pathname + '/').startsWith(route.basePath + '/')) {
      return json(403, { error: 'path_not_allowed' }, gate.headers);
    }
    if (route.allowPaths) {
      const sub = target.pathname.slice(route.basePath.length) || '/';
      if (!route.allowPaths.some((p) => (p.endsWith('/') ? sub.startsWith(p) : sub === p || sub.startsWith(p + '/')))) {
        return json(403, { error: 'path_not_allowed' }, gate.headers);
      }
    }

    const headers = new Headers();
    for (const name of route.forward) {
      const v = request.headers.get(name);
      if (v !== null) headers.set(name, v);
    }

    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await readBody(request, route.maxBodyBytes);
      if (body === null) return json(413, { error: 'body_too_large', limit: route.maxBodyBytes }, gate.headers);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), route.timeoutMs);
    let upstream;
    try {
      upstream = await (fetchImpl || globalThis.fetch)(target.toString(), {
        method: request.method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) return json(504, { error: 'upstream_timeout' }, gate.headers);
      return json(502, { error: 'upstream_unreachable' }, gate.headers);
    }
    clearTimeout(timer);

    if (upstream.status >= 300 && upstream.status < 400) {
      return json(502, { error: 'upstream_redirect_refused' }, gate.headers);
    }

    const out = new Headers();
    upstream.headers.forEach((value, name) => {
      const n = name.toLowerCase();
      if (DROP_RESPONSE.has(n) || n.startsWith('access-control-')) return;
      out.set(name, value);
    });
    for (const [k, v] of Object.entries(gate.headers)) out.set(k, v);
    out.set('cache-control', 'no-store');
    out.set('x-content-type-options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  }

  relay.matches = (requestOrUrl) => {
    const href = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url || String(requestOrUrl);
    return find(new URL(href).pathname) !== null;
  };
  return relay;
}
