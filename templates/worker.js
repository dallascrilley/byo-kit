// Serves static assets. No relay route is mounted by default: browsers call
// OpenRouter, OpenAI and Anthropic directly.
//
// To forward a provider whose API sends no CORS headers, copy relay/index.js
// from byo-kit next to this file (or change the import path), then remove the
// leading "// " from every line between a pair of "relay on" markers.

// relay on: begin
// import { createRelay } from './relay/index.js';
// relay on: end

// Each key is a path on your site. The relay forwards it to `upstream` and
// nothing else. Add one route per provider that does not allow browser calls.
const ROUTES = {
  // relay on: begin
  // '/api/acme': {
  //   upstream: 'https://api.acme.example',
  //   methods: ['GET', 'POST'],
  //   allowPaths: ['/v1/'],
  //   headers: [], // extra request headers to forward, besides authorization and content-type
  //   maxBodyBytes: 200_000,
  //   timeoutMs: 30_000,
  // },
  // relay on: end
};

// relay on: begin
// let relay;
// relay on: end

export default {
  async fetch(request, env) {
    // relay on: begin
    // relay ??= createRelay({
    //   routes: ROUTES,
    //   allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // });
    // if (relay.matches(request)) return relay(request);
    // relay on: end
    return env.ASSETS.fetch(request);
  },
};
