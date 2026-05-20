# 07 — Vercel deploy + README finalization

**Status:** ready-for-human

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

Link the repo to Vercel (HITL — requires the user to click through auth and authorize the deploy), get a live URL, and finalize the README so a reviewer can read it cold and understand the project end-to-end. After this issue lands, the repo is "done" except for the self-review follow-ups and the Task 3 research section.

The README follows the locked outline from spec §12:

```
README.md
├── TL;DR — what it does, where to look (1 short para)
├── Live demo — Vercel URL + 1 screenshot
├── Quickstart — clone, install, dev, test
├── The data model — short gloss, link to CONTEXT.md and ADRs
├── The three features (per spec output requirement)
│   ├── 1. Text similarity     — what / why / trade-off
│   ├── 2. Duplicate detection — what / why / trade-off
│   └── 3. Booking manual      — what / why / trade-off
├── Architecture & decisions — list of ADRs with one line each
├── Engineering judgment — "deliberately didn't do" bullets
├── Self-review — stub (filled by issue 08)
├── Research (Task 3) — stub (filled by issue 11)
└── Notes — assumptions, SKR04 subset reasoning, planted-anomaly catalog summary
```

The "Engineering judgment — deliberately didn't do" section enumerates every scope cut from PRD §Out of Scope with a one-line reason each. The list is not optional — it's where the rubric explicitly rewards trade-off reasoning.

The "Architecture & decisions" section lists every ADR currently in `docs/adr/` (currently 0001 and 0002) with a one-line summary and a link.

The "Notes" section includes the planted-anomaly summary (count, IDs, the `git diff data.clean.json data.json` move) and the SKR04-subset note.

## Acceptance criteria

- [ ] Vercel project linked to the repo (user clicks through auth — this is the HITL part)
- [ ] Live demo URL works; loads the Dashboard with real data
- [ ] One screenshot saved under `public/screenshots/` and embedded in README "Live demo"
- [ ] README contains all 11 sections from the outline; no stub bullets except in §Self-review and §Research which are explicitly stubbed-for-later
- [ ] §TL;DR is one short paragraph stating what the app does and pointing to the live URL
- [ ] §Quickstart includes the exact commands: clone, `pnpm install`, `pnpm gen:clean && pnpm gen:corrupt`, `pnpm dev`, `pnpm test`
- [ ] Quickstart commands have been verified to work from a clean checkout
- [ ] §The three features has one subsection per feature, each with **What / Why / Trade-off** (2–4 bullets each)
- [ ] §Architecture & decisions lists `ADR-0001 (money-as-integer-cents)` and `ADR-0002 (testing-against-the-anomaly-catalog)` with one-line summaries and links
- [ ] §Engineering judgment includes every "deliberately didn't do" bullet from PRD §Out of Scope, each with the one-line reasoning
- [ ] §Notes includes the planted-anomaly catalog summary and the `git diff data.clean.json data.json` reviewer-move
- [ ] §Notes documents the SKR04-subset assumption
- [ ] Repo is connected to Vercel so future merges to `main` auto-deploy
- [ ] Commit: `docs: README + Vercel deploy` (or split into two commits if cleaner)

## Blocked by

- `.scratch/booking-insights/issues/04-feature-1-text-similarity.md`
- `.scratch/booking-insights/issues/05-feature-2-duplicate-detection.md`
- `.scratch/booking-insights/issues/06-feature-3-booking-manual.md`
