# 01 — Anomaly Catalog + data generator

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

Set up the canonical Anomaly Catalog and the two-pass data generator that produces both `data/data.clean.json` (all-valid synthetic Documents) and `data/data.json` (the same data with planted anomalies applied). Both files are committed. The Anomaly Catalog is the single source of truth that both the generator (for application) and the heuristic tests (for assertions) consume.

The dataset simulates SAP-style postings for a single German company (`company_code = "1000"`) across **1 March 2026 – 30 April 2026** (61 days). Data content (booking texts, account names, vendor names) is German; identifiers are English.

Generation runs as two CLI scripts via `pnpm gen:clean` and `pnpm gen:corrupt`. The clean pass instantiates 10 transaction templates over the period using master data (`data/accounts.json`, `data/vendors.json`, `data/customers.json`, `data/cost-centers.json` — create these files as part of this issue) to produce balanced Documents. The corrupt pass reads the clean file plus the typed catalog and applies each planted mutation deterministically.

Money is stored as signed integer cents end-to-end (positive = debit, negative = credit, sum to zero per Document). See ADR-0001.

Master data sizing: 12 vendors, 8 customers, 5 cost centers (`ADMIN`, `IT`, `SALES`, `MARKETING`, `OPS`), 3 tax codes (`V19`, `V07`, `null`), ~30 G/L Accounts as a subset of SKR04.

The 10 transaction templates (each produces one balanced Document with `template` tagged on every Line it produces):

| Template | Lines | Pattern |
|---|---|---|
| `vendorInvoiceWithVAT` | 3 | Dr expense + Dr input-VAT / Cr AP |
| `vendorInvoiceNoVAT` | 2 | Dr expense / Cr AP |
| `vendorPayment` | 2 | Dr AP / Cr bank |
| `customerInvoice` | 3 | Dr AR / Cr revenue + Cr output-VAT |
| `customerPayment` | 2 | Dr bank / Cr AR |
| `rent` (monthly recurring, day 1) | 2 | Dr 6310 cc=ADMIN / Cr bank — 2 instances |
| `payroll` (monthly recurring, last day) | 2 | Dr 6020 / Cr bank — 2 instances |
| `depreciation` (monthly recurring, last day) | 2 | Dr 6520 / Cr 0710 — 2 instances |
| `itServicesV042` (frequent) | 3 | Dr 6815 + Dr 1576 / Cr 1600, cc=IT, tax=V19 — ~18 instances |
| `officeSupplies` (varied vendor) | 3 | Dr 6815 + Dr 1576 / Cr 1600, cc varies |

Plus a small amount of "noise" Documents (legal fees, conference registrations) untagged by template, to give the rule miner some "no rule applies" cases.

The Anomaly Catalog has exactly 15 entries (`A1`–`A5`, `B1`–`B5`, `C1`–`C5`) per PRD §5 and spec §5. Each entry encodes (from a prototype-derived shape):

```ts
type AnomalyEntry = {
  id: string;                              // "A1", "B4", "C3", ...
  kind: "typo" | "duplicate-doc" | "rule-violation" | "negative-case";
  target_document_ids: string[];           // docs the generator will mutate
  expected_doc_ids: string[];              // docs that should appear in the heuristic's output (or, for negative-case, must NOT appear)
  expected_severity?: "high" | "medium" | "low";
  description: string;                     // human-readable summary
  mutation: AnomalyMutation;               // serializable instruction the corrupt pass interprets
};
```

The `mutation` shape carries enough information that the corrupt pass is deterministic (no randomness during corruption).

The integrity test (`tests/data-integrity.test.ts`) is part of this issue — it runs `pnpm test` and asserts data correctness.

## Acceptance criteria

- [ ] `data/anomaly-catalog.ts` exports a typed array with exactly 15 entries; IDs are exactly `A1, A2, A3, A4, A5, B1, B2, B3, B4, B5, C1, C2, C3, C4, C5`
- [ ] `data/accounts.json`, `data/vendors.json`, `data/customers.json`, `data/cost-centers.json` are committed with the agreed sizes
- [ ] `pnpm gen:clean` produces `data/data.clean.json` with Documents in [140, 170] and Lines in [400, 500], spanning 1 March 2026 – 30 April 2026 inclusive
- [ ] All 12 vendors and 8 customers appear at least once; all 5 cost centers appear; ~30 distinct G/L Accounts referenced
- [ ] The `itServicesV042` template fires ~18 times; rent fires exactly 2 times; payroll exactly 2 times; depreciation exactly 2 times
- [ ] `pnpm gen:corrupt` reads the clean file + catalog and writes `data/data.json` with all 15 mutations applied
- [ ] Both `data/data.clean.json` and `data/data.json` are committed to the repo
- [ ] `tests/data-integrity.test.ts` passes: for every Document in `data.json`, the signed `amount_cents` of its Lines sums to exactly zero
- [ ] All amounts are signed integers in `amount_cents` (no floats, no string amounts, no decimal libraries)
- [ ] Re-running `pnpm gen:clean && pnpm gen:corrupt` produces byte-identical output (deterministic; use a fixed RNG seed)
- [ ] Conventional Commits on `main` (multiple `chore:` commits OK; this is structure-phase work, no PR)

## Blocked by

None — can start immediately.
