/**
 * Feature 2 — Duplicate document detection.
 *
 * Entry point: findDuplicateDocuments(documents, lines): DuplicatePairCluster[]
 *
 * Pipeline:
 *   1. Build DocFeatureVec per Document
 *   2. Score each candidate pair (A, B) with weighted composite
 *   3. Apply recurring-pattern filter (B5 — monthly rent)
 *   4. Apply storno filter (B4 — reversal-and-resplit)
 *   5. Emit each suspicious PAIR directly (no transitive union-find clustering)
 *   6. Return sorted pairs
 *
 * Each output item represents exactly ONE pair of documents. No transitive
 * merging — a same-vendor same-account-pair coincidence cannot drag unrelated
 * invoices into the same cluster.
 */

import { distance } from "fastest-levenshtein";
import type { DocumentView, JournalLine } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocFeatureVec = {
  doc_id: string;
  vendor_id: string | null;
  customer_id: string | null;
  /** Sum of positive line amounts (= total debits). */
  document_amount_cents: number;
  posting_date: Date;
  /** Sorted [largest_debit_account, largest_credit_account] by abs amount. */
  primary_account_pair: [string, string];
  /** Mode booking_text normalized (lowercase, strip punct, collapse ws, fold umlauts). */
  normalized_text: string;
  tax_code: string | null;
  line_count: number;
};

export type ClusterMember = {
  doc_id: string;
  posting_date: string; // ISO date string for display
  amount_cents: number;
  vendor_id: string | null;
  customer_id: string | null;
  primary_account_pair: [string, string];
  normalized_text: string;
};

export type ScoreBreakdown = {
  vendor_match: number;
  amount_match: number;
  text_similarity: number;
  account_pair_match: number;
  time_proximity: number;
};

export type DuplicatePairCluster = {
  id: string; // "D-001", "D-002", …
  confidence: number; // composite score in [0, 1]
  members: ClusterMember[];
  score_breakdown: ScoreBreakdown;
};

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a German booking text:
 *  - fold umlauts: ä→ae, ö→oe, ü→ue, ß→ss
 *  - lowercase
 *  - strip punctuation
 *  - collapse whitespace
 */
function normalizeText(text: string): string {
  return text
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "ae")
    .replace(/Ö/g, "oe")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mode (most frequent element) of an array of strings.
 * Ties broken by first occurrence.
 */
function modeString(values: string[]): string {
  if (values.length === 0) return "";
  const counts = new Map<string, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestCount) {
      bestCount = n;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// DocFeatureVec builder
// ---------------------------------------------------------------------------

function buildFeatureVec(
  doc: DocumentView,
  docLines: JournalLine[]
): DocFeatureVec {
  // primary_account_pair: largest debit account (highest positive amount_cents)
  //   and largest credit account (lowest/most-negative amount_cents)
  let largestDebitLine: JournalLine | null = null;
  let largestCreditLine: JournalLine | null = null;

  for (const line of docLines) {
    if (line.amount_cents > 0) {
      if (!largestDebitLine || line.amount_cents > largestDebitLine.amount_cents) {
        largestDebitLine = line;
      }
    } else if (line.amount_cents < 0) {
      if (
        !largestCreditLine ||
        line.amount_cents < largestCreditLine.amount_cents
      ) {
        largestCreditLine = line;
      }
    }
  }

  const debitAccount = largestDebitLine?.gl_account ?? "";
  const creditAccount = largestCreditLine?.gl_account ?? "";
  const primary_account_pair: [string, string] = [debitAccount, creditAccount];

  // normalized_text: mode booking_text across all lines, then normalized
  const texts = docLines.map((l) => l.booking_text);
  const modeText = modeString(texts);
  const normalized_text = normalizeText(modeText);

  // tax_code: first non-null tax code
  const firstTaxCode = docLines.find((l) => l.tax_code !== null)?.tax_code ?? null;

  // customer_id: uniform across lines that have a customer_id
  const customerIds = [...new Set(docLines.map((l) => l.customer_id).filter(Boolean))];
  const customer_id = customerIds.length === 1 ? (customerIds[0] as string) : null;

  return {
    doc_id: doc.document_id,
    vendor_id: doc.vendor_id,
    customer_id,
    document_amount_cents: doc.debit_cents,
    posting_date: new Date(doc.posting_date + "T00:00:00Z"),
    primary_account_pair,
    normalized_text,
    tax_code: firstTaxCode,
    line_count: doc.line_count,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const DAYS_MS = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / DAYS_MS;
}

function scoreVendorCustomer(a: DocFeatureVec, b: DocFeatureVec): number {
  // Match on vendor_id if both have one
  if (a.vendor_id !== null && b.vendor_id !== null) {
    return a.vendor_id === b.vendor_id ? 1.0 : 0.0;
  }
  // Match on customer_id if both have one
  if (a.customer_id !== null && b.customer_id !== null) {
    return a.customer_id === b.customer_id ? 1.0 : 0.0;
  }
  // One or both have neither vendor nor customer — no match
  return 0.0;
}

function scoreAmount(a: DocFeatureVec, b: DocFeatureVec): number {
  if (a.document_amount_cents === b.document_amount_cents) return 1.0;
  const maxAmt = Math.max(a.document_amount_cents, b.document_amount_cents);
  if (maxAmt === 0) return 1.0;
  const diff = Math.abs(a.document_amount_cents - b.document_amount_cents);
  return Math.max(0, 1 - diff / maxAmt);
}

function scoreText(a: DocFeatureVec, b: DocFeatureVec): number {
  const ta = a.normalized_text;
  const tb = b.normalized_text;
  const maxLen = Math.max(ta.length, tb.length);
  if (maxLen === 0) return 1.0;
  const lev = distance(ta, tb);
  return Math.max(0, 1 - lev / maxLen);
}

function scoreAccountPair(a: DocFeatureVec, b: DocFeatureVec): number {
  return a.primary_account_pair[0] === b.primary_account_pair[0] &&
    a.primary_account_pair[1] === b.primary_account_pair[1]
    ? 1.0
    : 0.0;
}

function scoreTimeProximity(a: DocFeatureVec, b: DocFeatureVec): number {
  const days = daysBetween(a.posting_date, b.posting_date);
  return Math.exp(-days / 7);
}

function computeCompositeScore(
  a: DocFeatureVec,
  b: DocFeatureVec
): { score: number; breakdown: ScoreBreakdown } {
  const vendor_match = scoreVendorCustomer(a, b);
  const amount_match = scoreAmount(a, b);
  const text_similarity = scoreText(a, b);
  const account_pair_match = scoreAccountPair(a, b);
  const time_proximity = scoreTimeProximity(a, b);

  const score =
    0.30 * vendor_match +
    0.30 * amount_match +
    0.20 * text_similarity +
    0.15 * account_pair_match +
    0.05 * time_proximity;

  return {
    score,
    breakdown: {
      vendor_match,
      amount_match,
      text_similarity,
      account_pair_match,
      time_proximity,
    },
  };
}

// ---------------------------------------------------------------------------
// Recurring-pattern filter
// ---------------------------------------------------------------------------

/**
 * Returns a Set of doc_ids to exclude because they match a recurring-payment pattern.
 *
 * Pattern: triple (vendor_id, document_amount_cents, primary_account_pair) appears
 * >= 2 times with ALL consecutive intervals being ~30 days ± 3.
 *
 * NOTE: the dataset spans only 2 months, so recurring monthly payments appear
 * exactly twice. We detect >= 2 occurrences where every interval is ~30 days.
 * This correctly catches B5 (monthly rent) while not affecting B1/B2/B3
 * (those have 1- to 5-day intervals, not ~30-day intervals).
 */
function buildRecurringExclusionSet(vecs: DocFeatureVec[]): Set<string> {
  // Group by triple key
  type TripleKey = string;
  const groups = new Map<TripleKey, DocFeatureVec[]>();

  for (const vec of vecs) {
    // Must have a vendor (recurring payments are vendor-based)
    if (vec.vendor_id === null) continue;
    const key = `${vec.vendor_id}|${vec.document_amount_cents}|${vec.primary_account_pair.join(",")}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(vec);
    else groups.set(key, [vec]);
  }

  const excluded = new Set<string>();

  for (const [, bucket] of groups) {
    if (bucket.length < 2) continue;

    // Sort by posting_date
    const sorted = [...bucket].sort((a, b) => a.posting_date.getTime() - b.posting_date.getTime());

    // Check ALL consecutive intervals are ~30 days ± 3
    let allRegular = true;
    for (let i = 1; i < sorted.length; i++) {
      const days = daysBetween(sorted[i - 1].posting_date, sorted[i].posting_date);
      if (days < 27 || days > 33) {
        allRegular = false;
        break;
      }
    }

    // Every interval is regular → recurring pattern, exclude all
    if (allRegular) {
      for (const vec of sorted) excluded.add(vec.doc_id);
    }
  }

  return excluded;
}

// ---------------------------------------------------------------------------
// Storno (reversal) filter
// ---------------------------------------------------------------------------

/**
 * Returns a Set of doc_ids to exclude because they participate in a storno chain.
 *
 * Detection strategy:
 *   1. Find all documents that use a transit G/L account (1900–1999).
 *      These are inter-company clearing / reversal documents.
 *   2. For each storno doc, find all documents sharing the same entity
 *      (vendor_id or customer_id) within a 30-day window.
 *   3. Mark the whole entity-window cluster as storno-involved.
 */
function buildStornoExclusionSet(
  vecs: DocFeatureVec[],
  linesByDoc: Map<string, JournalLine[]>
): Set<string> {
  // Find docs that use a transit account (1900–1999)
  const stornoDocIds = new Set<string>();
  for (const [doc_id, docLines] of linesByDoc) {
    for (const line of docLines) {
      const acct = parseInt(line.gl_account, 10);
      if (acct >= 1900 && acct <= 1999) {
        stornoDocIds.add(doc_id);
        break;
      }
    }
  }

  if (stornoDocIds.size === 0) return new Set();

  const excluded = new Set<string>();
  const vecById = new Map(vecs.map((v) => [v.doc_id, v]));

  for (const stornoId of stornoDocIds) {
    const stornoVec = vecById.get(stornoId);
    if (!stornoVec) continue;

    // Find all vecs sharing the same entity within 30 days of the storno doc
    for (const vec of vecs) {
      if (vec.doc_id === stornoId) {
        excluded.add(vec.doc_id);
        continue;
      }
      const sameVendor =
        stornoVec.vendor_id !== null && stornoVec.vendor_id === vec.vendor_id;
      const sameCustomer =
        stornoVec.customer_id !== null && stornoVec.customer_id === vec.customer_id;
      if (sameVendor || sameCustomer) {
        const days = daysBetween(stornoVec.posting_date, vec.posting_date);
        if (days <= 30) {
          excluded.add(vec.doc_id);
        }
      }
    }
  }

  return excluded;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Find duplicate document pairs in the given documents/lines.
 *
 * Pure function — no side effects, stable output.
 *
 * Returns one DuplicatePairCluster per suspicious PAIR (exactly 2 members).
 * No transitive union-find clustering: each pair is evaluated independently,
 * so a same-vendor/same-account coincidence cannot chain unrelated documents
 * into a mega-cluster.
 */
export function findDuplicateDocuments(
  documents: DocumentView[],
  lines: JournalLine[]
): DuplicatePairCluster[] {
  // Build per-doc line lookup
  const linesByDoc = new Map<string, JournalLine[]>();
  for (const line of lines) {
    const bucket = linesByDoc.get(line.document_id);
    if (bucket) bucket.push(line);
    else linesByDoc.set(line.document_id, [line]);
  }

  // Build feature vectors
  const vecs: DocFeatureVec[] = [];
  for (const doc of documents) {
    const docLines = linesByDoc.get(doc.document_id);
    if (!docLines || docLines.length === 0) continue;
    vecs.push(buildFeatureVec(doc, docLines));
  }

  // Build exclusion sets
  const recurringExcluded = buildRecurringExclusionSet(vecs);
  const stornoExcluded = buildStornoExclusionSet(vecs, linesByDoc);

  // Filter vecs for pairwise scoring
  const activeVecs = vecs.filter(
    (v) => !recurringExcluded.has(v.doc_id) && !stornoExcluded.has(v.doc_id)
  );

  const THRESHOLD = 0.75;

  const docById = new Map(documents.map((d) => [d.document_id, d]));

  const pairs: DuplicatePairCluster[] = [];

  for (let i = 0; i < activeVecs.length; i++) {
    for (let j = i + 1; j < activeVecs.length; j++) {
      // Ensure a.posting_date <= b.posting_date for deterministic ordering
      const [a, b] =
        activeVecs[i].posting_date <= activeVecs[j].posting_date
          ? [activeVecs[i], activeVecs[j]]
          : [activeVecs[j], activeVecs[i]];

      const { score, breakdown } = computeCompositeScore(a, b);
      if (score < THRESHOLD) continue;

      const toMember = (vec: DocFeatureVec): ClusterMember => {
        const doc = docById.get(vec.doc_id);
        return {
          doc_id: vec.doc_id,
          posting_date: doc?.posting_date ?? vec.posting_date.toISOString().slice(0, 10),
          amount_cents: vec.document_amount_cents,
          vendor_id: vec.vendor_id,
          customer_id: vec.customer_id,
          primary_account_pair: vec.primary_account_pair,
          normalized_text: vec.normalized_text,
        };
      };

      pairs.push({
        // Placeholder ID; assigned after sort
        id: "",
        confidence: Math.round(score * 1000) / 1000,
        // Exactly 2 members — the pair itself, earliest first
        members: [toMember(a), toMember(b)],
        // Score breakdown computed between THESE two documents specifically
        score_breakdown: breakdown,
      });
    }
  }

  // Sort by confidence descending, then by first member doc_id for stability
  pairs.sort((x, y) => {
    const diff = y.confidence - x.confidence;
    if (diff !== 0) return diff;
    return x.members[0].doc_id.localeCompare(y.members[0].doc_id);
  });

  // Assign stable sequential IDs after sort
  pairs.forEach((p, i) => {
    p.id = `D-${String(i + 1).padStart(3, "0")}`;
  });

  return pairs;
}
