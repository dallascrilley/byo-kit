import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/byo.mjs'), ...args], { encoding: 'utf8' });
// Synthetic source records test the contract; they do not claim live research.
function brief() {
  const candidate = (id, user, problem, mechanism) => ({
    id, mechanism,
    concept: { name: id, kind: 'cli', user, problem, standout: mechanism, demo_steps: ['Run fixture', 'Inspect explanation'],
      prior_art: { decision: 'extend', references: ['https://example.invalid/tool'], rationale: 'Add a reproducible failure fixture to the existing parser.' },
      proof_plan: { capability: 'Diagnose data integrity failures', baseline: 'Compare against an unvalidated import.',
        acceptance: [{ input: 'Two records share an identifier.', expected: 'Explain the collision with both source locations.', failure: 'Reject malformed identifiers without changing the source.' }],
        case_study_hypothesis: 'Investigate whether source locations make collision diagnosis reproducible.' } },
    gap_fit: 'The fixture exercises diagnosis and explains its boundary.',
    usefulness: 'The operator can locate bad source records before importing.',
    demo_quality: 'One fixture exposes a collision and its locations in under nine seconds.',
    case_study_potential: 'Compare explanations with and without locations; revise the hypothesis after results.',
    evidence: [{ url: 'https://example.invalid/report', checked_at: '2026-10-28', finding: 'Synthetic report for this test fixture.' }],
  });
  return { version: 1, job_gap: { requirement: 'Experience investigating incidents for ConfidentialCo',
    capability: 'Diagnose data integrity failures', evidence_needed: 'Reproduce an integrity failure and explain its source without changing the input.', context: { employer: 'ConfidentialCo', role: 'Private role', posting_url: 'https://example.invalid/private-role' } },
    candidates: [candidate('collision-map', 'Warehouse operator', 'Imports hide identifier collisions.', 'Preserve source locations during validation.'),
      candidate('schedule-replay', 'Transit planner', 'Conflicting windows break schedules.', 'Replay overlapping windows with a counterexample.')],
    decision: { selected: 'collision-map', rationale: 'A direct observable failure with useful output.',
      tradeoffs: [{ id: 'schedule-replay', reason: 'Replay needs more domain validation.' }] } };
}
function sandbox(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'byo-selection-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function put(dir, value) { const path = join(dir, 'brief.json'); writeFileSync(path, JSON.stringify(value)); return path; }

test('brief is private, refuses overwrite, and starts unselectable', () => sandbox(dir => {
  const path = join(dir, 'brief.json');
  assert.equal(run('brief', '--out', path).status, 0);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const before = readFileSync(path, 'utf8');
  assert.notEqual(run('brief', '--out', path).status, 0);
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.notEqual(run('select', path, '--out', join(dir, 'public.json')).status, 0);
  assert.equal(existsSync(join(dir, 'public.json')), false);
}));

test('compare accepts two concepts without scores or a timely hook and hides career context', () => sandbox(dir => {
  const b = brief(); delete b.decision;
  const result = run('compare', put(dir, b));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.indexOf(b.job_gap.capability) < result.stdout.indexOf('collision-map'));
  for (const word of ['Usefulness', 'Demo', 'Case study', 'not supplied', 'professional tenure']) assert.ok(result.stdout.includes(word), word);
  assert.doesNotMatch(result.stdout + result.stderr, /ConfidentialCo|Private role|private-role|Experience investigating/);
}));

test('select exports the existing public concept format with a scaffolded proof plan', () => sandbox(dir => {
  const input = put(dir, brief()); const output = join(dir, 'chosen.json');
  const selected = run('select', input, '--out', output);
  assert.equal(selected.status, 0, selected.stderr);
  const c = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(c.name, 'collision-map');
  assert.equal('job_gap' in c, false);
  assert.equal('gap_fit' in c, false);
  const out = join(dir, 'project');
  assert.equal(run('scaffold', output, '--out', out).status, 0);
  assert.equal(run('check', out).status, 0);
  assert.match(readFileSync(join(out, 'PROJECT_PLAN.md'), 'utf8'), /Two records share an identifier/);
  const allText = p => readdirSync(p, { withFileTypes: true }).map(e => e.isDirectory() ? allText(join(p, e.name)) : readFileSync(join(p, e.name), 'utf8')).join('\n');
  assert.doesNotMatch(allText(out), /ConfidentialCo|Private role|private-role|Experience investigating|gap_fit/);
  assert.notEqual(run('select', input, '--out', output).status, 0);
}));

test('selection rejects padding, unrelated capability, missing evidence and incomplete decisions', () => sandbox(dir => {
  for (const mutate of [
    b => { b.candidates.pop(); },
    b => { delete b.job_gap.evidence_needed; },
    b => { b.candidates[1].mechanism = b.candidates[0].mechanism.toUpperCase(); },
    b => { b.candidates[1].concept = { ...b.candidates[0].concept, name: 'renamed', kind: 'web' }; },
    b => { b.candidates[0].concept.proof_plan.capability = 'Unrelated'; },
    b => { b.candidates[0].evidence = []; },
    b => { b.candidates[0].evidence[0].checked_at = '2026-02-31'; },
    b => { b.candidates[0].concept.proof_plan.acceptance[0].failure = ''; },
    b => { b.candidates[0].usefulness = 'TODO'; },
    b => { b.decision.tradeoffs = []; },
    b => { b.decision.selected = 'missing'; },
    b => { b.candidates[0].concept.proof_plan.professional_tenure = '5 years'; },
  ]) {
    const b = brief(); mutate(b); const out = join(dir, 'public.json');
    assert.notEqual(run('select', put(dir, b), '--out', out).status, 0);
    assert.equal(existsSync(out), false);
  }
}));

test('comparison rejects declared private context in evidence needed without printing it', () => sandbox(dir => {
  const b = brief(); b.job_gap.evidence_needed = 'Provide a demo for ConfidentialCo';
  const result = run('compare', put(dir, b));
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /ConfidentialCo/);
}));

test('private keys and literal private context cannot reach exported public values or logs', () => sandbox(dir => {
  for (const mutate of [
    b => { b.candidates[0].concept.problem = 'Help ConfidentialCo investigate incidents'; },
    b => { b.candidates[0].concept.demo_steps = [b.job_gap.context.posting_url]; },
    b => { b.candidates[0].concept.sample_data = [{ job_description: 'private text' }]; },
    b => { b.candidates[0].concept.description = b.job_gap.requirement; },
  ]) {
    const b = brief(); mutate(b); const out = join(dir, 'public.json');
    const result = run('select', put(dir, b), '--out', out);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /ConfidentialCo|private-role|Experience investigating/);
    assert.equal(existsSync(out), false);
  }
}));

test('tenure requirements produce capability plans without certifying employment duration', () => sandbox(dir => {
  const b = brief(); b.job_gap.requirement = 'Five years of professional incident response experience';
  const result = run('select', put(dir, b), '--out', join(dir, 'public.json'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /professional tenure.*not demonstrated/i);
  assert.doesNotMatch(result.stdout, /requirement (met|satisfied)|gap (closed|filled)/i);
}));

test('hook event date stays distinct from observation date; unknown remains eligible', () => sandbox(dir => {
  for (const event_date of ['2020-01-02', 'unknown', null, undefined]) {
    const b = brief();
    b.candidates[0].timely_hook = { url: 'https://example.invalid/release', checked_at: '2026-10-28', event_date, advantage: 'A migration creates a concrete fixture.' };
    const result = run('compare', put(dir, b));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('event/release date: ' + (event_date || 'unknown') + ' | checked_at: 2026-10-28'));
    assert.doesNotMatch(result.stdout, /recent release|fresh event/i);
  }
  const b = brief();
  b.candidates[0].timely_hook = { url: 'https://example.invalid/release', checked_at: '2026-10-28', event_date: '2026-02-31', advantage: 'A migration' };
  assert.notEqual(run('select', put(dir, b), '--out', join(dir, 'invalid-hook.json')).status, 0);
  assert.equal(existsSync(join(dir, 'invalid-hook.json')), false);
}));

test('standalone scaffold rejects private job fields and malformed optional proof before writing', () => sandbox(dir => {
  for (const patch of [{ job_gap: { requirement: 'private' } }, { proof_plan: { capability: 'Only a label' } }]) {
    const c = { ...brief().candidates[0].concept, ...patch }; const out = join(dir, 'project');
    assert.notEqual(run('scaffold', put(dir, c), '--out', out).status, 0);
    assert.equal(existsSync(out), false);
  }
}));
