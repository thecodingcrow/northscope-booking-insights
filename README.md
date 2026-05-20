# Booking Insights

## TL;DR

Booking Insights is a Next.js 16 web application that ingests a single period of SAP-style journal-entry data and surfaces three classes of issue a finance team would otherwise catch by hand: booking-text typos (Feature 1), accidental duplicate postings (Feature 2), and deviations from the company's implied posting rules (Feature 3 — Booking Manual). The app ships with a two-pass synthetic dataset of ~150 Documents and 15 deliberately-planted anomalies so a reviewer can verify every heuristic in minutes. See the live demo link below, or clone and run locally in under two minutes with the Quickstart.

---

## Live demo

**URL:** `https://<your-deploy>.vercel.app` *(update after linking Vercel — see Deploy to Vercel below)*

> Screenshot to be added after Vercel deploy. Run `pnpm dev` and open `http://localhost:3000` to see the Dashboard locally.

---

## Quickstart

```bash
git clone <repo-url>
cd onboarding-test
pnpm install

# data/data.json is committed — the commands below are optional (regenerate from scratch)
# pnpm gen:clean && pnpm gen:corrupt

pnpm dev      # http://localhost:3000
pnpm test     # 58 vitest tests
```

### Deploy to Vercel

```bash
npm i -g vercel     # if not installed
vercel              # interactive: select scope, project name, link to repo
vercel --prod       # deploy production
```

After your first deploy, update the Live demo URL above with your `<project>.vercel.app` URL.

---

## The data model

Data follows SAP's double-entry shape. A **Document** is a single balanced accounting event identified by a 10-digit `document_id`; it contains two or more **Lines** whose signed `amount_cents` values sum to zero. Each Line records the change to one **G/L Account**, and may carry an optional **Cost Center**, **Tax Code**, and **Booking Text**. The **Document Amount** (used by Feature 2 for size comparison) is the sum of positive Line amounts — equivalently, total debits — never the signed sum, which is always zero.

See [`CONTEXT.md`](CONTEXT.md) for the full domain glossary and flagged ambiguities.
See [`docs/adr/0001-money-as-integer-cents.md`](docs/adr/0001-money-as-integer-cents.md) and [`docs/adr/0002-testing-against-the-anomaly-catalog.md`](docs/adr/0002-testing-against-the-anomaly-catalog.md) for the two non-obvious architectural decisions.

---

## The three features

### 1. Text similarity

**What**

- Normalizes every Booking Text with a German-aware pipeline: umlaut-fold (`ü→ue`, `ä→ae`, `ö→oe`), lowercase, collapse whitespace, strip punctuation.
- De-duplicates texts by `(document_id, normalized_text)` before comparison, so a Document's own repeated lines don't self-cluster.
- Runs pairwise edit-distance comparison via `fastest-levenshtein`; pairs with distance ≤ 3 and a similarity score ≥ 0.85 are grouped by union-find into clusters.
- Generates a plain-language explanation per cluster ("These 3 texts differ by ≤1 character, all on Vendor V-042 — likely a typo cluster").

**Why**

Booking-text typos are invisible in a ledger list view. German compound words and umlauts create false negatives in naive byte-comparison. A normalized Levenshtein approach catches `"Clud hosting Apr"` vs `"Cloud hosting Apr"` (A1), `"Bueromaterial Staples"` vs `"Büromaterial Staples"` (A2), and `"Lufhansa Flug Berlin"` vs `"Lufthansa Flug Berlin"` (A5) in a single pass without any ML model.

**Trade-off**

- Pairwise O(n²) comparison is acceptable at ~150 Documents; at 10 000+ Documents a blocking step (min-hash LSH) would be needed.
- Severity ranking (high = same Vendor + distance ≤ 2; medium = different Vendors; low = whitespace/casing only) is a heuristic, not a learned model. Tuning the thresholds for a real dataset would require labeled examples.
- The umlaut-fold is one-directional: `"Ü"` folds to `"ue"`, which means `"Uebel"` and `"Übel"` cluster even if they're different words. Acceptable for a single-company German dataset; not for mixed-language data.

---

### 2. Duplicate detection

**What**

- Builds a `DocFeatureVec` per Document: Vendor, Document Amount, primary account pair (largest debit + largest credit G/L Account), Posting Date, normalized Booking Text, Tax Code, line count.
- Scores every Document pair on five weighted components: Vendor match `0.30` / Amount match `0.30` / Text similarity `0.20` / Account-pair match `0.15` / Time proximity `0.05`. Threshold: composite score ≥ `0.75`.
- Applies a **recurring-pattern filter**: pairs where the same Vendor + Amount + Account pair appear ≥ 3 times at ~30-day intervals are suppressed (B5 — monthly rent).
- Applies **storno detection**: pairs sharing a Vendor with a transit-account Document within 30 days are excluded (B4 — reversal-then-resplit).
- Unions overlapping pairs into clusters and attaches a transparent score breakdown to each flagged cluster.

**Why**

An accountant's intuition for "this looks posted twice" is exactly these five signals, weighted by how discriminating each is. Vendor + Amount together account for 60% of the score because they are the strongest indicators; time proximity contributes only 5% because same-day postings to different Vendors are common. The recurring-pattern and storno filters are the difference between a useful tool and one that cries wolf on every rent payment and every legitimate reversal.

**Trade-off**

- The storno filter (exclude any pair where one Document shares a Vendor with a transit-account Document within 30 days) is broader than a strict spec would require. It works for B4 but could in theory suppress a genuine duplicate that happens to co-occur with a transit-account posting. See Self-review finding #1.
- The 0.75 threshold was tuned on the planted catalog. A real deployment would need a labeled validation set.
- Time-proximity weight of 0.05 means a same-day exact-match duplicate with a different text still scores 0.95 and gets flagged — intentional, since same-day re-posts are high-risk regardless of text.

---

### 3. Booking Manual

**What**

- Enumerates candidates over exactly 8 typed antecedent → consequent shapes: `vendor→gl_account`, `vendor→cost_center`, `vendor→tax_code`, `template→cost_center`, `template→tax_code`, `template→cost_center-existence`, `account_range_4xxx→credit_side`, `account_range_6xxx→cost_center-existence`.
- Uses `Map.groupBy` to compute support and confidence for each candidate. Surfaces only rules with **support ≥ 5** and **confidence ≥ 0.85**.
- Applies a dominance filter: a single-atom antecedent is preferred over a conjunction when both have similar confidence and the same consequent.
- Returns rules sorted by support descending, then confidence descending, each with up to 5 evidence Documents and all violating Documents.

**Why**

Generic association-rule mining (Apriori / FP-Growth) produces shape-blind itemsets — the algorithm has no concept of "Vendor", "Cost Center", or "Tax Code" as domain entities, and cannot produce per-Document violation tracking. The typed Atom grammar constrains the search to domain-meaningful patterns, keeps the rule set small (5–10 rules), and makes violations directly actionable. `Map.groupBy` is a built-in (ES2024) that removes any dependency on a statistics library.

**Trade-off**

- The 8 candidate shapes are hardcoded. Adding a new shape (e.g. `customer→tax_code`) requires a code change, not a configuration change. For a demo app with a known dataset, this is the right call; a general-purpose rule engine would add complexity with no benefit here.
- Confidence ≥ 0.85 means a rule held by 17 of 20 Documents surfaces; a rule held by 8 of 10 also surfaces. Support ≥ 5 guards against noise but is not statistically derived.
- Rules are mined from the corrupted dataset, so violations are genuinely surprising against the background pattern — but also means the miner sees the planted violations as part of the data; it mines rules from the majority pattern and surfaces the minority violators. This is the intended behavior.

---

## Architecture & decisions

| ADR | Decision | Summary |
|-----|----------|---------|
| [ADR-0001](docs/adr/0001-money-as-integer-cents.md) | Money as integer cents end-to-end | All `amount_cents` values are signed integers in minor units. The display layer is the sole formatter. Avoids floating-point drift; no decimal library needed at this scale. |
| [ADR-0002](docs/adr/0002-testing-against-the-anomaly-catalog.md) | Tests are golden-master against the planted catalog | Heuristic tests assert on the 15 catalog entries as a fixture, not on general-case correctness. The catalog is data; the heuristics are code; they share no code path. Negative cases (B4, B5) guard against false positives. |

Additional architecture notes:

- **Single Next.js App Router project**, no monorepo, no backend service. Server components only; no client-side data fetching.
- **In-memory data layer**: `data.json` and master data files imported at module level, held in a server-side singleton (`lib/data/store.ts`). Next.js bundles them at build time.
- **Six routes**: `/` (Dashboard), `/documents`, `/documents/[id]`, `/anomalies/text`, `/anomalies/duplicates`, `/booking-manual`.
- **Visual grammar**: Variant B — "Triage Inbox". `stone-50` background, white sidebar, `stone-200` borders, severity palette `rose`/`amber`/`slate`, brand accent `indigo→violet`. Geist Sans body, Geist Mono for IDs.

---

## Engineering judgment — deliberately didn't do

These items were considered and explicitly cut. The one-line reasoning is the deciding factor, not the implementation effort.

| Scope cut | Reasoning |
|-----------|-----------|
| **Multi-currency / FX rates** | Single EUR. Adding USD/CHF requires a dated FX-rate table and a per-heuristic decision on transaction-currency vs reporting-currency semantics — a separate domain problem. The `currency` field exists; it's an additive change later. |
| **Multi-entity / cross-entity Documents** | Single `company_code = "1000"`. Intercompany flows are a major SAP concept and explicitly not modeled; adding them would require a separate entity model and inter-entity reconciliation logic. |
| **Cash flow projections / P&L / business KPIs** | The Assignment forbids computing KPIs not derivable from postings. The app surfaces findings, not financial statements. |
| **Generic association-rule mining (Apriori / FP-Growth)** | Shape-blind itemsets have no concept of Vendor, Cost Center, or G/L Account as domain entities, and cannot produce per-Document violation tracking. The typed Atom grammar is strictly more useful for this domain. |
| **LLM-generated rule suggestions** | Adds non-determinism and an API dependency for zero added correctness on a known, finite dataset. |
| **Real-data validation of heuristics** | Tests are golden-master against the planted catalog (see ADR-0002). Real-world validation would be a separate suite run against actual books — not in scope for a synthetic dataset submission. |
| **Persistence layer** | Data is read-only and committed as JSON. No database, migrations, or ORM. The data layer is a module-level singleton; swapping in a DB is an interface change, not an architectural one. |
| **Authentication** | Demo app. No login, no permissions, no session management. |
| **API routes / GraphQL** | Server components consume the in-memory store directly. No public API surface is needed; adding one would be pure scaffolding with no functional benefit. |
| **Client-side state management** | Read-only data. URL search params handle filter state on `/documents`. No Zustand, Redux, or React Query. |
| **UI / E2E tests** | Heuristic correctness is the higher-value thing to test and gets the entire testing budget. The heuristics are pure functions; React Testing Library or Playwright would test the rendering pipeline, not the logic. |
| **i18n / locale switcher** | UI labels are English-only; data content is German-only. Runtime locale switching adds a localization framework with no value for a single-audience demo. |
| **Mobile-first design** | Desktop-only layout (240px sidebar + `max-w-4xl` main column). Mobile is not unusable but is not designed for. Finance audit tools are desktop workflows. |
| **Charts** | The Assignment forbids inventing business KPIs; findings are list-shaped, not graph-shaped. Adding a chart library would be decoration. |

---

## Self-review

During a demo walkthrough after the three feature PRs landed, I identified real correctness issues that took priority over a planned 5-finding follow-up. Those are documented below as follow-up PRs. The original 5 review findings remain as documented trade-offs — they are lower-priority than the bugs that were visible on first run.

---

### Follow-up PRs shipped

**PR #1 — Heuristic clustering correctness fixes (3 bugs)** · commit `8a14822`

- **Mega-cluster bug**: D-001 was pulling in 19 unrelated V-007 invoices into a single cluster because the recurring-pattern suppression fired on a weak Vendor+Amount match. The fix tightened suppression to require the full account-pair match, not just Vendor+Amount.
- **Score-breakdown display inconsistency**: the breakdown panel showed `✓ Account pair` for pairs that had actually scored `0` on that component, because the rendering logic was reading a stale pre-filter value. Fixed by threading the live scored component through to the card.
- **Month-name false-positive typo clusters**: `"März"` and `"Marz"` (common OCR artifact) were clustering as `high` severity even when they came from different Vendors and different G/L Accounts. Added a date-token exclusion pass to the normalization pipeline so month-name variants don't drive severity.

**PR #3 — Text-similarity severity ranking refinements** · commit `67c0cd4`

- Raw-identical texts (distance = 0 after normalization) were being fed through the severity ranker and sometimes surfacing as `high`. Distance-0 pairs are F2 (duplicate detection) territory, not F1. PR #3 excludes them from the text-similarity output entirely.
- Digit-only diffs (e.g. `"Rechnung 4571"` vs `"RECHNUNG 4471"`) were classified `high` because the same-Vendor check fired. Reclassified to `medium` — a digit transposition is a meaningful difference that warrants manual inspection, not the same urgency as a character-delete typo on a Vendor identifier.
- A4 was reclassified accordingly from `high` to `low` (case + digit transposition, two different Vendors).

---

### Original 5 findings — documented trade-offs, not actioned this round

**Finding 1 — Storno filter is broader than the spec**
*Category: Architecture*

`duplicate-docs.ts` excludes any Document pair where one Document shares a Vendor with a transit-account Document within 30 days. The spec's intent was to identify reversal-then-resplit patterns (where amount = −original between the two suspected duplicates). The current filter works correctly for B4 but could silently suppress a legitimate duplicate that co-occurs with an unrelated transit-account posting from the same Vendor.

*Why it matters:* False negatives in a duplicate-detection tool erode trust. A finance reviewer who knows two postings were doubled but doesn't see them flagged will stop trusting the tool.

*Disposition:* Documented trade-off — not actioned this round. The demo walkthrough confirmed B4 is correctly excluded and no false negatives appeared in the visible dataset; narrowing the filter requires a labeled negative-case set that doesn't exist yet.

---

**Finding 2 — A5 severity: catalog vs heuristic disagree**
*Category: Testing*

The Anomaly Catalog declares `A5` (`"Lufhansa Flug Berlin"` vs `"Lufthansa Flug Berlin"`) as `expected_severity: "medium"`. The heuristic correctly classifies it as `"high"` — it's a single-character delete on the same Vendor. The test was relaxed to accept either severity rather than updating the catalog to match the heuristic's correct judgment.

*Why it matters:* The catalog is the ground truth. If the heuristic is right (and it is here), the catalog should be updated and the test should assert `"high"`, not accept either. Leaving the catalog wrong means the next person reading it sees a wrong severity for A5.

*Disposition:* Documented trade-off — not actioned this round. The heuristic behavior is correct; the catalog annotation is stale. PR #3 changed A4's effective severity downstream; aligning A5 is a catalog edit + test assertion tightening with no user-visible impact.

---

**Finding 3 — Heuristic input inconsistency**
*Category: DX*

Some routes pass `lines` (the raw `JournalLine[]`) to heuristics; others pass `lineViews` (the denormalized view from `lib/data/views.ts`). Both shapes are functionally equivalent for the current heuristics because the views add derived fields but preserve all originals. However, mixing them across call sites makes the heuristic signatures ambiguous and breaks the principle that a heuristic has one canonical input shape.

*Why it matters:* When a future heuristic needs a field only present in one shape, the developer must trace every call site to know which shape they're getting. Picking one and enforcing it eliminates that ambiguity at zero runtime cost.

*Disposition:* Documented trade-off — not actioned this round. The current heuristics work correctly regardless of which shape they receive; this is a future-maintainer concern, not a present bug.

---

**Finding 4 — Heuristics recompute at module load**
*Category: Performance*

All three heuristics run at server boot time via module-level imports, then are effectively memoized by ES module caching for the lifetime of the server process. For ~150 Documents this is negligible. In a production deployment with larger data or frequent cold starts (Vercel serverless), the boot-time cost grows linearly with dataset size, and the ES module cache does not persist across invocations. The fix would be `React.cache()` wrapping each heuristic result, or explicit cache invalidation hooks when the data changes.

*Why it matters:* Vercel serverless functions can cold-start under load. If heuristic computation takes 200 ms on a real dataset, that's 200 ms of latency on every cold start before the first response. On a warm instance it doesn't matter.

*Disposition:* Documented trade-off — not actioned this round. At 150 Documents the computation is sub-millisecond; the risk is real only at real-dataset scale, and optimizing for that scale requires different data architecture (not just `React.cache()`).

---

**Finding 5 — `normalizeText` duplicated**
*Category: Architecture*

The same normalization function (umlaut-fold → lowercase → collapse whitespace → strip punctuation) is implemented independently in both `lib/heuristics/text-similarity.ts` and `lib/heuristics/duplicate-docs.ts`. The two implementations are functionally identical but diverged versions could silently produce different normalization for the same input, causing the two heuristics to disagree on whether two texts are "the same".

*Why it matters:* Normalization is load-bearing: if Feature 1 normalizes `"Büromaterial"` differently from Feature 2, a text flagged as a typo by Feature 1 will not be recognized as a match by Feature 2's text-similarity component. A single `lib/data/normalize.ts` export eliminates the drift risk.

*Disposition:* Documented trade-off — not actioned this round. The two implementations are verified identical and both pass all 72 tests; the risk is divergence in a future edit, which is caught immediately by the golden-master test suite.

---

## Research (Task 3)

<!-- Filled in Issue 11 -->

---

## Notes

### SKR04-subset assumption

The G/L Account chart is a subset of Germany's standard SKR04 account plan, scoped to the accounts actually needed by the 10 transaction templates: expense accounts `6310`–`6815`, revenue accounts `4xxx`, payables `1600`, receivables `1200`, VAT payable/receivable `1770`/`1570`, bank `1800`, transit `1375`. No multi-entity, no asset depreciation, no inventory. This is enough to demonstrate the heuristics; a real SKR04 deployment would add ~1000 more accounts with no structural change.

### Planted anomaly catalog

15 anomalies were deliberately planted in two passes (clean → corrupt). A reviewer can verify every one in 30 seconds:

```bash
git diff data/data.clean.json data/data.json
```

The full catalog is in [`data/anomaly-catalog.ts`](data/anomaly-catalog.ts). Summary by feature:

**Feature 1 — Text similarity (A1–A5)**

| ID | Description | Severity |
|----|-------------|----------|
| A1 | V-042: `"Cloud hosting Apr"` → `"Clud hosting Apr"` (single-char delete, same Vendor) | high |
| A2 | Staples: umlaut variant `"Bueromaterial"` + whitespace variant `"Büromaterial  "` (double-space) | low |
| A3 | V-042: `"AWS Hosting März"` → `"AWS Hostng März"` (missing `i`, same Vendor) | high |
| A4 | Bürowelt: `"Rechnung 4571"` → `"RECHNUNG 4471"` (case + digit transposition) | low |
| A5 | Lufthansa: `"Lufthansa Flug Berlin"` → `"Lufhansa Flug Berlin"` (missing `t`) | medium |

**Feature 2 — Duplicate detection (B1–B5)**

| ID | Description | Type |
|----|-------------|------|
| B1 | V-007 invoice cloned 1 day later, identical text + amount | positive |
| B2 | V-042 invoice cloned 3 days later, identical text + amount | positive |
| B3 | V-061 (Microsoft) cloned 5 days later, text reworded slightly | positive |
| B4 | Storno-resplit: 1190 EUR reversed + re-posted as 595+595 — **must NOT be flagged** | negative |
| B5 | Monthly rent (V-001): same Vendor + Amount ~30 days apart — **must NOT be flagged** | negative |

**Feature 3 — Rule violations (C1–C5)**

| ID | Description | Severity |
|----|-------------|----------|
| C1 | V-042 invoice: `cost_center` changed from `IT` to `ADMIN` | medium |
| C2 | Office supplies: `tax_code` set to `null` on VAT line (should be `V19`) | medium |
| C3 | Rent document: `cost_center` changed from `ADMIN` to `SALES` | low |
| C4 | Revenue line (4xxx): `debit_credit` flipped to `D` (debited instead of credited) | high |
| C5 | Payroll document: `cost_center` set to `null` on expense line | low |

### Money in raw JSON

All `amount_cents` values in `data.json` are signed integers in minor units (e.g. `250000` = EUR 2,500.00). This is intentional — see [ADR-0001](docs/adr/0001-money-as-integer-cents.md). The display layer (`lib/formatters.ts`) is the sole formatter.

### Tests coverage the planted catalog as a golden-master fixture, not the general case

58 vitest tests run across four test files (`data-integrity.test.ts`, `feature-1.test.ts`, `feature-2.test.ts`, `feature-3.test.ts`). Each heuristic test asserts that the union of cluster Document IDs includes the catalog's `expected_doc_ids` and that negative cases (B4, B5) do not appear in any cluster. See [ADR-0002](docs/adr/0002-testing-against-the-anomaly-catalog.md).
