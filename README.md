# Booking Insights

## TL;DR

Booking Insights is a Next.js 16 web application that ingests a single period of SAP-style journal-entry data and surfaces three classes of issue a finance team would otherwise catch by hand: booking-text typos (Feature 1), accidental duplicate postings (Feature 2), and deviations from the company's implied posting rules (Feature 3 — Booking Manual). The app ships with a two-pass synthetic dataset of ~150 Documents and 15 deliberately-planted anomalies so a reviewer can verify every heuristic in minutes. See the live demo link below, or clone and run locally in under two minutes with the Quickstart.

---

## Live demo

**URL:** <https://northscope-booking-insights.vercel.app>

The app is live on Vercel. All 6 routes (`/`, `/documents`, `/documents/[id]`, `/anomalies/text`, `/anomalies/duplicates`, `/booking-manual`) load with the generated dataset committed to the repo. Run `pnpm dev` and open `http://localhost:3000` for the same thing locally.

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

During the demo walkthrough — running the app locally and clicking through every view — a number of correctness and polish issues surfaced that drove follow-up PRs. Each item below is something a real user flagged from the running UI, not a self-critique of the code in the abstract.

---

### Follow-up PRs shipped

**PR #1 — Heuristic clustering correctness fixes (3 bugs)** · commit `8a14822`

- **Mega-cluster bug.** The Duplicate view's D-001 entry contained 19 unrelated V-007 invoices with completely different amounts (€330,36; €205,11; €937,71; …), of which only one pair was the actually-planted B1 duplicate. Union-find was transitively merging same-vendor, same-account-pair pairs that crossed the 0.75 threshold for reasons other than being real duplicates. Replaced clustering with flat pair output — each surfaced item is exactly two Documents.
- **Score-breakdown display inconsistency.** The breakdown card displayed `Amount match 100%` alongside values €330,36 / €205,11, which is mathematically impossible. Symptom of showing aggregate cluster percentages next to one specific pair's raw values. With flat pair output the breakdown and values both refer to the same pair.
- **Month-name false-positive typo clusters.** "Lizenzgebühr Microsoft 365 März" vs "Lizenzgebühr Microsoft 365 Apr" was classified `high` severity in the Text Similarity view because Levenshtein distance is exactly 3. These are monthly recurring subscriptions, not typos. Added a German-month-name exemption so pairs whose only differing token is a month name are excluded from F1.

**PR #3 — Text-similarity severity ranking refinements** · commit `67c0cd4`

- **Raw-identical texts on different Documents were classified `low`** ("whitespace variants") even when the raw texts were exactly identical. Two Documents with identical Booking Texts is a duplicate-document signal, not a typo variant — it belongs to F2, not F1. Excluded from F1 entirely.
- **Digit-only one-character diffs were classified `high`.** T-003 ("RECHNUNG 4471" vs "Rechnung 4571") was flagged as a same-vendor typo cluster, but in real life "different invoice numbers" is the more common explanation than "fat-finger typo on the digit." Downgraded digit-only diffs to `medium` so they surface for inspection without overstating the signal. A4 reclassified to `medium` accordingly.

**PR #4 — Removed unrequested stub routes** · commit `984ca07`

- `/vendors` and `/accounts` stub routes were never in the assignment or the implementation spec. An implementing agent had added them on its own initiative to "avoid dead nav links" under a Library section in the sidebar. Removed both routes and the sidebar links pointing at them; the now-orphaned `ComingSoon` component was deleted too.

**PR #5 — Layout alignment and content width** · commit `07aa547`

- **Top-row borders didn't align.** The sidebar's "Northscope Insights" brand block was `h-14` (56px) while the page header (kicker + h1 + padding) was ~82px tall. Their bottom-border lines didn't line up across the top of the app. Bumped the brand block to `h-[82px]` so the top row reads as a single horizontal band.
- **Right-side padding was unbalanced.** Every page wrapped its content in `max-w-4xl` (896px) inside a `px-8` container, which on a wide screen produced an even 32px on the left but a huge unused margin on the right. Removed `max-w-4xl` everywhere — content now fills the column with symmetric `px-8` padding on both sides.

---

## Assumptions

The brief explicitly asks for documented assumptions about account logic and scope. These governed every decision in the data generator and heuristics.

- **Chart of accounts**: subset of SKR04 (~30 accounts). Revenue 4xxx, expenses 6xxx, AP collective 1600, AR collective 1400, bank 1800, VAT input/output 1576/3806. No asset accounts, no intercompany, no inventory.
- **Currency**: single EUR throughout. The `currency` field exists in the schema; multi-currency is an additive change (see Engineering judgment above).
- **Entity**: single `company_code = "1000"`. No intercompany flows modeled.
- **Time window**: 1 March 2026 – 30 April 2026 (2 closed calendar months, ~61 days).
- **Money representation**: signed integer cents end-to-end — `250000` = EUR 2,500.00 (see [ADR-0001](docs/adr/0001-money-as-integer-cents.md)). Display layer is the sole formatter.
- **Storno convention**: B4's reversal uses transit account 1900 (not a strict SAP-conformant reversal pair). This kept the dataset balanced and avoided collateral C4 rule violations that a standard reversal would have triggered.
- **Recurring patterns**: rent fires on day 1 of each month; payroll and depreciation fire on month-end. These regularity assumptions drive the recurring-pattern suppression in Feature 2.
- **itServicesV042**: the "Vendor V-042" relationship is the strongest planted rule pattern (~18 Documents, all on G/L 6815 + tax V19 + cost_center IT) to give the Booking Manual a clear discovery target with high support and 1.00 confidence before violations are planted.

---

## Research (Task 3)

*Context Engineering / Knowledge Graph — how to make "why was this discount granted?" answerable*

- **Context sources to connect**: SOP markdown checked into the repo or a Confluence space (versioned, diff-able); CRM opportunity/deal notes via Salesforce or HubSpot API (discount approval events live here); AP/AR email threads via Gmail or Outlook API with a narrow label filter; the chart-of-accounts data dictionary as a YAML file in the repo (account → description → owner → valid cost-center mappings); and the existing anomaly catalog itself, which is already a typed corpus of known-bad patterns.

- **Entities and relations needed**: `KPI` –[*defined_by*]→ `Definition`; `Definition` –[*owned_by*]→ `Owner`; `Definition` –[*computed_by*]→ `Query/Transformation`; `Query/Transformation` –[*approved_by*]→ `Approval`; `Approval` –[*references*]→ `SourceDocument` (SOP, email, change request); `SourceDocument` –[*governs*]→ `Rule`; `Rule` –[*violated_by*]→ `Document`. The minimum viable graph has these 7 node types and 6 typed edges — enough to answer both "who owns this KPI" and "what change request last touched this rule."

- **Retrieval — vector layer**: embed every SourceDocument chunk (SOP paragraphs, email bodies, CoA descriptions) with a dense model. On query ("why was this discount granted?"), embed the query and ANN-search across all chunks to shortlist semantically relevant paragraphs. Vectors give fuzzy semantic recall; without them, keyword search misses synonyms and paraphrases.

- **Retrieval — graph layer**: from the shortlisted chunks, traverse the typed graph to pull structured context: who owns the matched Rule, what Approval record last changed it, which Documents violated it. Vectors can't do typed traversal — "give me all Documents that violated a Rule owned by the Finance team and approved after 2025-01-01" is a graph query, not a similarity search. Both layers are required because neither is sufficient alone.

- **Evidence-first answers**: every generated answer must cite the specific SourceDocument IDs and graph paths it drew from. Refuse to answer without retrieved support — a hallucinated KPI definition is worse than no answer. This submission already demonstrates the principle one layer down: every finding ties back to specific Document IDs from the anomaly catalog, so a reviewer can trace any flag to its source. The same discipline applied one layer up means context-engineered answers cite their source SOP section, change-request ID, or email thread — not just "the policy says so."

- **Risk 1 — Stale context vs. source-of-truth drift**: a SOP is updated in Confluence but the embedded chunk is 3 months old; the system confidently answers from outdated text. Mitigation: freshness SLOs per source type (e.g. SOPs re-indexed within 24h of a Confluence edit event via webhook; CoA YAML re-indexed on each repo merge to main).

- **Risk 2 — Hallucinated KPI definitions**: the LLM interpolates a plausible-sounding definition that no source document actually contains, because the retrieval step returned only partial context. Mitigation: require evidence-anchored answers — if the retriever returns fewer than N chunks above a confidence threshold, return "I don't have enough source material to answer this confidently" rather than generating from priors. This is the same discipline as ADR-0002: prefer an explicit "no finding" over a false positive.

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
