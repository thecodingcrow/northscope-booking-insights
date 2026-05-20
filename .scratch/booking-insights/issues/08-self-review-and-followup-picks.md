# 08 — Self-review: 5 findings + pick 2 follow-up fixes

**Status:** ready-for-human

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

Conduct a short self-review of the AI-generated work from issues 04, 05, 06 (the three feature PRs), surface **5 concrete improvements** across categories (Performance / DX / Security / Testing / Architecture / UI), record them in the README §Self-review section, then **pick 2 of the 5 to action** as follow-up PRs (issues 09 and 10). The other 3 are recorded with a one-line "deliberately not fixed" reason each.

This is HITL because the picks require human judgment about signal-per-minute and what would land best with the reviewer. The agent can draft the 5 findings; the user picks which 2 to action.

Each finding entry in the README has:
- A short title (e.g., *"Heuristic results are recomputed on every navigation"*)
- A category label (`Performance`, `DX`, `Security`, `Testing`, `Architecture`, `UI`)
- A 1–2 sentence description of what's suboptimal
- A short justification of why it matters (or doesn't)
- The disposition: `Will be fixed in issue 09 / 10` or `Deliberately not fixed: <reasoning>`

The findings should be specific to the work that was actually written — agents reviewing the PRD must look at the actual diffs in issues 04/05/06 and propose findings grounded in the code, not generic refactoring suggestions.

Once the picks are made, the disposition of the 2 chosen findings is updated to reference issues 09 and 10 (which the agent will create by copying the templates and filling in the picked finding's scope).

## Acceptance criteria

- [ ] README §Self-review section contains exactly 5 findings
- [ ] Each finding has: title, category label, 1–2 sentence description, why-it-matters justification, disposition
- [ ] Findings are grounded in the actual code shipped in PRs from issues 04/05/06 — not generic
- [ ] At least 3 distinct categories are represented across the 5 findings
- [ ] User has reviewed the 5 drafted findings and explicitly picked 2 to action
- [ ] The 2 picked findings have their disposition updated to `Will be fixed in issue 09` / `Will be fixed in issue 10`
- [ ] The 3 not-fixed findings have a 1-line reasoning under their disposition
- [ ] Issue 09 (`.scratch/booking-insights/issues/09-followup-fix-1.md`) has been updated to scope the first picked finding (replace the `<TBD after issue 08>` placeholder)
- [ ] Issue 10 (`.scratch/booking-insights/issues/10-followup-fix-2.md`) has been updated to scope the second picked finding

## Blocked by

- `.scratch/booking-insights/issues/04-feature-1-text-similarity.md`
- `.scratch/booking-insights/issues/05-feature-2-duplicate-detection.md`
- `.scratch/booking-insights/issues/06-feature-3-booking-manual.md`
