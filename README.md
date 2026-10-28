# byo-kit

**Add "bring your own data" and "bring your own key" to a static demo. Data is processed in the browser. API keys stay client-managed.**

![Loading the sample file shows 8 column profiles and "0 network requests while processing", then a masked API key is entered and accepted](docs/demo.gif)

Most demos either ship canned data or ask visitors to trust a server with their files and their API keys. byo-kit gives you two Web Components that do the honest version, plus a tiny optional relay for providers that browsers cannot call directly. No dependencies, no build step.

```html
<script type="module" src="/vendor/byo-kit.js"></script>

<byo-data sample-url="sample.csv"></byo-data>
<byo-key provider="openrouter"></byo-key>

<script type="module">
  const data = document.querySelector('byo-data');
  data.validate = (rows) => (Array.isArray(rows) && rows.length ? [] : ['Expected a list of rows.']);
  data.addEventListener('byo-data', (e) => {
    const { data, name, source, bytes } = e.detail; // source: 'sample' | 'file' | 'paste'
  });
</script>
```

`dist/byo-kit.js` is the whole library in one file. Copy it into your project. To see it work, run `node tools/static-server.mjs . 8787` and open `http://127.0.0.1:8787/example/`.

## What you get

| Piece | What it does |
| --- | --- |
| `<byo-data>` | Drop zone, file picker, paste box and a "Use sample data" button. Reads JSON, NDJSON and CSV (RFC 4180: quotes, escaped quotes, CRLF, byte order mark). Size limit, your `validate()` errors shown inline, one `byo-data` event. Heading, placeholder and file types can be changed. |
| `<byo-key>` | Masked key field with show and hide, memory or sessionStorage, "Forget key", an optional `test()` hook, and a plain statement of where the key goes. |
| `countNetworkCalls(fn)` | Counts `fetch`, XHR and beacon calls made while `fn` runs, so the page can say "0 network requests while processing" and mean it. |
| `openrouterDecide({key, state, questions})` | One call to OpenRouter's Decisions API (default model `typesafe/jev-1.14`), with answer checks and plain error hints. |
| `createRelay({routes, allowedOrigins})` | Optional. A stateless pass through for Cloudflare Workers, for providers that send no CORS headers. OpenRouter, OpenAI and Anthropic do not need it. |
| `toCsv()` | CSV export that neutralizes spreadsheet formula injection. |
| `tools/record-demo.mjs` | Records a README GIF of at most 10 seconds from a JSON step script. |
| `templates/` | README, `wrangler.jsonc`, `worker.js`, and Depot CI files for the next project. |
| `scripts/byo.mjs` | Scaffolds web, CLI, or library projects from a concept JSON file. |

## Fast project path

Start with a pre-researched concept in the shape described by
[`schemas/concept.schema.json`](schemas/concept.schema.json). `name` or `title`,
`problem`, `user`, `standout`, and `demo_steps` are accepted. Optional
`prior_art` records references, a rationale, and one decision: `extend`,
`contribute`, `wrap`, or `new`. The scaffold copies supplied concept fields; it
does not infer novelty, usefulness, or research from missing terms.

```sh
node scripts/byo.mjs scaffold examples/concept.json --out /tmp/signal-garden
cd /tmp/signal-garden
export NODE_PATH=/path/to/node_modules  # existing Playwright install, if needed for browser proof
npm run dev
npm run demo
npm test                  # intentionally fails until feature code and acceptance TODOs are replaced
npm run verify            # requires implemented feature, browser flow, and <10s GIF
```

The default is a runnable local-first web app with sample JSON, local file/paste
input through `<byo-data>`, an editable `public/src/standout.js` behavior hook,
a deliberately failing concept-specific acceptance test, README and demo steps.
Set `"kind": "cli"` or `"library"` for a Node starter with `--help`, `--json`,
file/stdin input, a stable invalid-input exit code, and an exported `analyze`
API. Generated projects include an MIT license.
Set `"ai": true` (or `"openrouter": true`) only when the optional OpenRouter
key component is wanted; the standout behavior remains useful without AI.

The generated web page is a working tool, not a landing page: a compact `h1`
with a one-line description, a data panel beside a results panel, a system
font, one accent, hairline rules, and empty, ready, and error result states
(`#results[data-state]`). It has no promotional label, card shell, or shadow.
Edit the tokens in `public/styles.css`; keep the layout roles unless the tool
needs a different one. Each project also gets `docs/DESIGN_REVIEW.md`: apply
`unslop` to all prose and `hallmark` to all visual design as working defaults.
There is no separate stage-by-stage process or checkbox signoff. User-visible
work still follows `project-journey-proof`, including actual visual inspection
and fixing/rechecking visible defects.

The generated project includes `PROJECT_PLAN.md` for prior-art review,
`portfolio-handoff.json` with public project metadata only, and
`workflow-targets.json` with targets of 3 minutes concept/research, 10 build,
4 proof/package, and 3 publish, application inclusion, and handoff. Those are
targets, not a 20-minute guarantee. Count research in elapsed time if done
during the run. Submission is never automated; record verified submission
separately in private career records. `timing.json` and the generated handoff
are ignored local receipts so verification cannot dirty a committed release.

Create the GitHub repository with `gh-axi repo create OWNER/REPO --public`,
review and commit only public files, then run
`node scripts/release.mjs --publish --verify --repo OWNER/REPO`. Web projects
deploy separately with `node scripts/release.mjs --deploy --verify`; optional
npm publication uses `--npm`. Each action re-verifies first and writes an
ignored local receipt with the GitHub repository/commit or Worker URL. A GitHub
push alone does not prove CI, deployment, or application readiness. Afterward,
check the configured CI from the project directory with `gh-axi run list --limit 5`,
watch a GitHub run with `gh-axi run watch RUN_ID` or inspect its Depot run, and open or `curl -f` the
Worker URL from the receipt. GitHub self-hosted Linux and Depot workflow
templates are included.

### A short case study with each project

Generated projects include private drafts in `docs/CASE_STUDY.md` and
`docs/CASE_STUDY_BRIEF.md`. Compare a few supported lessons, pick one worth
reading on its own, and write fewer than 1,000 words in the author's style.
Show a concrete example and link to the finished project. No invented incident,
novelty, adoption or time saving is needed.

After publishing the project, `npm run blog:check` checks length, placeholders
and repository/demo links against its source-bound release receipt. Drafts and
receipts stay ignored. The default is to publish the reviewed article on the
owner's website, then run
`npm run blog:record -- --published-url https://your.site/writing/slug`.
That command checks the live page title and repository link, records the URL,
and adds or updates a case-study backlink in the project README. Article
publication and the README backlink have separate handoff statuses. The check
cannot certify the insight, factual claims or writing style. Community posts
remain separately authorized. Include writing and editing in measured
workflow time.

## Research a useful concept

The stdlib Python helper gathers bounded public GitHub repository/issue evidence
and reads visible Reddit search results through an existing signed-in Chrome
session. It records source URLs, observation times and incomplete coverage; it
never declares an unmet need from an empty search. Python 3 and
`chrome-devtools-axi` are needed for this optional research command.

```sh
python3 tools/research-concept.py --technology salesforce --pain permission \
  --pattern cli --pattern mcp --issue-repo forcedotcom/cli \
  --subreddit salesforce --reddit-route browser --out concept-research.json
```

Reddit defaults to the user's browser. The helper opens a task search tab,
extracts public post links and closes only that new tab, preserving existing
pages. It does not read cookies or copy a profile. Use `--reddit-route api` only
when a headless JSON route is desired; an API 403 does not establish that browser
access is blocked. Open original threads and current competitor docs before
choosing to extend, contribute, wrap or build. Compare distinct approaches to a
concrete user problem, a useful difference and a genuine result visible in a GIF
shorter than ten seconds. CLIs, MCP servers, Actions, preflight checks, converters,
explainers and replay tools are patterns to investigate, not novelty claims.

## Bring your own data

`<byo-data>` attributes, all optional:

| Attribute | Effect |
| --- | --- |
| `sample-url` | Shows a "Use sample data" button that loads this URL. |
| `max-bytes` | Size limit. Default 5 MiB. |
| `label` | Heading of the drop zone. Default "Drop a CSV, JSON or NDJSON file here". |
| `paste-placeholder` | Placeholder text of the paste box. |
| `accept` | The file picker's `accept` value, for example `.csv,.json`. It is also shown under the heading as "Accepted: .csv, .json". It filters the picker only; a dropped file is still checked by its content. |
| `hide-paste` | Boolean. Hides the paste box. |

Properties: `validate(data) -> string[]`, `value`, `load(text, {name, source})`, `clear()`.

The event detail is `{ data, name, source, bytes }`. CSV arrives as an array of objects keyed by the header row. The element dispatches the event inside the network counter, so the line under the box ("Loaded sample.csv: 120 records, 7.1 KB. 0 network requests while processing.") covers reading, your `validate()` and the synchronous part of your listeners. Work you start later, such as an awaited fetch, is outside the window.

The element also fires `byo-data-error` with `{ errors }`. A later successful load clears the earlier error list.

## Bring your own key

`<byo-key provider="openrouter | openai | anthropic">` or set `el.provider` to your own descriptor:

```js
el.provider = {
  id: 'acme', label: 'Acme', keyPattern: '^acme_[a-z0-9]{24,}$',
  docsUrl: 'https://acme.example/keys',
  mode: 'direct',                      // or 'relay' with relayPath: '/api/acme'
  endpoint: 'https://api.acme.example',
  auth: { header: 'authorization', prefix: 'Bearer ' },
  headers: {},                         // fixed extra headers
};
el.test = async (key) => ({ ok: true, message: 'Acme accepted the key.' }); // optional
const key = el.getKey();               // string or null
el.addEventListener('byo-key', (e) => e.detail); // { provider, state, hasKey, storage, ok?, message? }
```

The event never carries the key. Call `getKey()` when you need it. `requestFor(provider, key, path, origin)` returns the URL and headers for a call, and `createKeyTest(provider)` builds a cheap `GET` test.

| Provider | Mode | Notes |
| --- | --- | --- |
| `openrouter` | direct | The default. One key reaches many models. Bearer key straight to `openrouter.ai`, which answers browser preflights with `access-control-allow-origin: *`. Keys look like `sk-or-v1-` plus 64 hex characters. The key test is `GET /api/v1/key`. Make the key with a small credit limit. |
| `openai` | direct | Bearer key straight to `api.openai.com`. |
| `anthropic` | direct | Sends `anthropic-dangerous-direct-browser-access: true`. Anthropic requires it for browser calls. The name is a warning: the page can see the key, so use one you can revoke. |

The example calls `https://openrouter.ai/api/v1/chat/completions` with the model `openai/gpt-4o-mini`. The model box is editable.

### The Decisions API

OpenRouter serves TypeSafe's Jev decision model as `typesafe/jev-1.14`.

```js
import { openrouterDecide } from './vendor/byo-kit.js';

const { answers } = await openrouterDecide({
  key: el.getKey(),
  state: { ticket: 'My invoice is wrong' },
  questions: {
    topic: { type: 'choice', instructions: 'Which team handles `ticket`?',
             criteria: { billing: 'Charges and invoices', bug: 'Something broken', other: null } },
    urgent: { type: 'noul', instructions: '`ticket` asks for help today' },
  },
  // model: 'typesafe/jev-1.14',   // the default
});
answers.topic;  // { type: 'choice', choice, probabilities, confidence }
answers.urgent; // { type: 'noul', noul }   probability of yes
```

Questions use the Decisions API's three types: `choice` (one of the `criteria` keys; include an `other` option), `score` (a position on a list of levels) and `noul` (probability that the statement is true). Each answer is checked against its question before it is returned, and errors carry plain hints: 401 (key rejected), 402 (out of credit or over the key limit), 404 ("Jev may be blocked by your OpenRouter guardrails").

Where the key lives: in memory by default, or in `sessionStorage` if the visitor picks it. Nothing else touches storage, and a test fails the build if the shipped code names `localStorage`, IndexedDB or cookies.

### The relay (optional)

Use it only for a provider whose API sends no CORS headers. The built-in providers do not need it, and `templates/worker.js` mounts no relay route by default.

```js
import { createRelay } from './relay/index.js';

const relay = createRelay({
  allowedOrigins: [],                    // empty means same origin only
  routes: {
    '/api/acme': {
      upstream: 'https://api.acme.example',
      methods: ['GET', 'POST'],
      allowPaths: ['/v1/'],
      headers: [],                       // extras beyond authorization and content-type
      maxBodyBytes: 200_000,
      timeoutMs: 30_000,
    },
  },
});
// in your Worker: if (relay.matches(request)) return relay(request);
```

It forwards only the headers you list, drops cookies both ways, never logs headers or bodies, refuses other browser origins, answers `OPTIONS`, passes the upstream status and body through, refuses upstream redirects, and times out. It cannot stop clients other than browsers, since they can leave out the `Origin` header. Put only routes on it that you are happy to forward.

## Theme it

Everything is a CSS custom property or a part:

```css
byo-data, byo-key { --byo-accent: #0a7d5a; --byo-radius: 8px; }
byo-data::part(dropzone) { border-style: solid; }
```

Variables: `--byo-bg --byo-soft --byo-ink --byo-muted --byo-line --byo-accent --byo-accent-soft --byo-on-accent --byo-good --byo-warn --byo-danger --byo-radius --byo-font --byo-mono`. Parts: `box dropzone hint button primary input textarea label link privacy status errors route choice`. Light and dark follow `prefers-color-scheme`. Controls are real buttons and inputs with labels and visible focus, and motion stops under `prefers-reduced-motion`.

## Make the README GIF

```sh
NODE_PATH=/path/to/node_modules node tools/record-demo.mjs --serve . --steps docs/demo-steps.json --out docs/demo.gif
```

Steps are `goto`, `click`, `hover`, `type`, `fill`, `upload` and `wait` (see `docs/demo-steps.json` and the header of the tool). It draws a visible cursor with press feedback, records 1280x800 in Chrome, converts with ffmpeg `palettegen` and `paletteuse`, prints the duration and size, saves the final frame as a PNG, and refuses to write a GIF longer than 10 seconds. Playwright, Chrome and ffmpeg are found on your machine; none of them is a dependency.

## Security notes

- Keys: memory or `sessionStorage` only. Never `console`, never the URL, never in event details. The example also removes the key from provider error messages before showing them.
- User data reaches the page through `textContent` only. The code has no `innerHTML`, and a test enforces it.
- `toCsv()` prefixes cells that start with `=`, `+`, `-`, `@`, tab or carriage return with an apostrophe. Plain numbers stay numbers.

## Status and honest limits

- Tested: unit tests for the parser, exporter, network counter, providers, key store, relay and templates (`node --test`), and a headless Chrome run of the example with a sample file, pasted CSV and JSON, an uploaded NDJSON file, key storage choices, and stubbed OpenRouter and Anthropic endpoints that check the key, the headers and that no row values leave the page, and the `<byo-data>` attributes.
- Not tested: a call to a live provider. No test used a real key or reached `openrouter.ai`. The OpenRouter, OpenAI and Anthropic request shapes follow their public docs and the checked CORS behavior, and default model names (`openai/gpt-4o-mini`, `claude-haiku-4-5`, `gpt-4o-mini`) may need editing. `openrouterDecide` was tested with an injected `fetch` using the request and response shapes in TypeSafe's published API reference; it has not yet been run against openrouter.ai with a real key.
- The kit is published on GitHub. The generated-project proof exercises local browser behavior and GIF capture; the new Worker release path has not been exercised against a live Cloudflare account.
- The network counter sees `fetch`, XHR and `sendBeacon` only. It does not see image or script loads, WebSockets, or calls made later by code you start.
- Browsers: checked in Chrome. Web Components and constructed stylesheets are in all current browsers, but others were not tried.
- The example GIF shows a key being entered, not a model call, because a call would need a real key.

## Development

```sh
node --test              # unit tests
node scripts/bundle.mjs  # rebuild dist/byo-kit.js (CI checks it is current)
script/cibuild           # the CI gate; add NODE_PATH to include the browser smoke
```

Source is plain ES modules in `src/`. Logic with no DOM lives in `src/core/` so it runs under `node --test`. Needs Node 20 or later.

MIT licensed. Copyright 2026 Dallas Crilley.
