/**
 * Feature 2 tests — duplicate document detection.
 *
 * Asserts:
 *   - Clusters include the expected_doc_ids from catalog entries B1, B2, B3
 *   - The doc_ids associated with B4 and B5 do NOT appear in any cluster's members
 *     (recurring-pattern and storno filters correctly excluded them)
 */

import { describe, it, expect } from "vitest";
import { findDuplicateDocuments } from "@/lib/heuristics/duplicate-docs";
import type { DuplicatePairCluster } from "@/lib/heuristics/duplicate-docs";
import dataRaw from "../data/data.json";
import type { JournalLine } from "@/lib/types";

const lines = dataRaw as JournalLine[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDocumentViews(lines: JournalLine[]) {
  const byDoc = new Map<string, JournalLine[]>();
  for (const line of lines) {
    const bucket = byDoc.get(line.document_id);
    if (bucket) bucket.push(line);
    else byDoc.set(line.document_id, [line]);
  }

  return Array.from(byDoc.entries()).map(([document_id, docLines]) => {
    const first = docLines[0];
    const debit_cents = docLines.reduce(
      (sum, l) => (l.amount_cents > 0 ? sum + l.amount_cents : sum),
      0
    );
    const vendorIds = [...new Set(docLines.map((l) => l.vendor_id).filter(Boolean))];
    const vendor_id = vendorIds.length === 1 ? (vendorIds[0] as string) : null;
    const accounts = [...new Set(docLines.map((l) => l.gl_account))];
    const tax_codes = [
      ...new Set(docLines.map((l) => l.tax_code).filter((t): t is string => t !== null)),
    ];
    return {
      document_id,
      posting_date: first.posting_date,
      template: first.template,
      line_count: docLines.length,
      debit_cents,
      vendor_id,
      accounts,
      tax_codes,
    };
  });
}

const documents = buildDocumentViews(lines);

// ---------------------------------------------------------------------------
// Anomaly catalog doc IDs (from anomaly-catalog.ts target_document_ids)
// ---------------------------------------------------------------------------

const B1_IDS = ["1900000173", "1900009000"];
const B2_IDS = ["1900000116", "1900009001"];
const B3_IDS = ["1900000180", "1900009002"];

// B4: storno-and-resplit — must NOT be flagged
const B4_IDS = ["1900000138", "1900009003", "1900009004", "1900009005"];
// B5: monthly rent — must NOT be flagged
const B5_IDS = ["1900000100", "1900000101"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findDuplicateDocuments — Feature 2", () => {
  // Run once per describe block
  const clusters: DuplicatePairCluster[] = findDuplicateDocuments(documents, lines);

  it("returns an array", () => {
    expect(Array.isArray(clusters)).toBe(true);
  });

  it("cluster IDs are unique and stable (D-001, D-002, …)", () => {
    const ids = clusters.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^D-\d{3}$/));
  });

  it("clusters are sorted by confidence descending", () => {
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i - 1].confidence).toBeGreaterThanOrEqual(clusters[i].confidence);
    }
  });

  // --- Positive assertions: B1, B2, B3 must appear ---

  it("B1 — V-007 Bürowelt duplicate (1 day apart) appears in a cluster", () => {
    const found = clusters.find((c) => {
      const ids = c.members.map((m) => m.doc_id);
      return B1_IDS.every((id) => ids.includes(id));
    });
    expect(found, `Expected cluster containing ${B1_IDS.join(", ")}`).toBeDefined();
  });

  it("B1 cluster has confidence >= 0.75", () => {
    const found = clusters.find((c) => {
      const ids = c.members.map((m) => m.doc_id);
      return B1_IDS.every((id) => ids.includes(id));
    });
    expect(found?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("B2 — V-042 IT services duplicate (3 days apart) appears in a cluster", () => {
    const found = clusters.find((c) => {
      const ids = c.members.map((m) => m.doc_id);
      return B2_IDS.every((id) => ids.includes(id));
    });
    expect(found, `Expected cluster containing ${B2_IDS.join(", ")}`).toBeDefined();
  });

  it("B2 cluster has confidence >= 0.75", () => {
    const found = clusters.find((c) => {
      const ids = c.members.map((m) => m.doc_id);
      return B2_IDS.every((id) => ids.includes(id));
    });
    expect(found?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("B3 — V-061 Microsoft duplicate (5 days apart, text rewording) appears in a cluster", () => {
    const found = clusters.find((c) => {
      const ids = c.members.map((m) => m.doc_id);
      return B3_IDS.every((id) => ids.includes(id));
    });
    expect(found, `Expected cluster containing ${B3_IDS.join(", ")}`).toBeDefined();
  });

  it("B3 cluster has confidence >= 0.75", () => {
    const found = clusters.find((c) => {
      const ids = c.members.map((m) => m.doc_id);
      return B3_IDS.every((id) => ids.includes(id));
    });
    expect(found?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  // --- Negative assertions: B4 and B5 must NOT appear ---

  it("B4 — storno-and-resplit documents do NOT appear in any cluster", () => {
    const allMemberIds = clusters.flatMap((c) => c.members.map((m) => m.doc_id));
    for (const id of B4_IDS) {
      expect(
        allMemberIds,
        `B4 doc ${id} must not appear in any cluster (storno filter)`
      ).not.toContain(id);
    }
  });

  it("B5 — monthly rent documents do NOT appear in any cluster", () => {
    const allMemberIds = clusters.flatMap((c) => c.members.map((m) => m.doc_id));
    for (const id of B5_IDS) {
      expect(
        allMemberIds,
        `B5 doc ${id} must not appear in any cluster (recurring filter)`
      ).not.toContain(id);
    }
  });

  // --- Score breakdown shape ---

  it("each cluster exposes a score_breakdown with the 5 components", () => {
    for (const cluster of clusters) {
      expect(cluster.score_breakdown).toHaveProperty("vendor_match");
      expect(cluster.score_breakdown).toHaveProperty("amount_match");
      expect(cluster.score_breakdown).toHaveProperty("text_similarity");
      expect(cluster.score_breakdown).toHaveProperty("account_pair_match");
      expect(cluster.score_breakdown).toHaveProperty("time_proximity");
    }
  });

  it("each cluster member has required display fields", () => {
    for (const cluster of clusters) {
      for (const member of cluster.members) {
        expect(member).toHaveProperty("doc_id");
        expect(member).toHaveProperty("posting_date");
        expect(member).toHaveProperty("amount_cents");
        expect(member).toHaveProperty("vendor_id");
        expect(member).toHaveProperty("primary_account_pair");
        expect(member).toHaveProperty("normalized_text");
      }
    }
  });
});
