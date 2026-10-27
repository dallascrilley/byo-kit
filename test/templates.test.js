import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// JSONC: drop // comments that are not inside strings.
function parseJsonc(text) {
  const stripped = text
    .split('\n')
    .map((line) => {
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"' && line[i - 1] !== '\\') inString = !inString;
        if (!inString && line[i] === '/' && line[i + 1] === '/') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
  return JSON.parse(stripped);
}

test('wrangler.jsonc parses and wires assets to the worker', () => {
  const cfg = parseJsonc(read('templates/wrangler.jsonc'));
  assert.equal(cfg.main, 'worker.js');
  assert.equal(cfg.assets.binding, 'ASSETS');
  assert.deepEqual(cfg.assets.run_worker_first, ['/api/*']);
  assert.equal(cfg.vars.ALLOWED_ORIGINS, '');
  assert.match(cfg.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
});

async function loadWorker(source, { withRelay }) {
  const dir = mkdtempSync(join(tmpdir(), 'byo-worker-'));
  writeFileSync(join(dir, 'worker.js'), source);
  if (withRelay) {
    mkdirSync(join(dir, 'relay'));
    copyFileSync(join(ROOT, 'relay/index.js'), join(dir, 'relay/index.js'));
  }
  return (await import(pathToFileURL(join(dir, 'worker.js')).href)).default;
}

// Removes "// " from the lines between each pair of "relay on" markers.
function enableRelay(source) {
  let on = false;
  return source
    .split('\n')
    .map((line) => {
      if (/\/\/ relay on: begin/.test(line)) { on = true; return line; }
      if (/\/\/ relay on: end/.test(line)) { on = false; return line; }
      return on ? line.replace(/^(\s*)\/\/ ?/, '$1') : line;
    })
    .join('\n');
}

test('worker.js mounts no relay route by default and serves assets', async () => {
  const source = read('templates/worker.js');
  assert.ok(!/^\s*import\s/m.test(source), 'the default worker imports nothing');
  assert.ok(!/typesafe/i.test(source));
  const worker = await loadWorker(source, { withRelay: false });
  const env = { ASSETS: { fetch: async (r) => new Response('asset:' + new URL(r.url).pathname) }, ALLOWED_ORIGINS: '' };
  assert.equal(await (await worker.fetch(new Request('https://demo.test/index.html'), env)).text(), 'asset:/index.html');
  assert.equal(await (await worker.fetch(new Request('https://demo.test/api/acme/v1/models'), env)).text(), 'asset:/api/acme/v1/models');
});

test('worker.js: removing the comments from the example turns the relay on', async () => {
  const worker = await loadWorker(enableRelay(read('templates/worker.js')), { withRelay: true });
  const env = { ASSETS: { fetch: async () => new Response('asset') }, ALLOWED_ORIGINS: 'https://friend.test' };

  const page = await worker.fetch(new Request('https://demo.test/index.html'), env);
  assert.equal(await page.text(), 'asset');

  const blocked = await worker.fetch(new Request('https://demo.test/api/acme/v1/models', { headers: { origin: 'https://evil.test' } }), env);
  assert.equal(blocked.status, 403);

  const preflight = await worker.fetch(new Request('https://demo.test/api/acme/v1/chat', { method: 'OPTIONS', headers: { origin: 'https://friend.test' } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://friend.test');
});

test('every shipped provider is direct, so the template needs no relay route', async () => {
  const { PROVIDERS } = await import('../src/core/providers.js');
  for (const p of Object.values(PROVIDERS)) assert.equal(p.mode, 'direct', p.id);
});

test('CI files follow the Depot pattern', () => {
  for (const base of ['', 'templates/']) {
    const depot = read(base + '.depot/workflows/ci.yml');
    assert.match(depot, /branches: \[main\]/);
    assert.match(depot, /paths:/);
    assert.match(depot, /runs-on: depot-ubuntu-24\.04/);
    assert.match(depot, /timeout-minutes: 5/);
    assert.match(depot, /workflow_dispatch:/);
    assert.match(depot, /persist-credentials: false/);
    assert.match(depot, /run: script\/cibuild/);
    const stub = read(base + '.github/workflows/ci.yml');
    assert.match(stub, /on:\n  workflow_dispatch:/);
    assert.match(stub, /exit 1/);
    assert.ok(!/push:/.test(stub), 'the GitHub stub must not run on push');
    assert.match(stub, /runs-on: ubuntu-24\.04/);
    const cibuild = join(ROOT, base + 'script/cibuild');
    assert.ok(statSync(cibuild).mode & 0o111, base + 'script/cibuild is not executable');
    assert.match(readFileSync(cibuild, 'utf8'), /^#!\/bin\/sh\nset -eu|\nset -eu\n/);
  }
  assert.equal(read('.github/workflows/ci.yml'), read('templates/.github/workflows/ci.yml'));
});

test('README template has the required sections in order', () => {
  const md = read('templates/README.md');
  const heads = ['Quickstart', 'What you get', 'Bring your own data', 'Bring your own key', 'Privacy', 'Status and honest limits', 'Development'];
  let at = -1;
  for (const h of heads) {
    const i = md.indexOf('\n## ' + h);
    assert.ok(i > at, 'missing or out of order: ' + h);
    at = i;
  }
  assert.match(md, /!\[[^\]]*\]\(docs\/demo\.gif\)/);
});

test('the demo GIF and final frame exist and the GIF is at most 10 seconds', async () => {
  assert.ok(existsSync(join(ROOT, 'docs/demo.gif')));
  assert.ok(existsSync(join(ROOT, 'docs/demo-final.png')));
  // GIF header, then sum the frame delays (centiseconds) from graphic control blocks.
  const b = readFileSync(join(ROOT, 'docs/demo.gif'));
  assert.equal(b.subarray(0, 6).toString(), 'GIF89a');
  let cs = 0;
  for (let i = 0; i < b.length - 7; i++) {
    if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 0x04) cs += b.readUInt16LE(i + 4);
  }
  assert.ok(cs > 0 && cs <= 1000, 'GIF runs ' + cs / 100 + ' s');
});
