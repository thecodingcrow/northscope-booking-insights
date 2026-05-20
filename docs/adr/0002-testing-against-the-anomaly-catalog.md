# Heuristics are tested against the planted anomaly catalog

The unit tests for Features 1, 2, and 3 assert that each heuristic surfaces the deliberately-planted anomalies (`A1`…`A5`, `B1`…`B5` positives, `C1`…`C5`) and does **not** surface the deliberately-planted negative cases (`B4` storno-resplit, `B5` recurring rent). The catalog lives in `data/anomaly-catalog.ts` and is the single source of truth for both data generation and test expectations.

## Why we accept this

The honest framing is **golden-master integration testing**, not heuristic validation in the general case. We are *not* proving the heuristics generalize to arbitrary real-world books — we have no real-world books. We are proving that the data + heuristic + presentation pipeline, end-to-end, recognizes the patterns we said it would, including discriminating positives from negatives.

We mitigate the obvious circularity in two ways:

- The **catalog is data**, the **heuristics are code**, and they do not share a code path. A heuristic that special-cased the catalog entries would fail in obvious ways — the catalog deliberately mixes typo, vendor, and amount changes that exercise different parts of the pipeline.
- We include **negative cases** (`B4`, `B5`) where the antecedent looks suspicious but the heuristic must distinguish — those tests fail if the heuristic gets lazy.

## What this is not

- A claim that 100% test coverage of the catalog means the heuristics are correct on unseen data.
- A substitute for property-based or fuzz testing — neither is in scope for the time budget.
- An argument against running against real data later. Once we have real data, the catalog tests stay as regression anchors and a separate test suite would assert behavior on real samples.

## Trade-off explicitly named in the README

The README's "Engineering judgment" section calls this out so the reviewer doesn't think we missed it: *"Tests cover the planted anomalies as a golden-master fixture, not the general case. Real-data validation would be a separate suite."*
