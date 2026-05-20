# 04 — Feature 1: text similarity (end-to-end)

**Status:** ready-for-agent

## Parent

`.scratch/booking-insights/PRD.md`

## What to build

The full text-similarity feature: heuristic module, route, tests, and Dashboard tile wiring. **Ships as its own PR (`feat/1-text-similarity`)** since this is the first feature slice.

The heuristic is a pure function `findTextSimilarities(lines): TextSimilarityCluster[]`. It surfaces clusters of suspiciously similar `booking_text` values across the whole dataset. The pipeline (per spec §7):

1. **Normalize** each `booking_text`: lowercase → strip punctuation → collapse whitespace → fold German umlauts (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`). Keep both raw and normalized forms in the cluster output for UI display.
2. **De-dupe by Document**: group by `(document_id, normalized_text)`, keep one representative per pair. Same text repeated on every Line of one Document is normal and must not inflate matches.
3. **Pairwise distance** via `fastest-levenshtein` on the de-duped set.
4. **Score** as `similarity = 1 - distance / max(len(a), len(b))`. Flag a pair when `similarity ≥ 0.85` AND `distance ≤ 3`.
5. **Cluster** surviving pairs via union-find — texts A↔B and B↔C form one cluster of 3.
6. **Rank** severity per cluster:
   - `high` — same Vendor across all members, distance 1–2 → likely typo of an identical event
   - `medium` — different Vendors but suspicious overlap → possible wrong Vendor selected
   - `low` — whitespace/casing variants only
7. **Explain** per cluster: generate a one-line string like *"3 booking texts within edit-distance 1, all on Vendor V-042 (V&C Cloud GmbH). Likely typo cluster."*

The output is a stable order (sorted by severity desc, then by smallest doc_id in cluster) so the same input always yields the same output.

`/anomalies/text` renders each cluster as a card with:
- Severity badge (rose/amber/slate per palette)
- Variant texts shown side-by-side (raw form, not normalized) with character-level diff highlighting
- The generated explanation line
- List of involved Document IDs (Geist Mono, clickable to `/documents/[id]`)
- Vendor name shown above the variants when relevant

The Dashboard tile labeled "Text similarities" is updated to show the real count (number of clusters surfaced).

The `/documents/[id]` page's "Flags on this Document" section now lists which clusters involve this Document.

## Acceptance criteria

- [ ] `fastest-levenshtein` installed
- [ ] `lib/heuristics/text-similarity.ts` exports `findTextSimilarities(lines): TextSimilarityCluster[]` as a pure function
- [ ] All 7 pipeline steps implemented per spec; German umlaut folding behaves correctly (e.g., `"Büromaterial"` and `"Bueromaterial"` normalize to the same string)
- [ ] De-dupe step prevents intra-Document line repetition from inflating clusters
- [ ] Thresholds locked: `similarity ≥ 0.85` AND `distance ≤ 3`
- [ ] Severity ranking applied per the 3 rules above
- [ ] Explanation strings are templated and reference Vendor names where applicable
- [ ] Output is deterministically ordered
- [ ] `/anomalies/text` route renders cluster cards matching the locked visual grammar (stone palette, ring borders, hover state)
- [ ] Each cluster card links to all involved Documents
- [ ] `/documents/[id]` "Flags on this Document" lists any text-similarity clusters this Document is part of
- [ ] Dashboard "Text similarities" KPI tile shows the real cluster count
- [ ] `tests/feature-1.test.ts`: assert the union of all returned cluster `doc_ids` includes every `expected_doc_ids` entry from catalog A1, A2, A3, A4, A5
- [ ] Tests run as part of `pnpm test`; pass green
- [ ] Branch: `feat/1-text-similarity`; PR description follows **What / Why / Trade-off** format (2–4 bullets each)
- [ ] Squash-merged on approval

## Blocked by

- `.scratch/booking-insights/issues/02-app-shell-and-dashboard.md`
