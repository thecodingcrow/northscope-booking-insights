/**
 * Feature 1 — Text Similarity heuristic
 *
 * Pure function: findTextSimilarities(lines): TextSimilarityCluster[]
 *
 * Pipeline (7 steps per spec §7):
 *   1. Normalize each booking_text
 *   2. De-dupe by (document_id, normalized_text)
 *   3. Pairwise Levenshtein distance on de-duped set
 *   4. Score: similarity = 1 - dist / max(len_a, len_b); flag ≥ 0.85 AND ≤ 3
 *   5. Cluster via union-find
 *   6. Rank severity per cluster
 *   7. Generate explanation string per cluster
 *
 * Output: stable sort — severity desc, then smallest doc_id asc.
 */

import { distance } from "fastest-levenshtein";
import type { JournalLine } from "@/lib/types";
import { vendorById } from "@/lib/data/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextSimilarityCluster = {
  /** Stable ID, e.g. "T-001" */
  id: string;
  severity: "high" | "medium" | "low";
  members: Array<{
    document_id: string;
    line_id: number;
    raw_text: string;
    normalized_text: string;
    vendor_id: string | null;
    vendor_name: string | null;
  }>;
  explanation: string;
  /** Typical pairwise distance within the cluster (minimum pair distance) */
  representative_distance: number;
};

// ---------------------------------------------------------------------------
// Step 1: Normalize
// ---------------------------------------------------------------------------

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "ae",
  Ö: "oe",
  Ü: "ue",
  ß: "ss",
};

export function normalizeText(text: string): string {
  // Fold German umlauts first
  let result = text.replace(/[äöüÄÖÜß]/g, (ch) => UMLAUT_MAP[ch] ?? ch);
  // Lowercase
  result = result.toLowerCase();
  // Strip punctuation (keep letters, digits, spaces)
  result = result.replace(/[^\p{L}\p{N} ]/gu, "");
  // Collapse whitespace
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

// ---------------------------------------------------------------------------
// Month-name exemption (recurring period variants)
// ---------------------------------------------------------------------------

/**
 * Normalized German month name tokens (after umlaut folding + lowercase).
 * Pairs like "maerz" vs "apr" differ only in month name → recurring variant,
 * NOT a typo.
 */
const MONTH_TOKENS = new Set([
  "jan", "januar",
  "feb", "februar",
  "mar", "maerz",
  "apr", "april",
  "mai",
  "jun", "juni",
  "jul", "juli",
  "aug", "august",
  "sep", "september",
  "okt", "oktober",
  "nov", "november",
  "dez", "dezember",
]);

/**
 * Returns true if the only difference between two normalized texts is a single
 * substituted German month-name token — i.e., this pair is a recurring period
 * variant and should NOT be flagged as a typo cluster.
 *
 * Algorithm: tokenize both texts; find positions where tokens differ; require
 * that there is exactly one differing position and both differing tokens are
 * month names.
 */
function isMonthNameSubstitution(normA: string, normB: string): boolean {
  const tokA = normA.split(" ");
  const tokB = normB.split(" ");

  // Token counts must match for a single-token substitution
  if (tokA.length !== tokB.length) return false;

  const diffIndices: number[] = [];
  for (let i = 0; i < tokA.length; i++) {
    if (tokA[i] !== tokB[i]) diffIndices.push(i);
  }

  if (diffIndices.length !== 1) return false;

  const idx = diffIndices[0];
  return MONTH_TOKENS.has(tokA[idx]) && MONTH_TOKENS.has(tokB[idx]);
}

// ---------------------------------------------------------------------------
// Step 2: De-dupe by (document_id, normalized_text) representative
// ---------------------------------------------------------------------------

type Representative = {
  document_id: string;
  line_id: number;
  raw_text: string;
  normalized_text: string;
  vendor_id: string | null;
};

function dedupeByDocument(lines: JournalLine[]): Representative[] {
  const seen = new Set<string>();
  const reps: Representative[] = [];

  for (const line of lines) {
    const key = `${line.document_id}\0${normalizeText(line.booking_text)}`;
    if (!seen.has(key)) {
      seen.add(key);
      reps.push({
        document_id: line.document_id,
        line_id: line.line_id,
        raw_text: line.booking_text,
        normalized_text: normalizeText(line.booking_text),
        vendor_id: line.vendor_id,
      });
    }
  }

  return reps;
}

// ---------------------------------------------------------------------------
// Step 5: Union-Find
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: Map<string, string> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const root = this.parent.get(x)!;
    if (root !== x) {
      const compressed = this.find(root);
      this.parent.set(x, compressed);
      return compressed;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }
}

// ---------------------------------------------------------------------------
// Step 6: Severity ranking helpers
// ---------------------------------------------------------------------------

/**
 * Determine if two normalized texts differ only in whitespace/casing.
 * Since we've already normalized (lowercased + collapsed whitespace),
 * two normalized strings that are identical are casing/whitespace variants.
 *
 * For the purposes of severity "low", we check if the distance is purely
 * due to whitespace before normalization by comparing the normalized texts.
 */
function isWhitespaceCasingVariant(reps: Representative[]): boolean {
  if (reps.length < 2) return false;
  // If all normalized texts are identical, it was purely casing/whitespace
  const normalized = reps.map((r) => r.normalized_text);
  const first = normalized[0];
  return normalized.every((n) => n === first);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Thresholds (locked per spec §7 step 4):
 *   similarity ≥ 0.85 AND distance ≤ 3
 */
const SIMILARITY_THRESHOLD = 0.85;
const DISTANCE_THRESHOLD = 3;

export function findTextSimilarities(lines: JournalLine[]): TextSimilarityCluster[] {
  // Step 2: de-dupe
  const reps = dedupeByDocument(lines);

  // Step 3 + 4: pairwise distance and collect flagged pairs
  const uf = new UnionFind();
  // Track minimum distance for each pair of representative keys
  // key = doc_id (unique per de-duped rep)
  const pairDistances = new Map<string, number>();

  for (let i = 0; i < reps.length; i++) {
    for (let j = i + 1; j < reps.length; j++) {
      const a = reps[i];
      const b = reps[j];

      // Skip same document
      if (a.document_id === b.document_id) continue;

      const dist = distance(a.normalized_text, b.normalized_text);
      const maxLen = Math.max(a.normalized_text.length, b.normalized_text.length);
      if (maxLen === 0) continue;

      const similarity = 1 - dist / maxLen;

      if (similarity >= SIMILARITY_THRESHOLD && dist <= DISTANCE_THRESHOLD) {
        // Month-name substitution exemption: if the only textual difference is
        // a German month token (e.g. "maerz" → "apr"), this is a recurring
        // period variant — not a typo. Do not cluster these pairs.
        if (isMonthNameSubstitution(a.normalized_text, b.normalized_text)) continue;

        uf.union(a.document_id, b.document_id);
        const pairKey = [a.document_id, b.document_id].sort().join("\0");
        pairDistances.set(pairKey, dist);
      }
    }
  }

  // Step 5: group reps into clusters
  const clusterMap = new Map<string, Representative[]>();
  for (const rep of reps) {
    const root = uf.find(rep.document_id);
    // Only include reps that were connected to something
    // A rep is in a cluster if its root was unioned with at least one other
    const bucket = clusterMap.get(root);
    if (bucket) {
      bucket.push(rep);
    } else {
      clusterMap.set(root, [rep]);
    }
  }

  // Filter out singleton clusters (doc_id mapped only to itself = no pair)
  // We detect singletons: a rep's root is itself AND no other rep shares the same root
  const multiMemberClusters = [...clusterMap.values()].filter((members) => {
    if (members.length > 1) return true;
    // Single member: check if it was ever unioned (root != doc_id means it was)
    // Actually the union-find only sets parents when union() is called,
    // so if find(doc_id) == doc_id AND no other rep has the same root, it's singleton.
    return false;
  });

  // Wait - we need to re-check: a cluster may have 1 member after de-dup but still
  // be part of a pair. Let me reconsider: if uf.union(a, b) was called, both a and b
  // will have the same root. So any root that has multiple members in clusterMap is a
  // real cluster. Singletons (root that only has one member and was never unioned) are noise.
  // The filter above handles this correctly.

  // Build TextSimilarityCluster objects
  const clusters: TextSimilarityCluster[] = [];
  let clusterIndex = 1;

  for (const members of multiMemberClusters) {
    // Sort members by document_id for stability
    members.sort((a, b) => a.document_id.localeCompare(b.document_id));

    // Compute representative_distance = minimum pairwise distance in cluster
    let minDist = Infinity;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const pairKey = [members[i].document_id, members[j].document_id].sort().join("\0");
        const d = pairDistances.get(pairKey);
        if (d !== undefined && d < minDist) minDist = d;
      }
    }
    if (minDist === Infinity) {
      // fallback: compute directly
      minDist = distance(members[0].normalized_text, members[1].normalized_text);
    }

    // Step 6: Severity
    const vendorIds = new Set(members.map((m) => m.vendor_id).filter((v): v is string => v !== null));
    const allSameVendor = vendorIds.size === 1 && members.every((m) => m.vendor_id !== null);
    const isWhitespaceCasing = isWhitespaceCasingVariant(members);

    let severity: "high" | "medium" | "low";
    if (isWhitespaceCasing) {
      severity = "low";
    } else if (allSameVendor && minDist <= 2) {
      severity = "high";
    } else if (!allSameVendor) {
      severity = "medium";
    } else {
      // Same vendor but distance 3
      severity = "medium";
    }

    // Step 7: Explanation
    const vendorName =
      vendorIds.size === 1
        ? (vendorById.get([...vendorIds][0])?.name_de ?? null)
        : null;
    const vendorId = vendorIds.size === 1 ? [...vendorIds][0] : null;

    let explanation: string;
    if (isWhitespaceCasing) {
      explanation = `${members.length} booking texts are whitespace/casing variants of each other.`;
    } else if (allSameVendor && vendorName) {
      explanation = `${members.length} booking texts within edit-distance ${minDist}, all on vendor ${vendorId} (${vendorName}). Likely typo cluster.`;
    } else if (vendorIds.size > 1) {
      explanation = `${members.length} booking texts from different vendors within edit-distance ${minDist}. Possible wrong Vendor selected.`;
    } else {
      explanation = `${members.length} booking texts within edit-distance ${minDist}.`;
    }

    clusters.push({
      id: `T-${String(clusterIndex).padStart(3, "0")}`,
      severity,
      members: members.map((m) => ({
        document_id: m.document_id,
        line_id: m.line_id,
        raw_text: m.raw_text,
        normalized_text: m.normalized_text,
        vendor_id: m.vendor_id,
        vendor_name: m.vendor_id ? (vendorById.get(m.vendor_id)?.name_de ?? null) : null,
      })),
      explanation,
      representative_distance: minDist,
    });

    clusterIndex++;
  }

  // Step output: sort by severity desc, then smallest doc_id asc
  const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  clusters.sort((a, b) => {
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) return rankDiff;
    const aMin = a.members[0].document_id; // already sorted
    const bMin = b.members[0].document_id;
    return aMin.localeCompare(bMin);
  });

  // Re-assign IDs after sort for stable sequential numbering
  for (let i = 0; i < clusters.length; i++) {
    clusters[i].id = `T-${String(i + 1).padStart(3, "0")}`;
  }

  return clusters;
}
