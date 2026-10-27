// Finds Playwright without adding it as a dependency.
// Search order: NODE_PATH, the current directory, this repo, then plain resolution.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const dirs = [...(process.env.NODE_PATH || '').split(delimiter).filter(Boolean), join(process.cwd(), 'node_modules'), join(here, '..', 'node_modules')];
  for (const name of ['playwright', 'playwright-core']) {
    for (const dir of dirs) {
      if (existsSync(join(dir, name, 'package.json'))) {
        try {
          return require(join(dir, name));
        } catch {
          /* try the next one */
        }
      }
    }
    try {
      return require(name);
    } catch {
      /* not found */
    }
  }
  return null;
}

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function chromeExecutable() {
  return CHROME_PATHS.find((p) => existsSync(p)) || null;
}

export async function launchChrome(playwright, options = {}) {
  const executablePath = chromeExecutable();
  return playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), ...options });
}
