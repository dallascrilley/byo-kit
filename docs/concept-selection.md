# Choose a project from a job gap

Date: 2026-10-28
Status: implemented; checks validate plans, not research truth or job eligibility.
Sources: scripts/selection.mjs, scripts/concept.mjs, tools/research-concept.py,
schemas/concept.schema.json.

## Fix the evidence target first

Create the brief in a private career directory outside this checkout and outside
any generated project. Job and employer context never belong in public research
or scaffolding inputs. New brief and export files use mode 0600 and refuse
overwrites. Do not commit the brief.

~~~sh
node scripts/byo.mjs brief --out /absolute/private/path/selection.json
~~~

Fill job_gap.requirement with the private requirement and job_gap.capability
with a general capability and observable behavior. Set job_gap.evidence_needed
to the required artifact, observable result and failure boundary before looking
for problems. Define what input, expected
output, failure and baseline could demonstrate it. A project can produce
capability evidence. It cannot establish years of professional employment,
production ownership or professional tenure. Duration requirements stay open
in private career records.

## Research wider problems after that

Search general capability and problem terms. Never send the requirement,
employer, role, candidate history or private notes to public search. The helper
sends the terms you supply to public sources; it does not sanitize prose or
infer which words are sensitive.

~~~sh
python3 tools/research-concept.py --capability 'integrity diagnosis' \
  --domain transit --pain 'overlapping schedules' --out /absolute/private/path/transit-research.json
~~~

Repeat for another useful problem or industry when needed, preserving the
capability. Existing --technology, issue, pattern and Reddit options remain
available. Read original problem reports, dates, current alternatives and
closed-issue resolutions. Search results and empty searches do not establish
demand or novelty. Existing source timestamps help investigate a timely hook;
an older unresolved problem is eligible too.

## Compare distinct concepts

Complete each candidate's existing concept manifest, mechanism, gap_fit,
usefulness, demo_quality, case_study_potential and evidence. Evidence uses
url, checked_at as YYYY-MM-DD and finding from reading the original source.
The manifest's prior_art records an extend, contribute, wrap or new decision,
references and rationale. Skip building when no approach is useful.

Use two or more actual alternatives; do not pad to a fixed count. Renaming a
tool or moving the same behavior between CLI and web does not create another
concept. Exact normalized repeated mechanisms or problem/user/behavior sets
are rejected. Semantic distinctness still needs judgment. No numeric scores are
required. An optional timely_hook uses url, checked_at and advantage, plus
event_date as YYYY-MM-DD or unknown. Missing or null event_date is displayed as
unknown for compatibility. Record the actual event/release date from the source;
checked_at only says when you checked it and never establishes recency.

Each candidate needs a public proof_plan with the same chosen capability,
baseline, acceptance examples containing input, expected, failure, and a
case_study_hypothesis. The hypothesis asks what the experiment could teach;
it is not a promised finding. Keep project data synthetic or safe for release.

~~~sh
node scripts/byo.mjs compare /absolute/private/path/selection.json
~~~

Review usefulness, visible demo behavior and the experiment's possible lesson.
Choose decision.selected, give a concrete rationale, and record one tradeoffs
entry with id and reason for each unselected concept.

## Export and build through the existing scaffold

~~~sh
node scripts/byo.mjs select /absolute/private/path/selection.json --out /absolute/private/path/chosen.json
node scripts/byo.mjs scaffold /absolute/private/path/chosen.json --out /absolute/path/new-project
node scripts/byo.mjs check /absolute/path/new-project
~~~

Export uses the existing public manifest allowlist. It never copies the brief,
job gap, decision, comparison notes or private terms. The CLI rejects private
field names and literal private context values found in candidate content.
Put identifying strings in job_gap.context or private_terms; a detector cannot
reliably recognize unknown identities, paraphrases or undeclared facts. Review
public text before release. Keep the brief outside generated projects; ignores
cannot protect a file copied into a public directory by hand.

The optional public proof plan is retained in concept.json and rendered in
PROJECT_PLAN.md. Translate its examples into actual behavior tests, replace
the existing failing acceptance placeholder, and exercise the real flow. Older
manifests without a proof plan retain their existing behavior. Selection does
not certify implemented capability, usefulness, novelty or professional tenure.

After results, compare the observation against the baseline and revise or
discard the hypothesis. The generated case-study brief asks for conditions,
source revision, result and counterexample before drafting a lesson. Existing
article checks validate format and release links only. Publication features
remain available; these selection commands do not publish, post, submit an
application or contact anyone.

See `docs/proof/concept-selection.txt` for a synthetic end-to-end transcript.
A live research pass and editorial judgment remain separate from that proof.
