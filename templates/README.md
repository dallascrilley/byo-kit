<!--
Fill in every {{placeholder}}, then delete this comment and any section that does
not apply. Keep it short. A visitor should know what it does in one line, see it
work in under ten seconds, and be running it in under a minute.
GIF rules: at most 10 seconds, 1280x800 source, record it with
tools/record-demo.mjs so the cursor and timing look the same across projects.
-->

# {{project}}

**{{one line: what it does for whom, in plain words}}**

![{{what the GIF shows, as a sentence}}](docs/demo.gif)

{{Optional: "Try it: https://{{project}}.example.workers.dev" once it is deployed.}}

## Quickstart

```sh
git clone {{repo url}} && cd {{project}}
{{the one or two commands that run it; no build step if you can avoid it}}
```

## What you get

- {{Concrete result 1, with a number or an example.}}
- {{Concrete result 2.}}
- {{Concrete result 3.}}

## Bring your own data

Drop a CSV, JSON or NDJSON file, paste it, or use the sample. It is read in your
browser. Nothing is uploaded. {{Say what shape of data it expects and what a
bad file looks like.}}

## Bring your own key

{{Delete this section if the project needs no AI.}} Add your own
{{provider}} key to {{what it unlocks}}. The key goes {{straight to the provider
| through the stateless relay at /api/...}}. It is held in memory unless you
choose sessionStorage, and it is never written anywhere else. Everything except
{{the AI step}} works without a key.

## Privacy

- Your data is processed in the browser. The page shows how many network
  requests it made while processing.
- Keys are never logged, never stored on disk, and not in the URL.
- {{Anything the project sends anywhere, and exactly what.}}

## Status and honest limits

- {{What works and how you know: tests, a live run, a recording.}}
- {{What does not: untested providers, size limits, browsers not tried.}}
- {{What would change your mind about the design.}}

## Development

```sh
node --test            # unit tests
script/cibuild         # the CI gate
npx wrangler dev       # run the Worker locally (needs wrangler)
```

MIT licensed.
