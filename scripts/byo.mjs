#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, chmodSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, validate, privateField, publicConcept, safeName } from './concept.mjs';
import { projectPlan, readme } from './scaffold-docs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = `byo-kit — scaffold a local-first project from a concept manifest

Usage:
  node scripts/byo.mjs scaffold <concept.json|-> --out <directory>
  node scripts/byo.mjs check <project-directory>

Manifest schema: schemas/concept.schema.json
Example:         examples/concept.json
`;

function die(message) { console.error(`byo-kit: ${message}`); process.exit(1); }
function argsOf(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { out._.push(argv[i]); continue; }
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}
function json(value) { return JSON.stringify(value, null, 2) + '\n'; }
function write(root, path, content) {
  const target = join(root, path); mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function standalone(c) {
  return `// TODO_IMPLEMENT_STANDOUT: replace the generic sample signal with the promised concept behavior.\nexport function scoreRow(row) {\n  const value = Number(row.value);\n  const baseline = Number(row.baseline);\n  if (Number.isFinite(value) && Number.isFinite(baseline)) {\n    const delta = value - baseline;\n    return { score: delta, reason: delta >= 0 ? \`\${delta} above baseline\` : \`\${Math.abs(delta)} below baseline\` };\n  }\n  const fields = Object.keys(row ?? {}).length;\n  return { score: fields, reason: fields ? \`\${fields} fields available for review\` : 'Empty row' };\n}\n\nexport function rankRows(rows) {\n  return rows.map((row) => ({ ...row, ...scoreRow(row) })).sort((a, b) => b.score - a.score);\n}\n`;
}
function html(c) {
  const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const ai = c.ai ? '<details><summary>Optional OpenRouter key</summary><p>The sample ranking works without a key. Add a provider call only where it improves the result.</p><byo-key provider="openrouter"></byo-key></details>' : '';
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.name)}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"></head>\n<body><main><header><h1>${esc(c.name)}</h1><p class="lede">${esc(c.description || c.problem)}</p></header>\n<div class="workspace"><section aria-labelledby="input-title"><h2 id="input-title">Your data</h2><byo-data data-demo="sample" sample-url="/sample.json" accept=".json,.csv,.ndjson"></byo-data>${ai}</section>\n<section aria-labelledby="result-title"><h2 id="result-title">${esc(c.standout.name)}</h2><p class="standout-note">${esc(c.standout.description)}</p><div id="results" data-state="empty" aria-live="polite"><p>Load the sample or a local file to see the result.</p></div></section></div>\n<p id="status" role="status">Data stays in this browser.</p></main><script type="module" src="/vendor/byo-kit.js"></script><script type="module" src="/app.js"></script></body></html>\n`;
}
function app(c, sample) {
  return `import { rankRows } from './src/standout.js';\nconst results = document.querySelector('#results');\nconst status = document.querySelector('#status');\nconst data = document.querySelector('byo-data');\nfunction show(state, message) { results.dataset.state = state; status.textContent = message; }\ndata.validate = (rows) => Array.isArray(rows) && rows.length ? [] : ['Expected a non-empty list of rows.'];\ndata.addEventListener('byo-data', (event) => {\n  const rows = Array.isArray(event.detail.data) ? event.detail.data : [event.detail.data];\n  results.replaceChildren(); const list = document.createElement('ol');\n  for (const row of rankRows(rows)) { const li = document.createElement('li'); li.textContent = \`\${row.name ?? 'Row'}: \${row.reason}\`; list.append(li); }\n  results.append(list); show('ready', \`\${rows.length} rows ranked in this browser.\`);\n});\ndata.addEventListener('byo-data-error', () => {\n  const message = document.createElement('p'); message.textContent = 'Nothing was loaded. Fix the file and try again.';\n  results.replaceChildren(message); show('error', 'The input was rejected. No data left this browser.');\n});\n`;
}
function cli(c, sample) {
  return `import { readFile } from 'node:fs/promises';\nimport { pathToFileURL } from 'node:url';\nimport { rankRows } from './standout.js';\nexport { rankRows, scoreRow } from './standout.js';\nconst sample = ${json(sample).trim()};\nexport function analyze(rows) { if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new TypeError('Input must be a JSON array of objects'); return rankRows(rows); }\nasync function stdinText(stream = process.stdin) { let text = ''; for await (const chunk of stream) text += chunk; return text; }\nexport async function run(argv = process.argv.slice(2), io = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr }) {\n  if (argv.includes('--help') || argv.includes('-h')) { io.stdout.write('Usage: ${safeName(c.name)} [--json] [file.json]\\n       cat rows.json | ${safeName(c.name)} [--json]\\n'); return 0; }\n  const asJson = argv.includes('--json'); const path = argv.find((arg) => !arg.startsWith('--'));\n  try { const text = path ? await readFile(path, 'utf8') : await stdinText(io.stdin); const rows = text.trim() ? JSON.parse(text) : sample; const result = analyze(rows); io.stdout.write(asJson ? JSON.stringify(result, null, 2) + '\\n' : result.map((row) => \`\${row.name ?? 'Row'}: \${row.reason}\`).join('\\n') + '\\n'); return 0; }\n  catch (error) { io.stderr.write(\`invalid input: \${error.message}\\n\`); return 2; }\n}\nif (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await run();\n`;
}
function scaffold(raw, outArg) {
  const sensitive = privateField(raw); if (sensitive) die(`concept contains a private or credential field at ${sensitive}; keep personal research in career-only records`);
  const c = normalize(raw); const errors = validate(c); if (errors.length) die(errors.join('; '));
  const manifest = publicConcept(c, raw);
  const out = resolve(outArg); if (existsSync(out) && statSync(out).isDirectory() && readdirSync(out).length === 0) {} else if (existsSync(out)) die(`output already exists and is not empty: ${out}`);
  mkdirSync(out, { recursive: true });
  const sample = c.sample_data?.length ? c.sample_data : [{ name: 'Example', value: 12, baseline: 10 }, { name: 'Another', value: 6, baseline: 9 }];
  const slug = safeName(c.name);
  write(out, 'concept.json', json(manifest));
  const featurePath = c.kind === 'web' ? '../public/src/standout.js' : '../src/standout.js';
  write(out, 'test/standout.test.js', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { rankRows } from '${featurePath}';\ntest('standout API preserves each input row and returns a result explanation', () => { const rows = ${json(sample).trim()}; const result = rankRows(rows); assert.equal(result.length, rows.length); for (const row of result) { assert.equal(typeof row.score, 'number'); assert.equal(typeof row.reason, 'string'); assert.ok(row.reason.length > 0); } });\ntest(${JSON.stringify(`TODO_IMPLEMENT_ACCEPTANCE: ${c.standout.name}`)}, () => { assert.fail('Replace with concept-specific expected behavior before verification or release.'); });\n`);
  write(out, 'PROJECT_PLAN.md', projectPlan(c));
  write(out, 'README.md', readme(c) + '\n## Understand and modify\n\nUse [the practice guide](docs/PRACTICE.md) to explain the decisions, investigate a failure, and demonstrate a meaningful change. Use [the writing and design defaults](docs/DESIGN_REVIEW.md) while working.\n');
  write(out, 'docs/PRACTICE.md', readFileSync(join(ROOT, 'templates/practice.md'), 'utf8').replaceAll('{{project}}', c.name).replaceAll('{{standout}}', c.standout.description));
  write(out, 'docs/DESIGN_REVIEW.md', readFileSync(join(ROOT, 'templates/design-review.md'), 'utf8').replaceAll('{{project}}', c.name) + (c.kind === 'web' ? readFileSync(join(ROOT, 'templates/design-review-visual.md'), 'utf8') : ''));
  write(out, 'LICENSE', readFileSync(join(ROOT, 'LICENSE'), 'utf8'));
  write(out, '.gitignore', 'node_modules/\n.DS_Store\n*.log\nportfolio-handoff.json\ntiming.json\nrelease-receipt.json\n');
  write(out, 'package.json', json({ name: slug, version: '0.1.0', private: c.kind === 'web', type: 'module', ...(['cli', 'library'].includes(c.kind) ? { bin: { [slug]: './bin/cli.js' } } : {}), ...(c.kind === 'library' ? { exports: { '.': './src/index.js' }, files: ['src', 'bin', 'README.md', 'LICENSE'] } : {}), scripts: { test: 'node --test', verify: 'node scripts/verify.mjs', ...(c.kind === 'web' ? { dev: 'node tools/static-server.mjs public 8787', demo: 'node tools/record-demo.mjs --serve public --steps docs/demo-steps.json --out docs/demo.gif --max-seconds 9' } : { start: 'node src/index.js' }) } }));
  if (c.kind === 'web') {
    write(out, 'public/index.html', html(c)); write(out, 'public/app.js', app(c, sample)); write(out, 'public/sample.json', json(sample));
    write(out, 'public/src/standout.js', standalone(c));
    write(out, 'public/styles.css', readFileSync(join(ROOT, 'templates/project-styles.css'), 'utf8'));
    write(out, 'docs/demo-steps.json', json([{ goto: '/' }, { click: 'byo-data button:nth-of-type(2)' }, { wait: 300 }]));
    write(out, 'tools/static-server.mjs', readFileSync(join(ROOT, 'tools/static-server.mjs'), 'utf8'));
    write(out, 'tools/record-demo.mjs', readFileSync(join(ROOT, 'tools/record-demo.mjs'), 'utf8'));
    write(out, 'tools/find-playwright.mjs', readFileSync(join(ROOT, 'tools/find-playwright.mjs'), 'utf8'));
    write(out, 'wrangler.jsonc', readFileSync(join(ROOT, 'templates/wrangler.jsonc'), 'utf8').replaceAll('{{project}}', slug));
    write(out, 'worker.js', readFileSync(join(ROOT, 'templates/worker.js'), 'utf8'));
    write(out, 'public/vendor/byo-kit.js', readFileSync(join(ROOT, 'dist/byo-kit.js'), 'utf8'));
    write(out, 'smoke.mjs', readFileSync(join(ROOT, 'templates/project-smoke.mjs'), 'utf8'));
  } else {
    write(out, 'src/standout.js', standalone(c));
    write(out, 'src/index.js', cli(c, sample));
    write(out, 'bin/cli.js', '#!/usr/bin/env node\nimport { run } from "../src/index.js";\nprocess.exitCode = await run();\n'); chmodSync(join(out, 'bin/cli.js'), 0o755);
    write(out, 'sample.json', json(sample));
  }
  write(out, 'scripts/verify.mjs', readFileSync(join(ROOT, 'templates/project-verify.mjs'), 'utf8'));
  write(out, 'scripts/release.mjs', readFileSync(join(ROOT, 'templates/project-release.mjs'), 'utf8'));
  write(out, 'tools/release-url.mjs', readFileSync(join(ROOT, 'tools/release-url.mjs'), 'utf8'));
  write(out, 'script/cibuild', '#!/bin/sh\nset -eu\ncd "$(dirname "$0")/.."\nnpm test\n'); chmodSync(join(out, 'script/cibuild'), 0o755);
  write(out, '.github/workflows/ci.yml', readFileSync(join(ROOT, 'templates/github-ci.yml'), 'utf8'));
  write(out, '.depot/workflows/ci.yml', readFileSync(join(ROOT, 'templates/depot-project-ci.yml'), 'utf8'));
  const handoff = { schema_version: 1, project: { name: c.name, kind: c.kind, problem: c.problem, user: c.user, standout: c.standout, demo_steps: c.demo_steps }, artifacts: [{ type: 'source', path: '.' }, { type: 'practice_guide', path: 'docs/PRACTICE.md' }, ...(c.kind === 'web' ? [{ type: 'demo_gif', path: 'docs/demo.gif', status: 'not_recorded' }, { type: 'deployment', url: null, status: 'not_published' }] : [{ type: 'package', registry: 'npm', status: 'not_published' }])], application_handoff: { portfolio_inclusion: 'not_recorded', verified_submission: 'not_recorded; keep submission evidence in private career records' }, verification: { command: 'npm run verify', status: 'not_run' }, prior_art: c.prior_art || { decision: null, references: [], rationale: null }, privacy: 'public project metadata only; no personal career data' };
  write(out, 'portfolio-handoff.json', json(handoff));
  write(out, 'workflow-targets.json', json({ target_minutes: { concept_including_research: 3, build: 10, proof_package: 4, publish_application_inclusion_handoff: 3, total: 20 }, scope: 'Count fresh ideation or research in observed elapsed time when performed during this run; a pre-researched opportunity may start at concept selection. Application inclusion is in the final phase. Application submission is a separate explicitly authorized action and is recorded separately after verification.', targets_are_not_guarantees: true }));
  write(out, 'timing.json', json({ phase_minutes_measured: { concept_research: null, build: null, proof_package: null, publish_application_handoff: null }, measured_elapsed_minutes_total: null, scaffold_ms: null, verify_ms: null, measured_at: null, targets_are_not_measurements: true }));
  return out;
}
function check(dir) {
  const root = resolve(dir); const manifestPath = join(root, 'concept.json');
  if (!existsSync(manifestPath)) die(`not a generated project: ${manifestPath} is missing`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sensitive = privateField(manifest); if (sensitive) die(`public concept contains a private or credential field at ${sensitive}`);
  const allowed = new Set(['name', 'title', 'problem', 'user', 'standout', 'demo_steps', 'kind', 'ai', 'prior_art', 'description', 'sample_data', 'features']);
  const extra = Object.keys(manifest).find((key) => !allowed.has(key)); if (extra) die(`public concept contains unsupported field ${extra}`);
  const errors = validate(normalize(manifest));
  if (errors.length) die(errors.join('; '));
  const handoff = JSON.parse(readFileSync(join(root, 'portfolio-handoff.json'), 'utf8'));
  for (const forbidden of ['email', 'phone', 'resume', 'salary', 'employer', 'career_history']) if (forbidden in handoff) die(`handoff contains forbidden personal field: ${forbidden}`);
  console.log(`check: ${basename(root)} manifest and generic handoff are valid`);
}

const args = argsOf(process.argv.slice(2));
if (!args._.length || args._[0] === 'help' || args.help) { console.log(USAGE); process.exit(0); }
if (args._[0] === 'scaffold') {
  if (!args._[1] || !args.out || args.out === true) die('scaffold needs a concept file and --out directory');
  const started = performance.now(); const source = args._[1] === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(args._[1]), 'utf8'); const raw = JSON.parse(source);
  const out = scaffold(raw, args.out); const elapsed = Math.round(performance.now() - started);
  const timingFile = join(out, 'timing.json'); const timing = JSON.parse(readFileSync(timingFile, 'utf8')); timing.scaffold_ms = elapsed; timing.measured_at = new Date().toISOString(); writeFileSync(timingFile, json(timing));
  console.log(`scaffold: ${out}`); console.log(`measured scaffold time: ${elapsed} ms (generation only; 20-minute workflow is a target)`);
} else if (args._[0] === 'check') { if (!args._[1]) die('check needs a generated project directory'); check(args._[1]); }
else die(`unknown command ${args._[0]}\n${USAGE}`);
