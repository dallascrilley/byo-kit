#!/usr/bin/env node
// Headless browser check of the example page. Needs Playwright and a Chrome.
// Exits 0 with a message when either is missing (the script/cibuild step is optional).
//   NODE_PATH=/path/to/node_modules node script/smoke.mjs
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadPlaywright, launchChrome } from '../tools/find-playwright.mjs';
import { startServer } from '../tools/static-server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const playwright = loadPlaywright();
if (!playwright) {
  process.stdout.write('smoke: SKIPPED. Playwright was not found (set NODE_PATH to a node_modules that has it).\n');
  process.exit(0);
}
let browser;
try {
  browser = await launchChrome(playwright);
} catch (e) {
  process.stdout.write('smoke: SKIPPED. Could not start Chrome: ' + String(e.message).split('\n')[0] + '\n');
  process.exit(0);
}

const { url, close } = await startServer(ROOT, 0);
const FAKE_KEY = 'sk-ant-' + 'k'.repeat(10) + 'SMOKE' + 'q'.repeat(15);
const steps = [];
const ok = (name) => steps.push(name);

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  const page = await context.newPage();
  const problems = [];
  const consoleText = [];
  const requests = [];
  page.on('console', (m) => {
    consoleText.push(m.text());
    if (m.type() === 'error') problems.push('console error: ' + m.text());
  });
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('request', (r) => requests.push(r.url()));

  // Pretend to be Anthropic so the key path runs for real without a real key.
  let seen = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': url,
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen = { url: req.url(), headers: req.headers(), body: req.postData() };
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', text: 'Support tickets with a channel and a rating.' }] }),
    });
  });

  await page.goto(url + '/example/');
  await page.waitForSelector('byo-data');
  const data = page.locator('byo-data');
  const status = data.locator('[part~=status]');
  const rows = page.locator('#cols tbody tr');
  ok('page loads');

  // 1. Sample data
  await data.getByRole('button', { name: 'Use sample data' }).click();
  await rows.first().waitFor();
  assert.equal(await rows.count(), 8);
  assert.match(await status.innerText(), /Loaded sample\.csv: 120 records.*0 network requests while processing/);
  assert.match(await data.locator('[part~=privacy]').innerText(), /Processed in your browser\. Nothing is uploaded\./);
  ok('sample data profiles 8 columns with 0 network requests');

  // 2. Pasted CSV with quotes, an embedded comma and CRLF
  const before = requests.length;
  await data.getByLabel('Or paste data').fill('=odd name,qty\r\n"Smith, Ada",3\r\n"say ""hi""",5\r\n');
  await data.getByRole('button', { name: 'Use pasted data' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#cols tbody tr').length === 2);
  assert.equal(await rows.nth(0).locator('td.name').innerText(), '=odd name');
  assert.equal(await rows.nth(1).locator('.chip').innerText(), 'number');
  assert.equal(requests.length, before, 'pasting made a network request');
  ok('pasted CSV with quotes and CRLF');

  // 3. Pasted JSON, then a validation error
  await data.getByLabel('Or paste data').fill('[{"a":1,"b":"x"},{"a":2,"b":"y"}]');
  await data.getByRole('button', { name: 'Use pasted data' }).click();
  await page.waitForFunction(() => document.querySelector('#cols tbody td.name')?.textContent === 'a');
  await data.getByLabel('Or paste data').fill('[1,2,3]');
  await data.getByRole('button', { name: 'Use pasted data' }).click();
  await data.locator('[part~=errors]').waitFor({ state: 'visible' });
  assert.match(await data.locator('[part~=errors]').innerText(), /Row 1 is not a record/);
  ok('JSON paste and consumer validation errors');

  // 4. File picker with NDJSON
  await data.locator('input[type=file]').setInputFiles({
    name: 'events.ndjson',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from('{"user":"a","ms":10}\n{"user":"b","ms":30}\n'),
  });
  await page.waitForFunction(() => document.querySelectorAll('#cols tbody tr').length === 2 && document.querySelector('#summary').textContent.startsWith('events.ndjson'));
  assert.match(await status.innerText(), /Loaded events\.ndjson: 2 records.*0 network requests/);
  ok('file upload (NDJSON)');

  // 5. Size limit
  await page.evaluate(() => document.querySelector('byo-data').setAttribute('max-bytes', '20'));
  await data.getByLabel('Or paste data').fill('a,b\n' + '1,2\n'.repeat(20));
  await data.getByRole('button', { name: 'Use pasted data' }).click();
  assert.match(await data.locator('[part~=errors]').innerText(), /limit is 20 B/);
  await page.evaluate(() => document.querySelector('byo-data').removeAttribute('max-bytes'));
  ok('size limit message');

  // 6. Key: format check, masking, storage choices, forget
  await data.getByRole('button', { name: 'Use sample data' }).click();
  await page.waitForFunction(() => document.querySelector('#summary').textContent.startsWith('sample.csv'));
  const key = page.locator('byo-key');
  const input = key.getByLabel('Anthropic API key');
  assert.equal(await input.getAttribute('type'), 'password');
  await input.fill('not-a-key');
  await key.getByRole('button', { name: 'Use key' }).click();
  assert.match(await key.locator('[part~=errors]').innerText(), /does not match the Anthropic key format/);
  await input.fill(FAKE_KEY);
  await key.getByRole('button', { name: 'Use key' }).click();
  assert.match(await key.locator('[part~=status]').innerText(), /Key ready/);
  assert.ok(!(await key.locator('[part~=status]').innerText()).includes(FAKE_KEY), 'status shows the whole key');
  const stores = () => page.evaluate(() => ({
    session: JSON.stringify({ ...sessionStorage }),
    persistent: JSON.stringify({ ...window['local' + 'Storage'] }),
    cookie: document.cookie,
  }));
  let s = await stores();
  assert.equal(s.session, '{}', 'memory mode wrote to sessionStorage');
  assert.equal(s.persistent, '{}');
  assert.equal(s.cookie, '');
  await key.getByLabel("In sessionStorage").check();
  s = await stores();
  assert.ok(s.session.includes('byo-kit:key:anthropic'));
  assert.equal(s.persistent, '{}');
  await key.getByRole('button', { name: 'Show key' }).click();
  assert.equal(await input.getAttribute('type'), 'text');
  await key.getByRole('button', { name: 'Hide key' }).click();
  assert.equal(await input.getAttribute('type'), 'password');
  ok('key: format check, masked input, storage choice, show and hide');

  // 7. Describe: key goes to the provider with the browser header; rows do not
  const describe = page.locator('#describe');
  await describe.click();
  await page.waitForFunction(() => document.querySelector('#answer').textContent.startsWith('Support tickets'));
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.headers['x-api-key'], FAKE_KEY);
  assert.equal(seen.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.ok(!seen.body.includes('Litware') && !seen.body.includes('Billing question'), 'request body contains row values');
  assert.ok(seen.body.includes('ticket_id'));
  assert.match(await page.locator('#net').innerText(), /1 network request to api\.anthropic\.com/);
  ok('describe: header, key and body checked against a stubbed provider');

  // 8. Forget key
  await key.getByRole('button', { name: 'Forget key' }).click();
  s = await stores();
  assert.equal(s.session, '{}');
  assert.equal(await input.inputValue(), '');
  assert.equal(await describe.isDisabled(), true);
  ok('forget key clears storage and disables the button');

  // 9. Nothing leaked to the console, and only this server (plus the stub) was contacted
  assert.ok(!consoleText.join('\n').includes(FAKE_KEY), 'key appeared in console output');
  const foreign = requests.filter((u) => !u.startsWith(url) && !u.startsWith('https://api.anthropic.com/') && !u.startsWith('data:') && !u.startsWith('blob:'));
  assert.deepEqual(foreign, []);
  assert.deepEqual(problems, []);
  ok('no console output with the key, no unexpected requests, no page errors');

  // 10. Dark mode and reduced motion hooks respond
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(15, 20, 26)');
  const hostBg = await page.evaluate(() => getComputedStyle(document.querySelector('byo-data').shadowRoot.querySelector('.box')).backgroundColor);
  assert.equal(hostBg, 'rgb(21, 27, 35)');
  ok('dark mode applies to page and components');

  await context.close();
  process.stdout.write('smoke: ok (' + steps.length + ' checks)\n' + steps.map((s) => '  - ' + s).join('\n') + '\n');
} catch (e) {
  process.stderr.write('smoke: FAILED after: ' + (steps.at(-1) || 'start') + '\n' + (e.stack || e) + '\n');
  process.exitCode = 1;
} finally {
  await browser.close();
  await close();
}
