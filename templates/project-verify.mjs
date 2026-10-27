import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const started = performance.now();
const concept = JSON.parse(readFileSync('concept.json', 'utf8'));
const feature = concept.kind === 'web' ? 'public/src/standout.js' : 'src/standout.js';
const acceptance = readFileSync('test/standout.test.js', 'utf8');
if (readFileSync(feature, 'utf8').includes('TODO_IMPLEMENT_STANDOUT')) throw new Error('Implement the concept standout in ' + feature + ' before verification.');
if (acceptance.includes('TODO_IMPLEMENT_ACCEPTANCE')) throw new Error('Replace the concept-specific failing acceptance test before verification.');

if (concept.kind === 'web') {
  if (!readFileSync('README.md', 'utf8').includes('docs/demo.gif')) throw new Error('README must include the generated demo GIF.');
  if (!existsSync('docs/demo.gif')) throw new Error('Run npm run demo before verification; docs/demo.gif is required.');
  const duration = spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', 'docs/demo.gif'], { encoding: 'utf8' });
  if (duration.status !== 0 || !Number.isFinite(Number(duration.stdout.trim())) || Number(duration.stdout.trim()) >= 10) throw new Error('Demo must be a readable GIF shorter than 10 seconds.');
  const smoke = spawnSync(process.execPath, ['smoke.mjs'], { stdio: 'inherit' });
  if (smoke.status !== 0) process.exit(smoke.status ?? 1);
}

const tests = spawnSync(process.execPath, ['--test'], { stdio: 'inherit' });
if (tests.status !== 0) process.exit(tests.status ?? 1);

const handoff = JSON.parse(readFileSync('portfolio-handoff.json', 'utf8'));
const forbidden = /e.?mail|phone|resume|salary|employer|career|linkedin|address|personal|private|credential|secret|token|api.?key|password|ssn|date.?of.?birth/i;
const scan = (value, path = '$') => {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key)) throw new Error(`Personal or credential field in public handoff at ${path}.${key}`);
    scan(child, `${path}.${key}`);
  }
};
scan(handoff);

function files(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => files(join(path, name)));
}
const hashedFiles = ['concept.json', 'package.json', 'README.md', 'LICENSE', 'PROJECT_PLAN.md', 'src', 'public', 'test', 'scripts', 'script', 'smoke.mjs', 'wrangler.jsonc', 'worker.js', '.github', '.depot', 'docs/demo-steps.json', ...(concept.kind === 'web' ? ['docs/demo.gif'] : [])].flatMap(files).sort();
const hash = createHash('sha256');
for (const file of hashedFiles) { hash.update(relative('.', file)); hash.update('\0'); hash.update(readFileSync(file)); hash.update('\0'); }
handoff.verification = { status: 'passed', command: 'npm run verify', source_sha256: hash.digest('hex'), checked_files: hashedFiles.length, checked_at: new Date().toISOString(), ...(concept.kind === 'web' ? { browser_smoke: 'passed', demo_duration_seconds: Number(spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', 'docs/demo.gif'], { encoding: 'utf8' }).stdout.trim()) } : {}) };
writeFileSync('portfolio-handoff.json', JSON.stringify(handoff, null, 2) + '\n');
const timing = JSON.parse(readFileSync('timing.json', 'utf8'));
timing.verify_ms = Math.round(performance.now() - started);
timing.measured_at = new Date().toISOString();
writeFileSync('timing.json', JSON.stringify(timing, null, 2) + '\n');
console.log(`verify: behavior, privacy, ${concept.kind === 'web' ? 'browser flow and short GIF' : 'CLI/library'} passed; source sha256 ${handoff.verification.source_sha256}`);
