import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const shipped = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'relay')), join(ROOT, 'dist/byo-kit.js'), ...walk(join(ROOT, 'example')).filter((f) => f.endsWith('.js'))];
const text = (f) => readFileSync(f, 'utf8');

test('no persistent storage for keys: the shipped code never names it', () => {
  const bad = ['local' + 'Storage', 'indexed' + 'DB', 'document.cookie'];
  for (const f of shipped) for (const word of bad) assert.ok(!text(f).includes(word), relative(ROOT, f) + ' mentions ' + word);
});

test('no console output anywhere in shipped code (keys must not be logged)', () => {
  for (const f of shipped) assert.ok(!/\bconsole\.(log|info|warn|error|debug|trace|dir|table)\b/.test(text(f)), relative(ROOT, f));
});

test('user data never goes through innerHTML or similar', () => {
  for (const f of shipped) {
    const t = text(f);
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) {
      assert.ok(!t.includes(sink), relative(ROOT, f) + ' uses ' + sink);
    }
  }
});

test('zero runtime dependencies', () => {
  const pkg = JSON.parse(text(join(ROOT, 'package.json')));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  for (const f of shipped) {
    for (const m of text(f).matchAll(/^(?:import|export)[^\n]*?from\s+'([^']+)'/gm)) {
      assert.ok(m[1].startsWith('.'), relative(ROOT, f) + ' imports ' + m[1]);
    }
  }
});

test('dist/byo-kit.js is current and self-contained', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/bundle.mjs'), '--check'], { stdio: 'pipe' });
  const dist = text(join(ROOT, 'dist/byo-kit.js'));
  assert.ok(!/^import\s/m.test(dist), 'dist must not import anything');
  assert.ok(existsSync(join(ROOT, 'LICENSE')));
});

test('dist exports the same names as src', async () => {
  const [a, b] = await Promise.all([import('../src/index.js'), import('../dist/byo-kit.js')]);
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
  for (const k of ['ByoData', 'ByoKey', 'parseCsv', 'countNetworkCalls', 'typesafe']) assert.ok(k in b, k);
});
