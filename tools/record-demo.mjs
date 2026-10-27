#!/usr/bin/env node
// Records a short demo GIF of a web page from a JSON step script.
//
//   NODE_PATH=/path/to/node_modules \
//   node tools/record-demo.mjs --serve . --steps docs/demo-steps.json --out docs/demo.gif
//
// Needs, but does not depend on: Playwright (found via NODE_PATH, ./node_modules
// or this repo's node_modules), Google Chrome (CHROME_PATH or the usual places)
// and ffmpeg + ffprobe (FFMPEG / FFPROBE or PATH, or /opt/homebrew/bin).
//
// Flags
//   --steps FILE     JSON step script (required)
//   --out FILE       GIF to write (default docs/demo.gif)
//   --png FILE       final frame PNG (default: <out without extension>-final.png)
//   --serve DIR      serve DIR on a free local port and use it as the base URL
//   --base URL       base URL for relative "goto" values (when not using --serve)
//   --width N        GIF width in pixels (default 960; the recording is 1280x800)
//   --fps N          GIF frames per second (default 12)
//   --max-seconds N  lower the limit below 10 (it can never be raised)
//
// The script is {"steps": [...]} or just an array. Each step is one object:
//   {"goto": "/example/"}
//   {"click": "css selector"}               moves the cursor, then clicks
//   {"hover": "css selector", "hold": 400}
//   {"type": "css selector", "text": "...", "delay": 30}   clicks, then types
//   {"fill": "css selector", "text": "..."}                clicks, then sets the value
//   {"upload": "css selector", "file": "path"}             file input, or a button that opens the chooser
//   {"wait": 500}                           milliseconds
// Selectors reach into open shadow DOM. The GIF is refused if it runs past 10 seconds.
import { readFileSync, mkdirSync, rmSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { loadPlaywright, launchChrome } from './find-playwright.mjs';
import { startServer } from './static-server.mjs';

const run = promisify(execFile);
const HARD_LIMIT_SECONDS = 10;
const W = 1280;
const H = 800;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function fail(message) {
  process.stderr.write('record-demo: ' + message + '\n');
  process.exit(1);
}

function findTool(name) {
  const env = process.env[name.toUpperCase()];
  if (env) return env;
  for (const dir of (process.env.PATH || '').split(':').concat('/opt/homebrew/bin', '/usr/local/bin')) {
    if (dir && existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

// A visible cursor with press feedback, drawn inside the page so it is in the video.
const CURSOR_SCRIPT = `
(() => {
  if (window.__byoCursor) return;
  window.__byoCursor = true;
  const start = () => {
    const css = document.createElement('style');
    css.textContent = [
      '#__cur{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;opacity:0;transform:translate(-100px,-100px);will-change:transform}',
      '#__cur svg{display:block;width:28px;height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));transform-origin:4px 3px;transition:transform .09s ease-out}',
      '#__cur.down svg{transform:scale(.82)}',
      '.__ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #2457d6;background:rgba(36,87,214,.18);animation:__rip .5s ease-out forwards}',
      '@keyframes __rip{from{transform:scale(.5);opacity:1}to{transform:scale(3.2);opacity:0}}'
    ].join('');
    document.documentElement.append(css);
    const cur = document.createElement('div');
    cur.id = '__cur';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 28 28');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M4 3v19l5.2-4.6 3.3 7.4 3.4-1.5-3.3-7.3H20z');
    path.setAttribute('fill', '#111');
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    cur.append(svg);
    document.documentElement.append(cur);
    const put = (e) => { cur.style.opacity = '1'; cur.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; };
    addEventListener('mousemove', put, true);
    addEventListener('mousedown', (e) => {
      put(e);
      cur.classList.add('down');
      const r = document.createElement('div');
      r.className = '__ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.documentElement.append(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener('mouseup', () => cur.classList.remove('down'), true);
  };
  if (document.documentElement) start(); else addEventListener('DOMContentLoaded', start);
})();
`;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.steps || args.steps === true) fail('--steps FILE is required. See the header of tools/record-demo.mjs.');
  const out = resolve(String(args.out && args.out !== true ? args.out : 'docs/demo.gif'));
  const png = resolve(String(args.png && args.png !== true ? args.png : out.replace(/\.gif$/i, '') + '-final.png'));
  const gifWidth = Number(args.width) || 960;
  const fps = Number(args.fps) || 12;
  const limit = Math.min(HARD_LIMIT_SECONDS, Number(args['max-seconds']) || HARD_LIMIT_SECONDS);

  const script = JSON.parse(readFileSync(String(args.steps), 'utf8'));
  const steps = Array.isArray(script) ? script : script.steps;
  if (!Array.isArray(steps) || steps.length === 0) fail('the step script has no steps.');
  const stepsDir = dirname(resolve(String(args.steps)));

  const ffmpeg = findTool('ffmpeg');
  const ffprobe = findTool('ffprobe');
  if (!ffmpeg || !ffprobe) fail('ffmpeg and ffprobe are required (set FFMPEG and FFPROBE, or put them on PATH).');
  const playwright = loadPlaywright();
  if (!playwright) fail('Playwright was not found. Set NODE_PATH to a node_modules directory that has it. It is not a dependency of this repo.');

  let server = null;
  let base = args.base && args.base !== true ? String(args.base) : '';
  if (args.serve && args.serve !== true) {
    server = await startServer(String(args.serve), 0);
    base = server.url;
  }
  const url = (u) => (/^[a-z]+:/i.test(u) ? u : base.replace(/\/$/, '') + u);

  const work = mkdtempSync(join(tmpdir(), 'byo-record-'));
  const browser = await launchChrome(playwright);
  let videoPath;
  let trimSeconds = 0;
  try {
    const context = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      recordVideo: { dir: work, size: { width: W, height: H } },
    });
    await context.addInitScript(CURSOR_SCRIPT);
    const videoStart = Date.now();
    const page = await context.newPage();
    let mouse = { x: W / 2, y: H - 60 };

    const locate = async (selector) => {
      const loc = page.locator(selector).first();
      await loc.waitFor({ state: 'visible', timeout: 8000 });
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      if (!box) throw new Error('no box for ' + selector);
      return { loc, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const glide = async (x, y) => {
      const dist = Math.hypot(x - mouse.x, y - mouse.y);
      const frames = Math.max(8, Math.min(36, Math.round(dist / 18)));
      const x0 = mouse.x;
      const y0 = mouse.y;
      for (let i = 1; i <= frames; i++) {
        const k = ease(i / frames);
        await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
        await page.waitForTimeout(14);
      }
      mouse = { x, y };
    };
    const press = async () => {
      await page.waitForTimeout(60);
      await page.mouse.down();
      await page.waitForTimeout(110);
      await page.mouse.up();
      await page.waitForTimeout(140);
    };

    let marked = false;
    for (const [n, step] of steps.entries()) {
      const label = 'step ' + (n + 1) + ' ' + JSON.stringify(step);
      try {
        if ('goto' in step) {
          await page.goto(url(step.goto), { waitUntil: 'load' });
          await page.mouse.move(mouse.x, mouse.y); // makes the cursor appear
          if (!marked) {
            marked = true;
            trimSeconds = (Date.now() - videoStart) / 1000;
          }
        } else if ('wait' in step) {
          await page.waitForTimeout(Number(step.wait));
        } else if ('hover' in step) {
          const t = await locate(step.hover);
          await glide(t.x, t.y);
          await page.waitForTimeout(Number(step.hold) || 250);
        } else if ('click' in step) {
          const t = await locate(step.click);
          await glide(t.x, t.y);
          await press();
        } else if ('type' in step || 'fill' in step) {
          const selector = step.type ?? step.fill;
          const t = await locate(selector);
          await glide(t.x, t.y);
          await press();
          if ('type' in step) await t.loc.pressSequentially(String(step.text), { delay: Number(step.delay) || 30 });
          else await t.loc.fill(String(step.text));
          await page.waitForTimeout(120);
        } else if ('upload' in step) {
          const file = resolve(stepsDir, step.file);
          if (!existsSync(file)) throw new Error('missing file ' + file);
          const loc = page.locator(step.upload).first();
          const isInput = await loc.evaluate((e) => e.tagName === 'INPUT' && e.type === 'file').catch(() => false);
          if (isInput) {
            await loc.setInputFiles(file);
          } else {
            const t = await locate(step.upload);
            await glide(t.x, t.y);
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), press()]);
            await chooser.setFiles(file);
          }
          await page.waitForTimeout(150);
        } else {
          throw new Error('unknown step');
        }
      } catch (e) {
        throw new Error(label + ' failed: ' + String(e.message).split('\n')[0]);
      }
    }

    mkdirSync(dirname(png), { recursive: true });
    await page.screenshot({ path: png });
    const video = page.video();
    await context.close();
    videoPath = await video.path();
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  const probe = async (file) => Number((await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).stdout.trim());
  const recorded = await probe(videoPath);
  const seconds = Math.max(0, recorded - trimSeconds);
  if (seconds > limit) {
    rmSync(work, { recursive: true, force: true });
    fail('the demo runs ' + seconds.toFixed(1) + ' s. The limit is ' + limit + ' s. Shorten the waits in the step script. No GIF was written.');
  }

  mkdirSync(dirname(out), { recursive: true });
  const filter =
    'fps=' + fps + ',scale=' + gifWidth + ':-1:flags=lanczos,split[a][b];' +
    '[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
  await run(ffmpeg, ['-v', 'error', '-y', '-ss', trimSeconds.toFixed(3), '-i', videoPath, '-vf', filter, '-loop', '0', out]);
  rmSync(work, { recursive: true, force: true });

  const gifSeconds = await probe(out);
  const bytes = statSync(out).size;
  if (gifSeconds > limit + 0.05) {
    rmSync(out, { force: true });
    fail('the GIF came out ' + gifSeconds.toFixed(2) + ' s. The limit is ' + limit + ' s. Removed it.');
  }
  process.stdout.write(
    'record-demo: wrote ' + out + '\n' +
      '  duration ' + gifSeconds.toFixed(2) + ' s (limit ' + limit + ' s), ' + (bytes / 1048576).toFixed(2) + ' MB, ' + gifWidth + ' px wide at ' + fps + ' fps\n' +
      '  final frame ' + png + ' (' + W + 'x' + H + ')\n',
  );
}

main().catch((e) => fail(e.message || String(e)));
