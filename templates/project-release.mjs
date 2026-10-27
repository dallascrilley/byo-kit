import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((item) => item.startsWith('--')));
function option(name) { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1] || null; }
function githubSlug(remote) {
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  return match?.[1].toLowerCase() || null;
}
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (capture && result.stdout) process.stdout.write(result.stdout);
  if (capture && result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  return result.stdout || '';
}
function git(args) { return run('git', args, true).trim(); }
const publish = flags.has('--publish');
const deploy = flags.has('--deploy');
const npmPublish = flags.has('--npm');
if ([publish, deploy, npmPublish].filter(Boolean).length !== 1) throw new Error('Choose exactly one: --publish (GitHub push), --deploy (Cloudflare Workers), or --npm (optional npm package).');
if (!flags.has('--verify')) throw new Error('Release requires --verify; no release action was taken.');
run('npm', ['run', 'verify']);
const concept = JSON.parse(readFileSync('concept.json', 'utf8'));
const handoff = JSON.parse(readFileSync('portfolio-handoff.json', 'utf8'));
if (handoff.verification?.status !== 'passed' || !/^[a-f0-9]{64}$/.test(handoff.verification.source_sha256 || '')) throw new Error('Verification receipt is missing or invalid.');
if ((deploy && concept.kind !== 'web') || (npmPublish && !['cli', 'library'].includes(concept.kind))) throw new Error('Release type does not match this project kind.');
const receiptPath = 'release-receipt.json';
const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : { schema_version: 1, github: null, cloudflare: null, npm: null };
if (publish) {
  const repoInput = option('--repo');
  if (!repoInput) throw new Error('--publish requires --repo OWNER/REPO or a GitHub repository URL. Create the repository first.');
  const match = repoInput.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  if (!match) throw new Error('Repository must be OWNER/REPO or https://github.com/OWNER/REPO.');
  const slug = match[1]; const url = `https://github.com/${slug}`; const remoteUrl = `https://github.com/${slug}.git`;
  if (!existsSync('.git')) throw new Error('Initialize Git and commit the reviewed public project files before publishing.');
  const currentRemote = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (currentRemote.status !== 0) git(['remote', 'add', 'origin', remoteUrl]);
  else if (githubSlug(currentRemote.stdout.trim()) !== slug.toLowerCase()) throw new Error('origin is not the exact GitHub repository from --repo; refusing to push to another host or path.');
  if (git(['status', '--porcelain'])) throw new Error('Commit or discard the reviewed working-tree changes before publishing. The release script never stages files.');
  if (!git(['rev-parse', 'HEAD'])) throw new Error('A reviewed commit is required before publishing.');
  git(['push', '-u', 'origin', 'HEAD']);
  receipt.github = { status: 'pushed', url, commit: git(['rev-parse', 'HEAD']), verified_source_sha256: handoff.verification.source_sha256, published_at: new Date().toISOString() };
}
if (deploy) {
  const output = run('wrangler', ['deploy'], true);
  const workerUrl = output.match(/https:\/\/[^\s]+/)?.[0] || null;
  receipt.cloudflare = { status: 'deployed', url: workerUrl, verified_source_sha256: handoff.verification.source_sha256, deployed_at: new Date().toISOString() };
}
if (npmPublish) {
  run('npm', ['publish', '--access', 'public']);
  receipt.npm = { status: 'published', package: JSON.parse(readFileSync('package.json', 'utf8')).name, verified_source_sha256: handoff.verification.source_sha256, published_at: new Date().toISOString() };
}
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log('release receipt updated:', receiptPath);
