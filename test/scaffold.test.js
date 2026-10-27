import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
const cli = join(root, 'scripts/byo.mjs');
const concept = join(root, 'examples/concept.json');
function run(args, cwd = root, input = undefined, env = {}) {
  const [command, ...rest] = args;
  return command === 'npm'
    ? spawnSync('npm', rest, { cwd, encoding: 'utf8', input, env: { ...process.env, ...env } })
    : command === process.execPath
      ? spawnSync(command, rest, { cwd, encoding: 'utf8', input, env: { ...process.env, ...env } })
      : /\.(mjs|js)$/.test(command)
        ? spawnSync(process.execPath, args, { cwd, encoding: 'utf8', input, env: { ...process.env, ...env } })
        : spawnSync(command, rest, { cwd, encoding: 'utf8', input, env: { ...process.env, ...env } });
}

test('concept schema and example support name/title, prior-art choices, and data-driven demo steps', () => {
  const schema = JSON.parse(readFileSync(join(root, 'schemas/concept.schema.json'), 'utf8'));
  const example = JSON.parse(readFileSync(concept, 'utf8'));
  assert.equal(schema.properties.prior_art.properties.decision.enum.join(','), 'extend,contribute,wrap,new');
  assert.ok(example.title && example.problem && example.user && example.standout && example.demo_steps);
  assert.equal(example.ai, false);
});

test('web scaffold generates a runnable local-data app and generic handoff', () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-scaffold-test-'));
  try {
    const out = join(temp, 'site');
    const created = run([cli, 'scaffold', concept, '--out', out]);
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /measured scaffold time:/);
    assert.equal(run(['scripts/byo.mjs', 'check', out]).status, 0);
    const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.demo && pkg.scripts.verify);
    assert.match(readFileSync(join(out, 'public/index.html'), 'utf8'), /<byo-data/);
    assert.match(readFileSync(join(out, 'public/src/standout.js'), 'utf8'), /TODO_IMPLEMENT_STANDOUT/);
    assert.match(readFileSync(join(out, 'test/standout.test.js'), 'utf8'), /TODO_IMPLEMENT_ACCEPTANCE/);
    assert.ok(readFileSync(join(out, 'LICENSE'), 'utf8').includes('MIT License'));
    assert.match(readFileSync(join(out, '.gitignore'), 'utf8'), /portfolio-handoff\.json/);
    assert.match(readFileSync(join(out, '.gitignore'), 'utf8'), /timing\.json/);
    assert.match(readFileSync(join(out, '.gitignore'), 'utf8'), /release-receipt\.json/);
    assert.match(readFileSync(join(out, 'PROJECT_PLAN.md'), 'utf8'), /Decision \(choose one\)/);
    assert.ok(readFileSync(join(out, 'public/index.html'), 'utf8').includes('/vendor/byo-kit.js'));
    assert.ok(readFileSync(join(out, '.depot/workflows/ci.yml'), 'utf8').includes('public/**'));
    assert.ok(readFileSync(join(out, '.depot/workflows/ci.yml'), 'utf8').includes('schemas/**'));
    assert.ok(readFileSync(join(out, '.depot/workflows/ci.yml'), 'utf8').includes('examples/**'));
    assert.ok(readFileSync(join(out, '.depot/workflows/ci.yml'), 'utf8').includes('script/cibuild'));
    assert.ok(readFileSync(join(out, 'script/cibuild'), 'utf8').includes('npm test'));
    const handoff = JSON.parse(readFileSync(join(out, 'portfolio-handoff.json'), 'utf8'));
    assert.equal(handoff.privacy, 'public project metadata only; no personal career data');
    const page = readFileSync(join(out, 'public/index.html'), 'utf8');
    const styles = readFileSync(join(out, 'public/styles.css'), 'utf8');
    assert.doesNotMatch(page, /eyebrow|LOCAL-FIRST DEMO/i);
    assert.match(page, /<header><h1>[^<]+<\/h1><p class="lede">/);
    assert.match(page, /id="results" data-state="empty"/);
    assert.match(readFileSync(join(out, 'public/app.js'), 'utf8'), /byo-data-error/);
    assert.match(styles, /font: 16px\/1\.5 system-ui/);
    assert.doesNotMatch(styles, /box-shadow|gradient|100vh|place-items:\s*center|letter-spacing/);
    const review = readFileSync(join(out, 'docs/DESIGN_REVIEW.md'), 'utf8');
    assert.match(review, /Apply `unslop` to all prose and `hallmark` to all visual design/);
    assert.match(review, /follow `project-journey-proof`/);
    assert.match(review, /actually inspect it visually or open current screenshots/);
    assert.match(review, /text-only agent obtains an image-capable review/);
    assert.doesNotMatch(review, /@|\d{3}[-. ]\d{3}[-. ]\d{4}|salary:/i);
    assert.match(readFileSync(join(out, 'README.md'), 'utf8'), /docs\/DESIGN_REVIEW\.md/);
    const verify = run(['npm', 'run', 'verify'], out);
    assert.notEqual(verify.status, 0);
    assert.match(verify.stderr, /Implement the concept standout/);
    const targets = JSON.parse(readFileSync(join(out, 'workflow-targets.json'), 'utf8'));
    assert.equal(targets.target_minutes.total, 20);
    assert.match(targets.scope, /Count fresh ideation or research/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('CLI scaffold accepts a structured title and provides help, json, file, stdin, and API paths', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-cli-test-'));
  try {
    const input = join(temp, 'concept.json');
    const out = join(temp, 'tool');
    const source = { title: 'Row Inspector', problem: 'Compare rows', user: 'Analyst', standout: 'rank rows', demo_steps: ['run sample'], kind: 'cli', sample_data: [{ label: 'a', value: 3 }], internal_notes: 'must not be copied' };
    writeFileSync(input, JSON.stringify(source));
    const created = run([cli, 'scaffold', input, '--out', out]);
    assert.equal(created.status, 0, created.stderr);
    assert.equal('internal_notes' in JSON.parse(readFileSync(join(out, 'concept.json'), 'utf8')), false);
    assert.ok(readFileSync(join(out, 'LICENSE'), 'utf8').includes('MIT License'));
    const help = run([process.execPath, 'src/index.js', '--help'], out);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--json/);
    const result = run([process.execPath, 'src/index.js', '--json'], out);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Array.isArray(JSON.parse(result.stdout)));
    const stdin = run([process.execPath, 'src/index.js', '--json'], out, JSON.stringify([{ label: 'from stdin', value: 4 }]));
    assert.equal(stdin.status, 0, stdin.stderr);
    assert.equal(JSON.parse(stdin.stdout)[0].label, 'from stdin');
    const api = await import(pathToFileURL(join(out, 'src/index.js')).href);
    assert.equal(api.analyze([{ label: 'api row' }])[0].label, 'api row');
    const invalid = join(temp, 'invalid.json');
    writeFileSync(invalid, '{"invalid": true}');
    const bad = run([process.execPath, 'src/index.js', invalid], out);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /invalid input/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('library scaffold includes a package API, bin, and portable license', () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-library-test-'));
  try {
    const input = join(temp, 'concept.json'); const out = join(temp, 'library');
    writeFileSync(input, JSON.stringify({ name: 'Row Library', problem: 'Compare rows', user: 'Analyst', standout: 'Rank by baseline', demo_steps: ['import and call'], kind: 'library' }));
    const created = run([cli, 'scaffold', input, '--out', out]);
    assert.equal(created.status, 0, created.stderr);
    const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    assert.equal(pkg.exports['.'], './src/index.js');
    assert.equal(pkg.bin['row-library'], './bin/cli.js');
    assert.ok(existsSync(join(out, 'LICENSE')));
    const review = readFileSync(join(out, 'docs/DESIGN_REVIEW.md'), 'utf8');
    assert.match(review, /Apply `unslop` to all prose/);
    assert.doesNotMatch(review, /Actual page inspection/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('release verification updates ignored receipts and reaches the GitHub push step from a clean commit', () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-release-verify-'));
  try {
    const input = join(temp, 'concept.json'); const out = join(temp, 'project');
    writeFileSync(input, JSON.stringify({ name: 'Priority Tool', problem: 'Compare metrics', user: 'Analyst', standout: 'Rank above baseline', demo_steps: ['read sample'], kind: 'library', sample_data: [{ name: 'North', value: 18, baseline: 25 }, { name: 'West', value: 31, baseline: 27 }, { name: 'South', value: 12, baseline: 24 }] }));
    assert.equal(run([cli, 'scaffold', input, '--out', out]).status, 0);
    const feature = join(out, 'src/standout.js');
    writeFileSync(feature, readFileSync(feature, 'utf8').replace('TODO_IMPLEMENT_STANDOUT: replace the generic sample signal with the promised concept behavior.', 'Implemented concept signal: compare value with baseline.'));
    const acceptance = join(out, 'test/standout.test.js');
    const lines = readFileSync(acceptance, 'utf8').split('\n');
    const marker = lines.findIndex((line) => line.includes('TODO_IMPLEMENT_ACCEPTANCE'));
    assert.notEqual(marker, -1);
    lines[marker] = "test('feature acceptance ranks West above North and South', () => { const rows = [{name:'North',value:18,baseline:25},{name:'West',value:31,baseline:27},{name:'South',value:12,baseline:24}]; const result = rankRows(rows); assert.equal(result[0].name, 'West'); assert.equal(result[0].score, 4); });";
    writeFileSync(acceptance, lines.join('\n'));
    // Style defaults do not create a mechanical signoff requirement.
    const reviewFile = join(out, 'docs/DESIGN_REVIEW.md');
    writeFileSync(reviewFile, readFileSync(reviewFile, 'utf8') + '\n- [ ] Ordinary draft note; not a release gate.\n');
    const git = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
    const bin = join(temp, 'bin'); mkdirSync(bin);
    const pushLog = join(temp, 'push.log'); const stub = join(bin, 'git');
    writeFileSync(stub, `#!/bin/sh\nif [ "$1" = "push" ]; then printf '%s\\n' "$*" >> "$BYO_PUSH_LOG"; exit 0; fi\nexec ${git} "$@"\n`);
    chmodSync(stub, 0o755);
    assert.equal(run([git, 'init', '-b', 'main'], out).status, 0);
    assert.equal(run([git, 'config', 'user.name', 'Scaffold Test'], out).status, 0);
    assert.equal(run([git, 'config', 'user.email', 'scaffold-test@example.invalid'], out).status, 0);
    assert.equal(run([git, 'add', '-A'], out).status, 0);
    assert.equal(run([git, 'commit', '-m', 'test verified release'], out).status, 0);
    const release = ['scripts/release.mjs', '--publish', '--verify', '--repo', 'example/priority-tool'];
    const releaseEnv = { PATH: `${bin}:${process.env.PATH}`, BYO_PUSH_LOG: pushLog };
    for (const remote of ['https://evil.example/prefix/example/priority-tool', 'https://github.com/mirror/example/priority-tool']) {
      assert.equal(run([git, 'remote', 'add', 'origin', remote], out).status, 0);
      const rejected = run(release, out, undefined, releaseEnv);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /exact GitHub repository/);
      assert.equal(existsSync(pushLog), false);
      assert.equal(run([git, 'remote', 'remove', 'origin'], out).status, 0);
    }
    assert.equal(run([git, 'remote', 'add', 'origin', 'git@github.com:example/priority-tool.git'], out).status, 0);
    const result = run(release, out, undefined, releaseEnv);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(pushLog, 'utf8'), /push -u origin HEAD/);
    assert.equal(JSON.parse(readFileSync(join(out, 'release-receipt.json'), 'utf8')).github.url, 'https://github.com/example/priority-tool');
    assert.equal(run([git, 'status', '--porcelain'], out).stdout.trim(), '');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('private nested concept fields are rejected before any project output exists', () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-private-concept-'));
  try {
    const input = join(temp, 'concept.json');
    const out = join(temp, 'must-not-exist');
    writeFileSync(input, JSON.stringify({ title: 'Safe shape', problem: 'P', user: 'U', standout: 'S', demo_steps: ['D'], sample_data: [{ nested: { career_history: [{ employer: 'private placeholder' }], api_key: 'secret-placeholder' } }] }));
    const rejected = run([cli, 'scaffold', input, '--out', out]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /private or credential field/);
    assert.equal(existsSync(out), false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('scaffold accepts a JSON concept object from stdin', () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-concept-stdin-'));
  try {
    const out = join(temp, 'project');
    const manifest = { name: 'Stdin Concept', problem: 'Review rows', user: 'Analyst', standout: { name: 'Row signal', description: 'Explain a row' }, demo_steps: ['load sample'], kind: 'cli' };
    const created = run([cli, 'scaffold', '-', '--out', out], root, JSON.stringify(manifest));
    assert.equal(created.status, 0, created.stderr);
    assert.equal(JSON.parse(readFileSync(join(out, 'concept.json'), 'utf8')).name, manifest.name);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('release command refuses release without explicit verification flag', () => {
  const temp = mkdtempSync(join(tmpdir(), 'byo-release-test-'));
  try {
    const out = join(temp, 'site');
    assert.equal(run([cli, 'scaffold', concept, '--out', out]).status, 0);
    const result = run(['scripts/release.mjs', '--deploy'], out);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires --verify/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
