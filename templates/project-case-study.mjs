// Objective packaging checks only. Editorial quality and truth need a source review.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const article = readFileSync('docs/CASE_STUDY.md', 'utf8');
const words = (article.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^```.*$/gm, '').match(/\S+/gu) || []).length;
if (!/^#\s+\S/m.test(article)) throw new Error('Case study needs a descriptive title.');
if (/TODO_CASE_STUDY|\{\{[^}]+\}\}/.test(article)) throw new Error('Replace the case study draft placeholders before checking.');
if (words < 1 || words >= 1000) throw new Error(`Case study must contain fewer than 1,000 words; found ${words}.`);
const release = JSON.parse(readFileSync('release-receipt.json', 'utf8'));
const handoff = JSON.parse(readFileSync('portfolio-handoff.json', 'utf8'));
let previous = {};
try { previous = JSON.parse(readFileSync('case-study-receipt.json', 'utf8')); } catch {}
const github = release.github;
if (github?.status !== 'pushed' || !/^[a-f0-9]{40}$/.test(github.commit || '') ||
    !/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+$/.test(github.url || '')) {
  throw new Error('Link the finished project after a recorded GitHub release.');
}
if (handoff.verification?.status !== 'passed' ||
    !/^[a-f0-9]{64}$/.test(handoff.verification.source_sha256 || '') ||
    github.verified_source_sha256 !== handoff.verification.source_sha256) {
  throw new Error('Project release and verified source must match.');
}
const links = [...article.matchAll(/\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g)].map(m => m[1].replace(/\/$/, ''));
if (!links.includes(github.url.replace(/\/$/, ''))) throw new Error('Article must link to the released project repository.');
if (release.cloudflare?.status === 'deployed') {
  if (release.cloudflare.verified_source_sha256 !== github.verified_source_sha256) throw new Error('Demo release must match verified project source.');
  if (!links.includes(release.cloudflare.url?.replace(/\/$/, ''))) throw new Error('Article must link to the released live demo.');
}
const receipt = {
  status: 'format_and_links_checked', article: 'docs/CASE_STUDY.md', word_count: words,
  article_sha256: createHash('sha256').update(article).digest('hex'),
  project_url: github.url, project_commit: github.commit,
  checked_at: new Date().toISOString(), editorial_review: 'not_certified',
  publication: previous.publication === 'verified_live_page' && previous.draft_sha256_at_publication_check !== createHash('sha256').update(article).digest('hex')
    ? 'stale_article' : (previous.publication || 'not_recorded'),
  ...(previous.publication_url ? { publication_url: previous.publication_url } : {}),
  ...(previous.draft_sha256_at_publication_check ? { draft_sha256_at_publication_check: previous.draft_sha256_at_publication_check } : {}),
  readme_backlink: previous.readme_backlink || 'not_recorded',
  limits: 'Local release-receipt binding only; no live link, truth, style, novelty or community-policy verification.'
};
writeFileSync('case-study-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
const artifact = { type: 'case_study', path: receipt.article, status: receipt.status, word_count: words, sha256: receipt.article_sha256, project_commit: github.commit, publication: receipt.publication, readme_backlink: receipt.readme_backlink, ...(receipt.publication_url ? { publication_url: receipt.publication_url } : {}) };
handoff.artifacts = [...(handoff.artifacts || []).filter(a => a.type !== 'case_study'), artifact];
writeFileSync('portfolio-handoff.json', JSON.stringify(handoff, null, 2) + '\n');
console.log(`Case study: ${words} words; finished-project links match the release receipt. Editorial review and publication remain separate.`);
