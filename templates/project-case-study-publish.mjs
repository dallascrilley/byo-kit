import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

const start = '<!-- byo-kit:case-study:start -->';
const end = '<!-- byo-kit:case-study:end -->';
const normalize = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

function publicArticleUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Pass the published article URL with --published-url.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal|test)$/.test(url.hostname) || url.hostname.endsWith('.example')) {
    throw new Error('Published article URL must be a public HTTPS page URL without credentials or a fragment.');
  }
  return url;
}

function publicAddress(address) {
  const v4 = address.split('.').map(Number);
  if (v4.length === 4 && v4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return !(v4[0] === 0 || v4[0] === 10 || v4[0] === 127 || v4[0] >= 224 ||
      (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127) || (v4[0] === 169 && v4[1] === 254) ||
      (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) || (v4[0] === 192 && (v4[1] === 0 || v4[1] === 168)) ||
      (v4[0] === 198 && (v4[1] === 18 || v4[1] === 19 || v4[1] === 51)) || (v4[0] === 203 && v4[1] === 0 && v4[2] === 113));
  }
  const first = Number.parseInt(address.split(':')[0], 16);
  return Number.isInteger(first) && first >= 0x2000 && first <= 0x3fff && !address.toLowerCase().startsWith('2001:db8:');
}

async function pageText(response) {
  if (!response.ok) throw new Error(`Published page returned HTTP ${response.status}.`);
  if (response.headers?.get?.('content-type') && !response.headers.get('content-type').toLowerCase().includes('text/html')) {
    throw new Error('Published URL did not return an HTML page.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 2_000_000) throw new Error('Published page exceeds the 2 MB validation limit.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function verifyPublishedHtml(html, title, repositoryUrl) {
  const textOf = (value) => decode(value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '));
  const titles = [...html.matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((m) => normalize(textOf(m[2])));
  if (!titles.includes(normalize(title))) throw new Error('Published page title or heading does not match the case study title.');
  const expected = new URL(repositoryUrl);
  const hrefs = [...html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)].map((m) => decode(m[2]));
  const hasRepository = hrefs.some((href) => {
    try { const link = new URL(href); return link.origin === expected.origin && link.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, ''); }
    catch { return false; }
  });
  if (!hasRepository) throw new Error('Published page does not link to the released project repository.');
}

export async function recordPublication({ root = process.cwd(), url, fetchImpl = fetch, lookupImpl = lookup }) {
  const article = await readFile(`${root}/docs/CASE_STUDY.md`, 'utf8');
  const title = article.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title || /TODO_CASE_STUDY|\{\{[^}]+\}\}/.test(article)) throw new Error('Finish the case study draft before recording publication.');
  const receipt = JSON.parse(await readFile(`${root}/case-study-receipt.json`, 'utf8'));
  if (receipt.status !== 'format_and_links_checked' || receipt.article_sha256 !== createHash('sha256').update(article).digest('hex')) {
    throw new Error('Run npm run blog:check after the final article edit before recording publication.');
  }
  const release = JSON.parse(await readFile(`${root}/release-receipt.json`, 'utf8'));
  const handoff = JSON.parse(await readFile(`${root}/portfolio-handoff.json`, 'utf8'));
  if (release.github?.status !== 'pushed' || !/^[a-f0-9]{40}$/.test(release.github.commit || '') ||
      !/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+$/.test(release.github.url || '') || receipt.project_commit !== release.github.commit ||
      receipt.project_url !== release.github.url || handoff.verification?.status !== 'passed' ||
      !/^[a-f0-9]{64}$/.test(handoff.verification.source_sha256 || '') ||
      handoff.verification.source_sha256 !== release.github.verified_source_sha256) {
    throw new Error('The article check, published project and verified source must match before publication can be recorded.');
  }
  const target = publicArticleUrl(url);
  const addresses = await lookupImpl(target.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error('Published page host resolves to a non-public network address.');
  const response = await fetchImpl(target, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'text/html' } });
  const html = await pageText(response);
  verifyPublishedHtml(html, title, release.github.url);

  receipt.publication = 'verified_live_page';
  receipt.publication_url = target.href;
  receipt.draft_sha256_at_publication_check = receipt.article_sha256;
  receipt.publication_verified_at = new Date().toISOString();
  receipt.publication_verification_scope = 'Live page title or heading and released repository link; full article body and editorial quality are not compared.';
  const handoffPath = `${root}/portfolio-handoff.json`;
  const updatedHandoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  const save = async () => {
    await writeFile(`${root}/case-study-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
    updatedHandoff.artifacts = [...(updatedHandoff.artifacts || []).filter((item) => item.type !== 'case_study'), {
      type: 'case_study', path: receipt.article, status: receipt.status, word_count: receipt.word_count,
      sha256: receipt.article_sha256, project_commit: receipt.project_commit,
      publication: receipt.publication, publication_url: receipt.publication_url, readme_backlink: receipt.readme_backlink,
    }];
    await writeFile(handoffPath, `${JSON.stringify(updatedHandoff, null, 2)}\n`);
  };
  receipt.readme_backlink = 'pending';
  await save();
  const readmePath = `${root}/README.md`;
  let readme = await readFile(readmePath, 'utf8');
  const block = `${start}\n\n## Case study\n\n[${title.replaceAll('[', '\\[').replaceAll(']', '\\]')}](${target.href})\n\n${end}`;
  const managed = new RegExp(`${start}[\\s\\S]*?${end}`);
  readme = managed.test(readme) ? readme.replace(managed, block) : `${readme.trimEnd()}\n\n${block}\n`;
  await writeFile(readmePath, readme);
  receipt.readme_backlink = 'recorded';
  await save();
  return { publication: receipt.publication, publication_url: receipt.publication_url, readme_backlink: receipt.readme_backlink };
}

async function main() {
  const index = process.argv.indexOf('--published-url');
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    throw new Error('Usage: npm run blog:record -- --published-url https://your.site/writing/slug');
  }
  const result = await recordPublication({ url: process.argv[index + 1] });
  console.log(`Case study publication recorded from a live page; README backlink ${result.readme_backlink}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`case-study: ${error.message}`); process.exitCode = 1; });
}
