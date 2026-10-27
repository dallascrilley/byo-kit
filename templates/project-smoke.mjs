import { loadPlaywright, launchChrome } from './tools/find-playwright.mjs';
import { startServer } from './tools/static-server.mjs';
import { readFile } from 'node:fs/promises';
import { rankRows } from './public/src/standout.js';

const pw = loadPlaywright();
if (!pw) throw new Error('Playwright is required for browser verification. Set NODE_PATH to the existing runtime packages.');
const server = await startServer('public', 0);
const browser = await launchChrome(pw);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(server.url, { waitUntil: 'load' });
  const sample = JSON.parse(await readFile('public/sample.json', 'utf8'));
  await page.locator('byo-data button:nth-of-type(2)').click();
  await page.waitForFunction((count) => document.querySelectorAll('#results li').length === count, sample.length);
  const expectedSample = rankRows(sample).map((row) => `${row.name ?? 'Row'}: ${row.reason}`);
  const sampleItems = await page.locator('#results li').allTextContents();
  if (JSON.stringify(sampleItems) !== JSON.stringify(expectedSample)) throw new Error('The browser sample result does not match the implemented standout API.');
  const sampleStatus = await page.locator('byo-data').evaluate((el) => el.shadowRoot.querySelector('[part~="status"]').textContent);
  if (!sampleStatus.includes('Loaded sample.json') || !sampleStatus.includes('0 network requests while processing')) throw new Error(`Unexpected sample status: ${sampleStatus}`);
  await page.locator('byo-data').evaluate(async (el) => el.load('[{"name":"Local check","value":15,"baseline":10}]', { name: 'browser smoke', source: 'paste' }));
  const local = await page.locator('#results li').allTextContents();
  const expectedLocal = rankRows([{ name: 'Local check', value: 15, baseline: 10 }]).map((row) => `${row.name ?? 'Row'}: ${row.reason}`);
  if (JSON.stringify(local) !== JSON.stringify(expectedLocal)) throw new Error('Local bring-your-own-data result does not match the implemented standout API.');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log(`browser smoke: sample ${sampleItems.length} rows and local paste ${local.length} row match the implemented standout API; 0 network requests while processing`);
} finally {
  await browser.close();
  await server.close();
}
