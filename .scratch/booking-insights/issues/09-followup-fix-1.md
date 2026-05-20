# 09 — Follow-up fix #1

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

Implement the **first** picked review finding from issue 08 as its own PR.

> **Scope placeholder:** `<to be filled in when issue 08 picks the finding>`. The picked finding's title, category, and 1–2 sentence description are copied into this issue's body during the pick step. The acceptance criteria below are templated and stay as written until then.

The fix lands on a `fix/N-slug` branch where `N` is the issue number (09) and `slug` reflects the finding's title (e.g., `fix/09-memoize-heuristic-results`).

The fix is small in scope by design — this is one of two timeboxed improvements, not a refactor pass.

## Acceptance criteria

- [ ] Branch name follows `fix/09-<slug>` where slug is kebab-cased from the finding title
- [ ] The fix addresses the finding from issue 08 as described
- [ ] If the finding is performance-related, a before/after measurement is captured in the PR description (e.g., "Heuristic recomputed on every nav: ~120ms → cached: <1ms after first call")
- [ ] If the finding is testing-related, the new/changed tests pass and provide meaningful additional coverage
- [ ] If the finding is architectural, the change is bounded and doesn't touch unrelated modules
- [ ] If the finding is UI, the change is consistent with the locked visual grammar
- [ ] PR description: "What was wrong / What changed / Trade-off (if any)" — 2–4 bullets
- [ ] No regression in any existing test (`pnpm test` still green)
- [ ] README §Self-review section updated to link "Fixed in PR #N" against the relevant finding
- [ ] Conventional Commits, squash-merge

## Blocked by

- `.scratch/booking-insights/issues/08-self-review-and-followup-picks.md`
