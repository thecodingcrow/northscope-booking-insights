# 06 — Feature 3: Booking Manual (end-to-end)

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

The full Booking Manual / rule mining feature: heuristic, route, tests, Dashboard tile wiring. **Ships as its own PR (`feat/3-booking-manual`).** This is the differentiated feature — the most distinctive part of the submission.

The heuristic is a pure function `mineRules(documents, lines): Rule[]`. It enumerates candidate rules over a **typed atom grammar** (locked shape from prototype) and surfaces only those with high support and high confidence. Each surfaced rule includes evidence Documents (that support it) and violations (Documents where the antecedent holds but the consequent doesn't).

**Atom grammar** (the candidate space is closed under these — no other antecedent or consequent shapes):

```ts
type Atom =
  | { kind: "vendor"; id: string }
  | { kind: "customer"; id: string }
  | { kind: "template"; name: string }
  | { kind: "gl_account_equals"; account: string }
  | { kind: "gl_account_in_range"; range: "4xxx" | "6xxx" }
  | { kind: "cost_center"; cc: string }
  | { kind: "tax_code"; code: string | null }
  | { kind: "debit_credit"; side: "D" | "C" };

type Rule = {
  id: string;
  antecedent: Atom[];     // conjunction, length 1 or 2
  consequent: Atom;
  support: number;        // count of Documents where antecedent holds
  confidence: number;     // P(consequent | antecedent), in [0, 1]
  evidence: string[];     // 3-5 supporting doc_ids
  violations: string[];   // doc_ids where antecedent holds but consequent doesn't
};
```

**Candidate enumeration shapes** — exactly these 8, in this order:

| Antecedent shape | Consequent shape | Catches catalog entry |
|---|---|---|
| `vendor=X` | `gl_account=Y` | strong vendor→account patterns |
| `vendor=X` | `cost_center=Y` | `C1` |
| `vendor=X` | `tax_code=Y` | vendor VAT treatment |
| `template=T` | `cost_center=Y` | `C3` |
| `template=T` | `tax_code=Y` | `C2` |
| `template=T` | `cost_center IS NOT NULL` (existence) | `C5` |
| `gl_account_in_range=4xxx` | `debit_credit=C` | `C4` |
| `gl_account_in_range=6xxx` | `cost_center IS NOT NULL` | expense-line hygiene |

**Filters** — applied to candidates before surfacing:

- `support ≥ 5` (avoid coincidental patterns)
- `confidence ≥ 0.85` (avoid weak correlations)
- **Dominance**: if a rule with single-atom antecedent has confidence within 0.05 of a more-specific conjunction with the same consequent, prefer the single-atom one
- Cap final ruleset at **8–10 surfaced rules** (the spec asks for 5–10)
- Sort by `support desc, confidence desc`

`/booking-manual` renders each rule as a **check card**:

- Plain-language description (e.g., *"Vendor V-042 (V&C Cloud GmbH) → Cost Center IT"*)
- Stats row: `Support 17 docs · Confidence 94% · 1 violation`
- Evidence: 3 example Document IDs (clickable)
- Violations: list of Document IDs that break the rule (clickable, prominently red/amber-tinted)

The Dashboard tile labeled "Rules" shows the discovered count.

`/documents/[id]`'s "Flags on this Document" section lists which rules this Document either supports as evidence (informational) or violates (flagged).

## Acceptance criteria

- [ ] `lib/heuristics/rule-mining.ts` exports `mineRules(documents, lines): Rule[]` as a pure function
- [ ] Typed `Atom` and `Rule` shapes match the locked grammar exactly
- [ ] Candidate enumeration covers exactly the 8 antecedent→consequent shapes above; no other shapes are enumerated
- [ ] `Map.groupBy` (or equivalent native) used for aggregation; no `node-apriori` or other association-rule library
- [ ] Support and confidence computed correctly: `support = count(antecedent_holds)`, `confidence = count(antecedent_holds AND consequent_holds) / support`
- [ ] Filters applied: support ≥ 5, confidence ≥ 0.85, dominance preference
- [ ] Final surfaced ruleset is in [5, 10] rules
- [ ] Output sorted by support desc, confidence desc
- [ ] `/booking-manual` route renders each rule as a check card with plain-language description, support/confidence/violation stats, evidence list, violations list
- [ ] Plain-language description includes resolved Vendor/Customer names where applicable (not bare IDs)
- [ ] Violations are visually distinct from evidence (severity color)
- [ ] All Document IDs are clickable to `/documents/[id]`
- [ ] `/documents/[id]` "Flags on this Document" section lists supports and violations for rules involving this Document
- [ ] Dashboard "Rules" KPI tile shows the discovered rule count
- [ ] `tests/feature-3.test.ts`: assert the returned rules cover all 5 catalog rule shapes `C1`–`C5`; for each, assert the rule's `violations` array contains the catalog's expected violation doc_id
- [ ] Tests pass green
- [ ] Branch: `feat/3-booking-manual`; PR description follows **What / Why / Trade-off** format
- [ ] Squash-merged on approval

## Blocked by

- `.scratch/booking-insights/issues/02-app-shell-and-dashboard.md`
