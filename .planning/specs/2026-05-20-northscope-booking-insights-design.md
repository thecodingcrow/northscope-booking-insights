# Northscope Booking Insights — Design Spec

**Date:** 2026-05-20
**Time budget (implementation):** 2–3 hours
**Status:** Design complete, awaiting user review before plan creation
**References:**
- `ASSIGNMENT.md` — the take-home brief, verbatim
- `CONTEXT.md` — domain glossary
- `docs/adr/0001-money-as-integer-cents.md`
- `docs/adr/0002-testing-against-the-anomaly-catalog.md`
- `docs/prototype-notes/0001-dashboard-direction.md` — visual grammar from prototype

---

## 1. Summary

A Next.js mini-app that loads ~150 synthetic SAP-style journal-entry documents and runs three heuristics to surface red flags:

1. **Text similarity** — near-duplicate `booking_text` clusters (typos, whitespace, casing)
2. **Duplicate-document detection** — pairs/clusters of likely re-postings, separated from legitimate recurring patterns
3. **Booking Manual** — discovered rules of the form *antecedent → consequent* with evidence and violations

The dataset is generated in two passes (clean + corrupt) so an explicit anomaly catalog is the ground truth for both demo storytelling and heuristic correctness tests.

The app ships on Vercel. Code is English; data content is German. Money is integer cents end-to-end (ADR-0001). Heuristics are validated against the anomaly catalog as a golden-master fixture (ADR-0002).

---

## 2. Scope

### In scope
- Data generator (clean + corrupt passes, both files committed)
- 6 Next.js App Router routes
- 3 feature heuristics with unit tests
- README with self-review (5 findings) and 2 follow-up PRs
- Task 3 research write-up (6–8 bullets, section in README)
- Vercel deploy

### Out of scope (judgment-rubric bullets, called out in README)
- Multi-currency / FX rates
- Multi-entity (only `company_code=1000`)
- Real-time data / persistence layer
- Authentication / authorization
- Cash-flow projections, "business KPIs" not derivable from postings (the spec explicitly forbids)
- UI component tests (RTL), E2E tests
- Apriori / generic association rule mining (see Feature 3 rationale)
- Embeddings / LLM-generated rule suggestions

---

## 3. Domain & data model

See `CONTEXT.md` for the glossary. Key shape:

```ts
type JournalLine = {
  // Document-level (denormalized to line)
  document_id: string;        // SAP-style 10-digit, e.g. "1900000123"
  company_code: "1000";
  posting_date: string;       // ISO date "2026-03-15"
  template?: TemplateName;    // optional. Set by the generator on all template-derived lines; null on one-off noise documents (legal fees, conference reg). The rule miner uses this for `template=T → ...` rules.

  // Line-level
  line_id: number;            // 1, 2, 3... per document
  gl_account: string;         // "6310"
  cost_center: string | null; // "ADMIN" | "SALES" | "IT" | "MARKETING" | "OPS" | null

  // Money — signed integer cents (positive = debit, negative = credit)
  amount_cents: number;
  currency: "EUR";
  debit_credit: "D" | "C";

  // Text & meta
  booking_text: string;       // German
  vendor_id: string | null;   // "V-042" — mutually exclusive with customer_id
  customer_id: string | null; // "C-007"
  tax_code: string | null;    // "V19" | "V07" | null
};
```

### Master data files (committed)
- `data/accounts.json` — ~30 accounts, subset of SKR04. Shape: `{ code, name_de, type: "asset"|"liability"|"revenue"|"expense"|"equity", normal_balance: "D"|"C" }`
- `data/vendors.json` — 12 vendors. Shape: `{ id, name_de, default_template_kind }`
- `data/customers.json` — 8 customers. Shape: `{ id, name_de }`
- `data/cost-centers.json` — 5 cost centers: `ADMIN`, `IT`, `SALES`, `MARKETING`, `OPS`

### Generated data files (committed)
- `data/data.clean.json` — output of pass 1, valid balanced documents only
- `data/data.json` — output of pass 2, anomalies applied. **This is what the app loads.**
- `data/anomaly-catalog.ts` — typed catalog of all 15 planted anomalies (canonical truth)

### Time window
**1 March 2026 – 30 April 2026** (61 days, 2 closed calendar months). Recurring patterns fire on day 1 (rent) and last day of month (payroll, depreciation).

### Volume
- ~150 documents
- ~450 lines (avg 3 lines/doc)
- 12 vendors, 8 customers, 28 G/L accounts, 5 cost centers, 3 tax codes

---

## 4. Transaction templates (data generator)

The generator is a list of typed template functions. Each takes parameters and returns one balanced document.

| # | Template | Lines | Pattern |
|---|---|---|---|
| 1 | `vendorInvoiceWithVAT` | 3 | Dr expense + Dr input-VAT / Cr AP |
| 2 | `vendorInvoiceNoVAT` | 2 | Dr expense / Cr AP |
| 3 | `vendorPayment` | 2 | Dr AP / Cr bank |
| 4 | `customerInvoice` | 3 | Dr AR / Cr revenue + Cr output-VAT |
| 5 | `customerPayment` | 2 | Dr bank / Cr AR |
| 6 | `rent` *(monthly recurring)* | 2 | Dr 6310 cc=ADMIN / Cr bank · fires day 1 |
| 7 | `payroll` *(monthly recurring)* | 2 | Dr 6020 / Cr bank · fires last day of month |
| 8 | `depreciation` *(monthly recurring)* | 2 | Dr 6520 / Cr 0710 · fires last day of month |
| 9 | `itServicesV042` *(frequent)* | 3 | Dr 6815 + Dr 1576 / Cr 1600 · cost_center=IT · tax=V19 · ~18 instances |
| 10 | `officeSupplies` *(varied vendor)* | 3 | Dr 6815 + Dr 1576 / Cr 1600 · cost_center varies |

### Generator architecture (clean-then-corrupt)

```
Pass 1 (clean):
  for each scheduled date in window:
    pick template by weighted distribution + monthly-recurring schedule
    instantiate with random parameters from master data
    serialize → data.clean.json   (committed for sanity check)

Pass 2 (corrupt):
  read data.clean.json + anomaly-catalog.ts
  for each catalog entry:
    apply mutation (text change, duplicate document, rule-violating field)
  serialize → data.json           (committed; this is what the app loads)
```

### Demo move
`data.clean.json` and `data.json` are both committed. A reviewer can `git diff` between them to see every planted anomaly in 30 seconds. This is referenced in the README.

---

## 5. Anomaly catalog (15 planted)

The catalog lives in `data/anomaly-catalog.ts` as typed entries. Each has a stable ID referenced by tests.

### Feature 1 targets (text similarity) — should be flagged

| ID | Mutation |
|---|---|
| `A1` | V-042 IT services: `"Cloud hosting Apr"` → `"Clud hosting Apr"` (single-char typo) |
| `A2` | Staples office supplies: 3 variants — `"Büromaterial Staples"`, `"Bueromaterial Staples"`, `"Büromaterial  Staples"` (whitespace) |
| `A3` | V-042 IT services: `"AWS Hosting März"` → `"AWS Hostng März"` (missing char) |
| `A4` | Vendor invoice: text on one doc uppercased — `"RECHNUNG XYZ"` vs `"Rechnung XYZ"` elsewhere |
| `A5` | Travel: `"Lufthansa Flug Berlin"` vs `"Lufhansa Flug Berlin"` — typo plus wrong vendor (the audit catch is the typo) |

### Feature 2 targets (duplicate detection)

| ID | Description | Should flag? |
|---|---|---|
| `B1` | V-007 vendor invoice posted twice, 1 day apart, identical text/amount/accounts | **YES** — high confidence |
| `B2` | V-042 IT services invoice posted twice, 3 days apart, identical | **YES** — high confidence |
| `B3` | Same vendor + same amount + reworded text + 5 days apart | **YES** — medium confidence |
| `B4` | Storno-and-resplit: 1190 EUR original, reversed, re-posted as 595+595 across 2 docs | **NO** — distinguished by reversal detection |
| `B5` | Monthly rent — same vendor + amount, ~30 days apart | **NO** — distinguished by recurring-pattern filter |

### Feature 3 targets (rule violations)

| ID | Rule | Violation |
|---|---|---|
| `C1` | `vendor=V-042 → cost_center=IT` (support 17/18, conf 0.94) | 1 V-042 invoice with `cost_center=ADMIN` |
| `C2` | `template=office-supplies → tax_code=V19` | 1 office supplies with `tax_code=null` |
| `C3` | `template=rent → cost_center=ADMIN` | 1 rent payment with `cost_center=SALES` |
| `C4` | `gl_account_in_range=4xxx → debit_credit=C` | 1 revenue line on debit side |
| `C5` | `template=payroll → cost_center IS NOT NULL` | 1 payroll line missing cost_center |

Plus ~5 natural one-offs (legal fees, conference reg) to give the rule miner some "no rule applies" results.

---

## 6. App architecture

### Routes (Next.js App Router)

```
app/
├── page.tsx                              → "/" Dashboard
├── documents/
│   ├── page.tsx                          → "/documents" Browse table
│   └── [id]/page.tsx                     → "/documents/[id]" Document detail
├── anomalies/
│   ├── text/page.tsx                     → "/anomalies/text" Feature 1
│   └── duplicates/page.tsx               → "/anomalies/duplicates" Feature 2
├── booking-manual/page.tsx               → "/booking-manual" Feature 3
└── layout.tsx                            → sidebar + main shell
```

### In-memory data layer

```
lib/
├── data/
│   ├── load.ts          — imports data/*.json at module level (Next.js bundles them); returns typed store
│   ├── store.ts         — module-level singleton: { lines, documents, accounts, vendors, customers }
│   └── views.ts         — derived: documents view (per-doc rollup), lines view (denormalized)
├── format/
│   ├── money.ts         — formatEUR(cents) → "2.500,00 EUR" (de-DE locale)
│   └── dates.ts         — formatDate(iso) → "15.03.2026"
├── heuristics/
│   ├── text-similarity.ts
│   ├── duplicate-docs.ts
│   └── rule-mining.ts
└── types.ts             — shared domain types (JournalLine, Document, Finding, Rule, ...)
```

**Loading mechanics**: data files are imported at module level (`import lines from "@/data/data.json"`). Next.js bundles them at build time. ES module caching gives module-singleton behavior automatically — no `useEffect`, no fetch, no API route. Server components consume the store directly.

**Heuristic computation**: heuristics run lazily on first request via `cache()` wrapper (React `cache`). Each route's server component imports the heuristic and calls it; results cached for the lifetime of the request. Heuristics are pure functions of the store.

Data layer is read-only: load on server boot, query in server components. No client-side fetching, no API routes.

### Visual grammar (from prototype Variant B)

Locked palette, layout, typography — full detail in `docs/prototype-notes/0001-dashboard-direction.md`. Summary:

- **Palette**: `stone-50` body / `white` sidebar / `stone-200` borders / `rose|amber|slate` severity / `indigo→violet` brand accent
- **Type**: Geist Sans (default), Geist Mono (IDs only)
- **Layout**: 240px left sidebar (sectioned nav) + main column with `max-w-4xl` content + sticky header
- **Card grammar**: findings/documents/rules all render as ringed cards with feature-icon left + content right + hover-revealed actions
- **shadcn/ui primitives**: Button, Card, Badge, Dialog (for doc detail), DropdownMenu (for filters), Table (with TanStack Table for the documents browse)

### Dependencies (locked)
- `next` 16.x, `react` 19.x, `typescript` 5.x, `tailwindcss` 4.x — already scaffolded
- **Add**: `shadcn/ui` (via CLI init), `lucide-react`, `@tanstack/react-table`, `fastest-levenshtein`
- **Test**: `vitest`, `@vitest/coverage-v8` *(coverage not used as a metric; ships with vitest config)*

---

## 7. Feature 1 — Text similarity

### Pipeline (7 steps)

1. **Normalize** each `booking_text`: lowercase → strip punctuation → collapse whitespace → fold umlauts (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`). Keep both raw and normalized forms.
2. **De-dupe by document**: group lines by `(document_id, normalized_text)`, one representative per pair.
3. **Pairwise compare** the de-duped set (~200 entries → ~20k comparisons, sub-50ms) using `fastest-levenshtein`.
4. **Score**: `similarity = 1 - distance / max(len(a), len(b))`. Flag pair when `similarity ≥ 0.85` AND `distance ≤ 3`.
5. **Cluster** surviving pairs via union-find.
6. **Rank** clusters:
   - `high` — same vendor, distance 1–2 → likely typo of identical event
   - `medium` — different vendors, suspicious overlap → possible wrong vendor selected
   - `low` — whitespace/casing variants
7. **Explain**: per cluster, generate description like *"3 booking texts within edit-distance 1, all on vendor V-042. Likely typo cluster."*

### UI
- Route: `/anomalies/text`
- Output: list of clusters, each card shows variant texts side-by-side (with diff highlighting), severity badge, explanation, list of docs (clickable to `/documents/[id]`)

### Library
- `fastest-levenshtein` (3KB, plain Levenshtein, well-typed). Threshold ≤ 3 covers single-character transpositions absorbed as 2-edit changes.

### Test fixtures
- All of `A1`–`A5` must appear in the output
- Each cluster identified by which `Ax` catalog entry it corresponds to

---

## 8. Feature 2 — Duplicate document detection

### Document feature vector

```ts
type DocFeatureVec = {
  doc_id: string;
  vendor_id: string | null;
  customer_id: string | null;
  document_amount_cents: number;        // sum of positive line amounts (= total debits)
  posting_date: Date;
  primary_account_pair: [string, string]; // sorted [largest_debit_account, largest_credit_account] by absolute amount. For 2-line docs this is the only pair; for 3+ line docs (e.g. expense + VAT / AP) it's the dominant Dr account and the dominant Cr account.
  normalized_text: string;               // mode booking_text, normalized
  tax_code: string | null;
  line_count: number;
};
```

### Scoring (weighted component combination)

For each candidate pair `(A, B)` where `A.posting_date ≤ B.posting_date`:

| Component | Weight | Formula |
|---|---:|---|
| Vendor/customer match | 0.30 | exact match → 1.0, else 0.0 |
| Amount match | 0.30 | identical → 1.0; else `1 - abs(diff)/max(A, B)`; min 0 |
| Text similarity | 0.20 | `1 - lev_dist / max_len` on normalized texts |
| Account-pair match | 0.15 | exact match on `primary_account_pair` → 1.0 |
| Time proximity | 0.05 | `exp(-days_apart / 7)` |

Threshold: **`score ≥ 0.75`** → candidate suspicious pair.

### Filters (critical for B4/B5)

- **Recurring-pattern filter**: if `(vendor, amount, account_pair)` triple repeats > 2 times in the window with regular intervals (~30 days), classify as **recurring** and exclude. Catches B5.
- **Storno detection**: if there exists a doc with `amount = -original_amount`, same vendor, posted between the two suspected duplicates, classify as **reversal-and-resplit** and exclude. Catches B4.

### Cluster
Union-find on surviving pairs — pairs that share a doc form one cluster.

### UI
- Route: `/anomalies/duplicates`
- Output: cluster cards with the component-score breakdown shown explicitly (vendor ✓, amount ✓, text ✓, accounts ✓, time ✓, recurring ✗). Transparent confidence.

### Test fixtures
- `B1`, `B2`, `B3` must appear
- `B4`, `B5` must NOT appear

---

## 9. Feature 3 — Booking Manual (rule mining)

### Grammar

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
  support: number;
  confidence: number;
  evidence: string[];     // 3-5 supporting doc_ids
  violations: string[];   // doc_ids where antecedent holds but consequent doesn't
};
```

### Candidate enumeration (8 shapes)

| Antecedent shape | Consequent shape | Catches |
|---|---|---|
| `vendor=X` | `gl_account=Y` | "this vendor → this account" patterns |
| `vendor=X` | `cost_center=Y` | C1 |
| `vendor=X` | `tax_code=Y` | vendor VAT treatment |
| `template=T` | `cost_center=Y` | C3 |
| `template=T` | `tax_code=Y` | C2 |
| `template=T` | `cost_center IS NOT NULL` | C5 (existence) |
| `gl_account_in_range=4xxx` | `debit_credit=C` | C4 |
| `gl_account_in_range=6xxx` | `cost_center IS NOT NULL` | expense lines need cost center |

### Filters
- Support ≥ 5 (avoid coincidence)
- Confidence ≥ 0.85 (avoid weak rules)
- Dominance: prefer single-atom antecedent over conjunction if same consequent and similar confidence
- Cap final ruleset at 8–10 surfaced rules

### UI
- Route: `/booking-manual`
- Each rule is a check card with:
  - Plain-language description
  - Support count + confidence percentage
  - 3 evidence docs (clickable)
  - Violations list (clickable, shows the rule-violating doc)

### Library decision
**No association-rule library.** Native `Map.groupBy` + custom enumeration over the typed atom grammar. ADR-bullet in README:

> *Considered `node-apriori`. Apriori is shape-blind: it would surface `cost_center=IT → tax_code=V19` alongside `vendor → cost_center`. For 150 documents with 8 known rule shapes, explicit candidate enumeration over a typed `Atom` grammar gives more relevant rules, transparent confidence math, and per-doc violation tracking. Apriori is the right call when rule shape is unknown.*

### Test fixtures
- Rules covering all of `C1`–`C5` must appear in the discovered set
- Each rule must list its expected violation doc

---

## 10. Testing strategy

### Vitest only

```
tests/
├── data-integrity.test.ts          — every document balances to zero
├── feature-1.test.ts               — text similarity catches A1-A5
├── feature-2.test.ts               — duplicates catches B1-B3, NOT B4-B5
└── feature-3.test.ts               — rule miner catches C1-C5 rules and their violations
```

Approach: golden-master against the anomaly catalog (see ADR-0002). Each test asserts that the heuristic, run on the corrupted dataset, surfaces exactly the planted IDs (positives) and not the negative cases.

**Catalog ↔ test coupling without heuristic coupling**: catalog entries include `expected_doc_ids: string[]` — the docs the heuristic should surface. Tests import the catalog, run the heuristic, and assert by doc ID intersection. The heuristic does NOT import the catalog (it operates on the corrupted data only). This keeps the heuristic honest while letting the tests use the catalog as truth.

No UI tests, no E2E, no coverage metrics.

---

## 11. Build sequence

### Structure phase — pushed directly to `main`, no PR

Each step is a separate `chore:` commit on `main`. Sequence:

1. `chore: install deps (shadcn, lucide, tanstack-table, fastest-levenshtein, vitest)`
2. `chore: shadcn init + theme to match prototype direction`
3. `chore: master data files (accounts, vendors, customers, cost-centers)`
4. `chore: anomaly catalog`
5. `chore: generator pass 1 (clean) + commit data.clean.json`
6. `chore: generator pass 2 (corrupt) + commit data.json`
7. `chore: data load + store + derived views`
8. `chore: app shell (layout, sidebar, dashboard with real KPIs)`
9. `chore: documents browse + detail routes`
10. `chore: vitest config + data-integrity test`

After step 10: structure phase complete. Three feature branches diverge.

### Feature phase — one PR each, squash merge

- **PR #1** — `feat/1-text-similarity` (Feature 1 + tests)
- **PR #2** — `feat/2-duplicate-detection` (Feature 2 + tests)
- **PR #3** — `feat/3-booking-manual` (Feature 3 + tests)

Each PR description follows the **What / Why / Trade-off** format from the spec.

### Self-review + follow-ups — reactive

After all 3 feature PRs land:
- README section enumerates the 5 review findings (categorized: perf, DX, security, testing, architecture, UI)
- Pick 2 with best signal-per-minute as `fix/N-slug` PRs
- The other 3 findings get a "deliberately not fixed: <reasoning>" bullet in the README

### Deployment
- Vercel CLI link during structure phase (probably step 1, so we get a live URL early)
- Final deploy auto-fires on PR merges to `main`

### Task 3 — Research write-up
- Done last as a README section. 6–8 bullet points: context sources, entities/relations, retrieval (vector + graph), 2 risks + mitigations.

---

## 12. README outline

```
README.md
├── TL;DR — what it does, where to look (1 para)
├── Live demo — Vercel URL + 1 screenshot
├── Quickstart — clone, install, dev, test
├── The data model — short gloss, link to CONTEXT.md and ADRs
├── The three features (per spec output requirement)
│   ├── 1. Text similarity     — what / why / trade-off
│   ├── 2. Duplicate detection — what / why / trade-off
│   └── 3. Booking manual      — what / why / trade-off
├── Architecture & decisions — list of ADRs, one line each
├── Engineering judgment — "deliberately didn't do" bullets
├── Self-review — 5 findings + which 2 became PRs + reasoning for the other 3
├── Research (Task 3) — 6-8 bullets
└── Notes — assumptions, SKR04 subset, planted-anomaly catalog summary
```

---

## 13. Repo conventions

- **Branch naming**: `feat/N-slug`, `fix/N-slug`, `chore/N-slug`
- **Commit format**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **Merge strategy**: squash merge on PRs (one PR = one commit on `main`)
- **Default branch**: `main`
- **No PR templates** (overhead for 3 PRs)

---

## 14. Risks and known unknowns

- **Time risk**: 3 hours is tight for the full sequence above. Mitigation: feature PRs are dispatchable in parallel by separate agents (each PR is one unit), and the structure phase is pre-planned so no design time is spent during implementation.
- **shadcn setup time**: the CLI init plus theming the primitives to match the prototype palette may eat 15–20 min. If it gets stuck, fall back to hand-rolled cards in the variant-B grammar.
- **Heuristic correctness on real data**: explicitly not in scope per ADR-0002. The tests prove "catalog → finding," not generalization.
- **Vercel deploy edge cases**: server components load JSON at boot — should Just Work, but server component bundling could surprise. Mitigation: deploy early during structure phase to catch any issues with the static data files.

---

## 15. Done definition

The take-home is "done" when:

- [ ] Vercel URL loads the dashboard
- [ ] All 6 routes render with real (corrupted) data
- [ ] All 4 Vitest test files pass green
- [ ] Each feature has its own PR with the What/Why/Trade-off description
- [ ] README contains all sections from §12, including the self-review and research
- [ ] At least 2 follow-up PRs landed for the most impactful review findings
- [ ] `data.clean.json` and `data.json` are both committed (so the planted anomalies can be diffed)
