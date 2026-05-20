/**
 * Regression tests covering the 3 heuristic correctness bugs fixed in
 * fix/heuristic-clustering-bugs.
 *
 * Bug 1 / Bug 2: duplicate detection must emit flat pairs (not transitive
 *   clusters), and each pair's score breakdown must reflect its own two docs.
 *
 * Bug 3: text-similarity must exempt German month-name substitutions from
 *   typo clustering (recurring period variants like "März" → "Apr").
 */

import { describe, it, expect } from "vitest";
import { findDuplicateDocuments } from "@/lib/heuristics/duplicate-docs";
import { findTextSimilarities, normalizeText } from "@/lib/heuristics/text-similarity";
import { lines } from "@/lib/data/store";
import { documentViews } from "@/lib/data/views";

// ---------------------------------------------------------------------------
// Bug 1: pair-based output — D-001 must not contain 19 V-007 invoices
// ---------------------------------------------------------------------------

describe("Bug 1 — pair-based output (no transitive union-find)", () => {
  const pairs = findDuplicateDocuments(documentViews, lines);

  it("every output item has exactly 2 members", () => {
    for (const pair of pairs) {
      expect(pair.members).toHaveLength(2);
    }
  });

  it("no single output item groups more than 2 V-007 documents together (no mega-cluster)", () => {
    // Before the fix, transitive union-find merged 19 unrelated V-007 invoices
    // into a single D-001 cluster with 19 members.  After the fix, each item is
    // exactly 1 pair (2 members), so no cluster can silently absorb unrelated docs.
    for (const pair of pairs) {
      const v007Members = pair.members.filter((m) => m.vendor_id === "V-007");
      // A pair can contain at most 2 V-007 docs (both members) — never 19
      expect(v007Members.length).toBeLessThanOrEqual(2);
    }
  });

  it("B1 planted duplicate (1900000173 / 1900009000) still appears as a pair", () => {
    const found = pairs.find(
      (p) =>
        p.members.some((m) => m.doc_id === "1900000173") &&
        p.members.some((m) => m.doc_id === "1900009000")
    );
    expect(found, "B1 pair not found in output").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Bug 2: score breakdown reflects the pair's own two documents
// ---------------------------------------------------------------------------

describe("Bug 2 — score breakdown is pair-consistent", () => {
  const pairs = findDuplicateDocuments(documentViews, lines);

  it("for each pair, amount_match is ≥ 0 and ≤ 1", () => {
    for (const pair of pairs) {
      expect(pair.score_breakdown.amount_match).toBeGreaterThanOrEqual(0);
      expect(pair.score_breakdown.amount_match).toBeLessThanOrEqual(1);
    }
  });

  it("for each pair, the stated amount_match is consistent with the members' amounts", () => {
    for (const pair of pairs) {
      const [a, b] = pair.members;
      const amtA = a.amount_cents;
      const amtB = b.amount_cents;

      let expectedAmountMatch: number;
      if (amtA === amtB) {
        expectedAmountMatch = 1.0;
      } else {
        const maxAmt = Math.max(amtA, amtB);
        expectedAmountMatch = maxAmt === 0
          ? 1.0
          : Math.max(0, 1 - Math.abs(amtA - amtB) / maxAmt);
      }

      // Allow rounding tolerance of 0.001
      expect(pair.score_breakdown.amount_match).toBeCloseTo(expectedAmountMatch, 2);
    }
  });

  it("composite score equals the weighted sum of breakdown components", () => {
    for (const pair of pairs) {
      const sb = pair.score_breakdown;
      const expected =
        0.30 * sb.vendor_match +
        0.30 * sb.amount_match +
        0.20 * sb.text_similarity +
        0.15 * sb.account_pair_match +
        0.05 * sb.time_proximity;
      // confidence is the rounded score
      expect(pair.confidence).toBeCloseTo(expected, 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Bug 3: month-name substitution exemption
// ---------------------------------------------------------------------------

describe("Bug 3 — month-name recurring variant exemption", () => {
  const clusters = findTextSimilarities(lines);
  const allDocIds = new Set(clusters.flatMap((c) => c.members.map((m) => m.document_id)));

  it("Lizenzgebühr Microsoft 365 März / Apr pair is NOT flagged as a typo", () => {
    // Docs 1900000178 (März) and 1900000179 (Apr) have the same text except for
    // the month token. They are a recurring subscription, not a typo.
    const microsoftMaerz = "1900000178";
    const microsoftApr = "1900000179";

    // Neither document should appear in a text-similarity cluster
    // (or if they do, they must NOT be in the same cluster together)
    const sharedCluster = clusters.find(
      (c) =>
        c.members.some((m) => m.document_id === microsoftMaerz) &&
        c.members.some((m) => m.document_id === microsoftApr)
    );
    expect(sharedCluster).toBeUndefined();
  });

  it("A1/A3/A5 actual typos still appear (month-name exemption does not suppress real typos)", () => {
    // A1: doc 1900000106 — "Clud hosting Apr" (char delete, not a month substitution)
    expect(allDocIds.has("1900000106")).toBe(true);
    // A3: doc 1900000108 — "AWS Hostng März" (char delete, not a month substitution)
    expect(allDocIds.has("1900000108")).toBe(true);
    // A5: doc 1900000188 — "Lufhansa Flug Berlin" (char delete)
    expect(allDocIds.has("1900000188")).toBe(true);
  });

  it("normalizeText correctly folds März to maerz and Apr to apr", () => {
    expect(normalizeText("Lizenzgebühr Microsoft 365 März")).toBe(
      "lizenzgebuehr microsoft 365 maerz"
    );
    expect(normalizeText("Lizenzgebühr Microsoft 365 Apr")).toBe(
      "lizenzgebuehr microsoft 365 apr"
    );
  });
});
