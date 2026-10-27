export function normalize(c) {
  const standout = typeof c.standout === 'string' ? { name: 'Standout feature', description: c.standout } : c.standout;
  return { ...c, name: String(c.name || c.title || '').trim(), standout,
    kind: c.kind || 'web', ai: c.ai === true || c.openrouter === true,
    demo_steps: c.demo_steps || c.demoSteps };
}

export function validate(c) {
  const errors = [];
  for (const k of ['name', 'problem', 'user']) if (typeof c[k] !== 'string' || !c[k].trim()) errors.push(`missing non-empty ${k}`);
  if (!c.standout || typeof c.standout.name !== 'string' || typeof c.standout.description !== 'string') errors.push('standout must be a string or {name, description}');
  if (!['web', 'cli', 'library'].includes(c.kind)) errors.push('kind must be web, cli or library');
  if (!Array.isArray(c.demo_steps) || !c.demo_steps.length) errors.push('demo_steps must be a non-empty array');
  if (c.prior_art && (!['extend', 'contribute', 'wrap', 'new'].includes(c.prior_art.decision) || !Array.isArray(c.prior_art.references) || typeof c.prior_art.rationale !== 'string')) errors.push('prior_art needs decision (extend|contribute|wrap|new), references[], and rationale');
  if (c.sample_data !== undefined && (!Array.isArray(c.sample_data) || c.sample_data.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))) errors.push('sample_data must be an array of objects');
  return errors;
}

export function privateField(value, path = '$') {
  if (!value || typeof value !== 'object') return null;
  const blocked = /e.?mail|phone|resume|salary|employer|career|linkedin|address|personal|private|credential|secret|token|api.?key|password|ssn|date.?of.?birth/i;
  for (const [key, child] of Object.entries(value)) {
    if (blocked.test(key)) return `${path}.${key}`;
    const found = privateField(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function publicConcept(c, raw) {
  const out = { name: c.name, problem: c.problem, user: c.user, standout: c.standout, demo_steps: c.demo_steps, kind: c.kind, ai: c.ai };
  for (const key of ['title', 'description', 'sample_data', 'features']) if (raw[key] !== undefined) out[key] = raw[key];
  if (raw.prior_art !== undefined) out.prior_art = {
    decision: raw.prior_art.decision,
    references: raw.prior_art.references,
    rationale: raw.prior_art.rationale,
  };
  return out;
}

export function safeName(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'starter'; }
