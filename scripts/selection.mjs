// Private career context stays in the brief. Only an existing public concept is exported.
import { readFileSync, writeFileSync } from 'node:fs';
import { normalize, validate, privateField, publicConcept } from './concept.mjs';

const text = v => typeof v === 'string' && !!v.trim();
const key = v => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const filled = v => text(v) && !/TODO|\{\{|\[replace/i.test(v);
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const strings = v => typeof v === 'string' ? [v] : object(v) || Array.isArray(v) ? Object.values(v).flatMap(strings) : [];
const http = v => { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } };
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

export function validateSelection(b, selecting = false) {
  const errors = [];
  if (!object(b) || b.version !== 1) return ['selection brief must be a version 1 object'];
  const gap = b.job_gap;
  if (!object(gap) || !filled(gap.requirement) || !filled(gap.capability) || !filled(gap.evidence_needed)) errors.push('job_gap needs a private requirement, public capability and observable evidence_needed before comparison');
  if (gap?.context !== undefined && (!object(gap.context) || Object.values(gap.context).some(v => typeof v !== 'string'))) errors.push('job_gap.context must contain private text values');
  if (b.private_terms !== undefined && (!Array.isArray(b.private_terms) || b.private_terms.some(v => !text(v)))) errors.push('private_terms must be an array of identifying strings');
  const privateTerms = [...strings(gap?.context), ...(Array.isArray(b.private_terms) ? b.private_terms : []), gap?.requirement].filter(text).map(key).filter(v => v.length >= 3);
  const leaks = value => strings(value).some(s => privateTerms.some(term => key(s).includes(term)));
  if (leaks([gap?.capability, gap?.evidence_needed])) errors.push('public capability or evidence target repeats private context; generalize it before comparison');
  if (!Array.isArray(b.candidates) || b.candidates.length < 2) return [...errors, 'compare at least two distinct concepts; do not pad to a fixed count'];
  const ids = new Set(), mechanisms = new Set(), concepts = new Set();
  b.candidates.forEach((candidate, i) => {
    const at = 'candidate ' + (i + 1);
    if (!object(candidate)) { errors.push(at + ' must be an object'); return; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.id || '') || ids.has(candidate.id)) errors.push(at + ' needs a unique slug id');
    ids.add(candidate.id);
    for (const field of ['mechanism', 'gap_fit', 'usefulness', 'demo_quality', 'case_study_potential']) {
      if (!filled(candidate[field])) errors.push(at + ' needs a completed ' + field);
    }
    if (mechanisms.has(key(candidate.mechanism))) errors.push(at + ' repeats an approach; a new label or format is not a distinct concept');
    mechanisms.add(key(candidate.mechanism));
    // Never print supplied private values, including untrusted object keys, on rejection.
    if (leaks(candidate)) errors.push(at + ' repeats private context in comparison/public content');
    const raw = candidate.concept;
    if (!object(raw)) { errors.push(at + ' needs a concept manifest'); return; }
    if (privateField(raw)) errors.push(at + ' contains private job or credential fields');
    const c = normalize(raw);
    if (validate(c).length) errors.push(at + ' has an invalid concept or proof_plan');
    const signature = key([c.problem, c.user, c.standout?.description].join(' '));
    if (concepts.has(signature)) errors.push(at + ' repeats the same problem, user and behavior');
    concepts.add(signature);
    if (!c.proof_plan || key(c.proof_plan.capability) !== key(gap?.capability)) errors.push(at + ' proof_plan must demonstrate the chosen capability');
    if (strings(c).some(s => /TODO|\{\{/i.test(s))) errors.push(at + ' concept still contains placeholders');
    if (!c.prior_art || !filled(c.prior_art.rationale) || !Array.isArray(c.prior_art.references) || !c.prior_art.references.length || !c.prior_art.references.every(http)) errors.push(at + ' needs reviewed prior art with source URLs and an approach rationale');
    if (!Array.isArray(candidate.evidence) || !candidate.evidence.length || candidate.evidence.some(e => !object(e) || !http(e.url) || !date(e.checked_at) || !filled(e.finding))) errors.push(at + ' needs problem evidence [{url, checked_at: YYYY-MM-DD, finding}]');
    if (candidate.timely_hook !== undefined && (!object(candidate.timely_hook) || !http(candidate.timely_hook.url) || !date(candidate.timely_hook.checked_at) || !filled(candidate.timely_hook.advantage) ||
        ![undefined, null, 'unknown'].includes(candidate.timely_hook.event_date) && !date(candidate.timely_hook.event_date))) errors.push(at + ' timely_hook is optional; supply url, checked_at, advantage and event_date as YYYY-MM-DD or unknown');
  });
  if (selecting) {
    const d = b.decision;
    if (!object(d) || !ids.has(d.selected) || !filled(d.rationale)) errors.push('decision needs a selected candidate id and a concrete rationale; leave undecided or skip building until ready');
    const others = b.candidates.filter(c => object(c) && c.id !== d?.selected).map(c => c.id);
    if (!Array.isArray(d?.tradeoffs) || d.tradeoffs.length !== others.length ||
        new Set(d.tradeoffs.map(t => t?.id)).size !== others.length ||
        d.tradeoffs.some(t => !object(t) || !others.includes(t.id) || !filled(t.reason))) errors.push('decision tradeoffs must explain each unselected concept exactly once');
  }
  return errors;
}

export function comparison(b) {
  const lines = ['Capability to demonstrate: ' + b.job_gap.capability,
    'Evidence needed: ' + b.job_gap.evidence_needed,
    'Plan review only. Capability results remain unverified; professional tenure is not demonstrated.'];
  for (const c of b.candidates) {
    lines.push('', c.id + ': ' + normalize(c.concept).name, 'Approach: ' + c.mechanism,
      'Capability fit: ' + c.gap_fit, 'Usefulness: ' + c.usefulness, 'Demo: ' + c.demo_quality,
      'Case study hypothesis: ' + c.case_study_potential,
      'Timely hook: ' + (c.timely_hook ? c.timely_hook.advantage + ' | event/release date: ' + (c.timely_hook.event_date || 'unknown') + ' | checked_at: ' + c.timely_hook.checked_at + ' | ' + c.timely_hook.url : 'not supplied; optional advantage'),
      ...c.evidence.map(e => 'Problem source: ' + e.url + ' | checked ' + e.checked_at + ' | ' + e.finding));
  }
  return lines.join('\n');
}

export function selectionCommand(command, input, output) {
  if (command === 'brief') {
    if (!output || output === true) throw new Error('brief needs --out <private-file>');
    writeFileSync(output, readFileSync(new URL('../templates/concept-selection.json', import.meta.url)), { flag: 'wx', mode: 0o600 });
    return 'Private draft created. Define the job capability first; keep this file outside public projects.';
  }
  if (!input) throw new Error(command + ' needs a private selection brief');
  let b;
  try { b = JSON.parse(readFileSync(input, 'utf8')); } catch { throw new Error('cannot read selection brief as JSON'); }
  const errors = validateSelection(b, command === 'select');
  if (errors.length) throw new Error(errors.join('; '));
  if (command === 'compare') return comparison(b);
  if (!output || output === true) throw new Error('select needs --out <new-public-concept.json>');
  const raw = b.candidates.find(c => c.id === b.decision.selected).concept;
  writeFileSync(output, JSON.stringify(publicConcept(normalize(raw), raw), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return 'Public concept exported. Capability evidence is planned, not verified; professional tenure is not demonstrated. Review public text before release.';
}
