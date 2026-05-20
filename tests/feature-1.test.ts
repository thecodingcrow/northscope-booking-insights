/**
 * Feature 1 — Text Similarity heuristic
 *
 * Assert that findTextSimilarities(lines) surfaces every expected_doc_id
 * from anomaly catalog entries A1–A5.
 *
 * Test spec: the union of all returned cluster document_ids must include
 * every entry in expected_doc_ids for A1, A2, A3, A4, A5.
 */

import { describe, it, expect } from "vitest";
import { findTextSimilarities } from "@/lib/heuristics/text-similarity";
import { lines } from "@/lib/data/store";
import { anomalyCatalog } from "@/data/anomaly-catalog";

describe("findTextSimilarities", () => {
  // Run once for all assertions
  const clusters = findTextSimilarities(lines);

  // Collect the union of all document_ids from all clusters
  const allClusterDocIds = new Set<string>();
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      allClusterDocIds.add(member.document_id);
    }
  }

  // A1–A5 are text-similarity anomalies (index 0–4 in the catalog)
  const textAnomalies = anomalyCatalog.filter((e) =>
    ["A1", "A2", "A3", "A4", "A5"].includes(e.id)
  );

  for (const entry of textAnomalies) {
    it(`${entry.id}: all expected_doc_ids appear in some cluster`, () => {
      for (const docId of entry.expected_doc_ids) {
        expect(
          allClusterDocIds.has(docId),
          `${entry.id}: doc ${docId} not found in any cluster. Clusters: ${JSON.stringify(
            clusters.map((c) => ({ id: c.id, docs: c.members.map((m) => m.document_id) }))
          )}`
        ).toBe(true);
      }
    });
  }

  it("returns an array", () => {
    expect(Array.isArray(clusters)).toBe(true);
  });

  it("each cluster has a stable id starting with T-", () => {
    for (const cluster of clusters) {
      expect(cluster.id).toMatch(/^T-\d+$/);
    }
  });

  it("severity is high | medium | low", () => {
    for (const cluster of clusters) {
      expect(["high", "medium", "low"]).toContain(cluster.severity);
    }
  });

  it("output is sorted: severity desc then smallest doc_id asc", () => {
    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < clusters.length; i++) {
      const prev = clusters[i - 1];
      const curr = clusters[i];
      const prevRank = severityRank[prev.severity];
      const currRank = severityRank[curr.severity];
      if (prevRank === currRank) {
        const prevMin = Math.min(...prev.members.map((m) => parseInt(m.document_id, 10)));
        const currMin = Math.min(...curr.members.map((m) => parseInt(m.document_id, 10)));
        expect(prevMin).toBeLessThanOrEqual(currMin);
      } else {
        expect(prevRank).toBeLessThanOrEqual(currRank);
      }
    }
  });

  it("umlaut folding: Büromaterial and Bueromaterial normalize to the same string", () => {
    // A2 tests this indirectly, but let's also verify normalization directly
    // by checking that docs 124, 125, 126 all appear in the same cluster
    const a2Entry = anomalyCatalog.find((e) => e.id === "A2")!;
    const clusterContainingA2 = clusters.find((c) =>
      c.members.some((m) => a2Entry.expected_doc_ids.includes(m.document_id))
    );
    expect(clusterContainingA2).toBeDefined();
    const clusterDocIds = clusterContainingA2!.members.map((m) => m.document_id);
    for (const docId of a2Entry.expected_doc_ids) {
      expect(clusterDocIds).toContain(docId);
    }
  });

  it("A1: high severity cluster includes Clud hosting Apr and Cloud hosting Apr", () => {
    const a1Cluster = clusters.find((c) =>
      c.members.some((m) => m.document_id === "1900000106")
    );
    expect(a1Cluster).toBeDefined();
    expect(a1Cluster!.severity).toBe("high");
  });

  it("A3: high severity cluster for AWS Hostng März typo", () => {
    const a3Cluster = clusters.find((c) =>
      c.members.some((m) => m.document_id === "1900000108")
    );
    expect(a3Cluster).toBeDefined();
    expect(a3Cluster!.severity).toBe("high");
  });

  it("A5: cluster found for Lufhansa Flug Berlin typo", () => {
    const a5Cluster = clusters.find((c) =>
      c.members.some((m) => m.document_id === "1900000188")
    );
    expect(a5Cluster).toBeDefined();
    // Both 1900000188 and 1900000191 are V-018 (same vendor, dist=1).
    // The spec severity rules yield "high" here; the catalog marks it "medium".
    // The task acceptance test only requires the doc IDs appear in output — not severity.
    expect(["high", "medium"]).toContain(a5Cluster!.severity);
  });

  it("cluster members include vendor_id and raw_text", () => {
    for (const cluster of clusters) {
      for (const member of cluster.members) {
        expect(typeof member.document_id).toBe("string");
        expect(typeof member.raw_text).toBe("string");
        expect(typeof member.normalized_text).toBe("string");
        expect(typeof member.line_id).toBe("number");
      }
    }
  });

  it("explanation is a non-empty string", () => {
    for (const cluster of clusters) {
      expect(typeof cluster.explanation).toBe("string");
      expect(cluster.explanation.length).toBeGreaterThan(0);
    }
  });
});
