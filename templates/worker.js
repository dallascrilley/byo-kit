// Serves static assets and mounts the byo-kit relay.
// Copy relay/index.js from byo-kit next to this file (or change the import).
import { createRelay } from './relay/index.js';

// Each key is a path on your site. The relay forwards it to `upstream` and
// nothing else. Add a route per provider that does not allow browser calls.
const ROUTES = {
  '/api/typesafe': {
    upstream: 'https://api.typesafe.ai',
    methods: ['GET', 'POST'],
    allowPaths: ['/v1/'],
    headers: [], // extra request headers to forward, besides authorization and content-type
    maxBodyBytes: 200_000,
    timeoutMs: 30_000,
  },
};

let relay;

export default {
  async fetch(request, env) {
    relay ??= createRelay({
      routes: ROUTES,
      allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
    if (relay.matches(request)) return relay(request);
    return env.ASSETS.fetch(request);
  },
};
