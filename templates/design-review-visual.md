
## Visual review (web projects)

Generated defaults: compact `h1` plus one-line description, an input panel beside a results panel,
system font, one accent, hairline rules, no card shell, no shadows, no promotional label above the
title. Visible states: empty, ready, error. Keep these unless the tool needs something else.

- [ ] Applied the `hallmark` skill (`~/.local/share/hub2-runtime/skills/hallmark/SKILL.md`) in `audit` mode to the rendered page, then fixed the ranked findings. If the skill is unavailable, say so here: [note or n/a]
- [ ] Opened `npm run dev` and looked at the page at 320, 375, 768, and 1280 px. No horizontal scroll, no overlapping text.
- [ ] First screen shows the working input and result area without scrolling at 1280 x 800.
- [ ] Checked the empty, ready, and error states by loading the sample, a valid file, and a malformed file.
- [ ] Tab order reaches every control and the focus ring is visible.
- [ ] Found none of: eyebrow label, gradient, three-card feature grid, icon-over-heading cards, rounded shadow card shell, decorative banner. Kept any that the tool functionally needs and justified them here: [note or n/a]
- [ ] The recorded `docs/demo.gif` shows the real result, not a loading screen.
