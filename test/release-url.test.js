import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deployedUrl } from '../tools/release-url.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);

test('custom domain printed without a protocol becomes an https URL and ignores the docs link', () => {
  assert.equal(deployedUrl('See https://developers.cloudflare.com\n  app.example.com (custom domain)\nCurrent Version ID: x'), 'https://app.example.com');
});

test('workers.dev endpoint is accepted without a trailing slash', () => {
  assert.equal(deployedUrl('Deployed\n  https://demo.acct.workers.dev/\n'), 'https://demo.acct.workers.dev');
});

test('output with only a documentation URL fails closed', () => {
  assert.throws(() => deployedUrl('Success: docs at https://example.com'), /no verified/);
});

test('empty output fails closed', () => {
  assert.throws(() => deployedUrl(''), /no verified/);
});

test('scaffolded project ships the helper and its release script imports it', () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-release-url-'));
  try {
    for (const [name, file] of [['web', 'examples/concept.json']]) {
      const out = join(temp, name);
      const r = spawnSync(process.execPath, [join(root, 'scripts/byo.mjs'), 'scaffold', join(root, file), '--out', out], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(existsSync(join(out, 'tools/release-url.mjs')));
      const release = readFileSync(join(out, 'scripts/release.mjs'), 'utf8');
      assert.match(release, /from '\.\.\/tools\/release-url\.mjs'/);
      assert.match(release, /const workerUrl = deployedUrl\(output\)/);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
