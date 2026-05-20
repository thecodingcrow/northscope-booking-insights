# 05 — Feature 2: duplicate document detection (end-to-end)

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

The full duplicate-document feature: heuristic, route, tests, Dashboard tile wiring. **Ships as its own PR (`feat/2-duplicate-detection`).**

The heuristic is a pure function `findDuplicateDocuments(documents, lines): DuplicatePairCluster[]`. It compares Documents pairwise on a small feature vector and surfaces likely accidental re-postings. Two critical filters distinguish true duplicates from legitimate look-alikes.

**Document feature vector** (from prototype, locked shape):

```ts
type DocFeatureVec = {
  doc_id: string;
  vendor_id: string | null;
  customer_id: string | null;
  document_amount_cents: number;          // sum of positive Line amounts per Document
  posting_date: Date;
  primary_account_pair: [string, string]; // sorted [largest_debit_account, largest_credit_account] by absolute amount
  normalized_text: string;                // most common booking_text in the Document, after normalization
  tax_code: string | null;
  line_count: number;
};
```

**Scoring** — for each candidate pair `(A, B)` where `A.posting_date ≤ B.posting_date`, compute a weighted composite:

| Component | Weight | Formula |
|---|---:|---|
| Vendor/customer match | 0.30 | exact match → `1.0`, else `0.0` |
| Amount match | 0.30 | identical → `1.0`; else `1 - abs(diff)/max(A, B)`; min `0` |
| Text similarity | 0.20 | `1 - lev_dist / max_len` on normalized texts (use `fastest-levenshtein`) |
| Account-pair match | 0.15 | exact match on `primary_account_pair` → `1.0` |
| Time proximity | 0.05 | `exp(-days_apart / 7)` |

Threshold: **`score ≥ 0.75`** → candidate pair.

**Filters that must apply before flagging** (these are what distinguish good from naive):

- **Recurring-pattern filter**: if the triple `(vendor_id, document_amount_cents, primary_account_pair)` repeats > 2 times across the window with regular intervals (~30 days ± 3), classify as **recurring** and exclude. Catches anomaly catalog entry `B5` (monthly rent).
- **Storno (reversal) detection**: if there exists a Document with `amount = -original_amount`, same vendor, posted between the two suspected duplicates, classify as **reversal-and-resplit** and exclude. Catches catalog entry `B4`.

**Cluster** surviving pairs via union-find — if A↔B and B↔C, present as one cluster of 3.

`/anomalies/duplicates` renders each cluster as a card with the **transparent component breakdown** shown explicitly so the reviewer can see why the score is what it is:

```
F-002 — Duplicate document (confidence 0.94)
  ✓ Vendor match         V-007 (Bürowelt GmbH)
  ✓ Amount match         €1.190,00 = €1.190,00
  ~ Text similarity 0.91  "Rechnung 4471" / "Rechnung 4471 "
  ✓ Account pair         6815 ↔ 1600
  ✓ Time proximity       1 day apart
  − Not recurring
```

The Dashboard tile labeled "Duplicate pairs" reflects the real count.

`/documents/[id]`'s "Flags on this Document" section lists involvement in any duplicate cluster.

## Acceptance criteria

- [ ] `lib/heuristics/duplicate-docs.ts` exports `findDuplicateDocuments(documents, lines): DuplicatePairCluster[]` as a pure function
- [ ] `DocFeatureVec` built per Document following the locked shape (Document Amount = sum of positive Line amounts, NOT signed sum)
- [ ] `primary_account_pair` = sorted `[largest_debit_account, largest_credit_account]` by absolute amount
- [ ] Component scores computed with the locked weights `0.30 / 0.30 / 0.20 / 0.15 / 0.05`
- [ ] Threshold `0.75` for flagging
- [ ] Recurring-pattern filter excludes vendor+amount+account triples that repeat ≥ 3 times at ~30-day intervals
- [ ] Storno-detection filter excludes pairs where a reversal Document with negated amount and same vendor sits between them
- [ ] Pairs unioned into clusters
- [ ] `/anomalies/duplicates` renders each cluster with the full component breakdown visible (one row per component, with the actual values, not just the score)
- [ ] Confidence shown as percentage (`94%`)
- [ ] Each cluster card links to all involved Documents
- [ ] `/documents/[id]` "Flags on this Document" lists duplicate-cluster involvement
- [ ] Dashboard "Duplicate pairs" KPI tile shows the real cluster count
- [ ] `tests/feature-2.test.ts`: assert clusters include the `expected_doc_ids` from catalog entries `B1`, `B2`, `B3`; assert the doc_ids associated with `B4` and `B5` do NOT appear in any cluster
- [ ] Tests pass green via `pnpm test`
- [ ] Branch: `feat/2-duplicate-detection`; PR description follows **What / Why / Trade-off** format
- [ ] Squash-merged on approval

## Blocked by

- `.scratch/booking-insights/issues/02-app-shell-and-dashboard.md`
