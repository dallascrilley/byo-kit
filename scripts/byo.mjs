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
  const desc = esc(c.description || c.problem);
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.name)}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"></head>\n<body><main><p class="eyebrow">LOCAL-FIRST DEMO</p><h1>${esc(c.name)}</h1><p>${desc}</p><section class="actions"><byo-data data-demo="sample" sample-url="/sample.json" accept=".json,.csv,.ndjson"></byo-data>${c.ai ? '<details><summary>Optional OpenRouter key</summary><p>AI is an optional extension. This starter feature works without a key. Use the existing byo-key component when you add a provider call.</p><byo-key provider="openrouter"></byo-key></details>' : ''}</section><section><h2>${esc(c.standout.name)}</h2><p>${esc(c.standout.description)}</p><div id="results" aria-live="polite"><p>Load the sample or a local file to see the result.</p></div></section><p id="status" role="status">Data stays in this browser.</p></main><script type="module" src="/vendor/byo-kit.js"></script><script type="module" src="/app.js"></script></body></html>\n`;
}
const PROJECT_CSS = 'body{margin:0;min-height:100vh;padding:1rem;display:grid;place-items:center;background:#f6f7f5;color:#17221e;font:16px/1.45 system-ui,sans-serif}main{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);grid-template-areas:"eyebrow eyebrow" "title title" "intro intro" "actions results" "status status";gap:.35rem 1.25rem;width:min(1100px,100%);margin:auto;padding:1.2rem 1.5rem;background:#fff;border:1px solid #dce4df;border-radius:16px;box-shadow:0 12px 36px #17221e12}.eyebrow{grid-area:eyebrow;margin:0;color:#287759;font-weight:700;letter-spacing:.12em}h1{grid-area:title;margin:.1rem 0;font-size:clamp(1.9rem,3.2vw,2.8rem);line-height:1.05}main>p:not(.eyebrow):not(#status){grid-area:intro;margin:0 0 .45rem}.actions{grid-area:actions;margin:0}byo-data{display:block;width:100%}main>section:not(.actions){grid-area:results;margin:0;padding:.8rem 1rem;background:#f8faf8;border:1px solid #e2e8e4;border-radius:12px}h2{margin:0}li{padding:.55rem .35rem;border-bottom:1px solid #e2e8e4}#status{grid-area:status;margin:.25rem 0 0;color:#476157}@media(max-width:760px){body{display:block;padding:.6rem}main{grid-template-columns:minmax(0,1fr);grid-template-areas:"eyebrow" "title" "intro" "actions" "results" "status";gap:.45rem;padding:1rem;margin:.25rem auto}h1{font-size:clamp(1.8rem,8vw,2.4rem)}}';
function app(c, sample) {
  return `import { rankRows } from './src/standout.js';\nconst results = document.querySelector('#results');\nconst data = document.querySelector('byo-data');\ndata.validate = (rows) => Array.isArray(rows) && rows.length ? [] : ['Expected a non-empty list of rows.'];\ndata.addEventListener('byo-data', (event) => {\n  const rows = Array.isArray(event.detail.data) ? event.detail.data : [event.detail.data];\n  results.replaceChildren(); const list = document.createElement('ol');\n  for (const row of rankRows(rows)) { const li = document.createElement('li'); li.textContent = \`\${row.name ?? 'Row'}: \${row.reason}\`; list.append(li); }\n  results.append(list);\n});\n`;
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
  write(out, 'README.md', readme(c) + '\n## Understand and modify\n\nUse [the practice guide](docs/PRACTICE.md) to explain the decisions, investigate a failure, and demonstrate a meaningful change.\n');
  write(out, 'docs/PRACTICE.md', readFileSync(join(ROOT, 'templates/practice.md'), 'utf8').replaceAll('{{project}}', c.name).replaceAll('{{standout}}', c.standout.description));
  write(out, 'LICENSE', readFileSync(join(ROOT, 'LICENSE'), 'utf8'));
  write(out, '.gitignore', 'node_modules/\n.DS_Store\n*.log\nportfolio-handoff.json\ntiming.json\nrelease-receipt.json\n');
  write(out, 'package.json', json({ name: slug, version: '0.1.0', private: c.kind === 'web', type: 'module', ...(['cli', 'library'].includes(c.kind) ? { bin: { [slug]: './bin/cli.js' } } : {}), ...(c.kind === 'library' ? { exports: { '.': './src/index.js' }, files: ['src', 'bin', 'README.md', 'LICENSE'] } : {}), scripts: { test: 'node --test', verify: 'node scripts/verify.mjs', ...(c.kind === 'web' ? { dev: 'node tools/static-server.mjs public 8787', demo: 'node tools/record-demo.mjs --serve public --steps docs/demo-steps.json --out docs/demo.gif --max-seconds 9' } : { start: 'node src/index.js' }) } }));
  if (c.kind === 'web') {
    write(out, 'public/index.html', html(c)); write(out, 'public/app.js', app(c, sample)); write(out, 'public/sample.json', json(sample));
    write(out, 'public/src/standout.js', standalone(c));
    write(out, 'public/styles.css', PROJECT_CSS + 'button,.upload{padding:.8rem 1rem;border-radius:8px;border:1px solid #287759;background:#e7f4ec;color:#183b2d;font:inherit;cursor:pointer}');
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
