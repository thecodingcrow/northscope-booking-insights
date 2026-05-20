/**
 * ClusterCard — renders one TextSimilarityCluster as a ring card.
 *
 * Visual grammar:
 *   - Stone palette, ring borders, hover state (matches Dashboard/Documents)
 *   - Severity badge: rose (high) / amber (medium) / slate (low)
 *   - Variant texts side-by-side with character-level diff highlighting
 *   - Geist Mono for Document IDs; Geist Sans for body text
 *
 * Server component — no 'use client'.
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TextSimilarityCluster } from "@/lib/heuristics/text-similarity";

// ---------------------------------------------------------------------------
// Character-level diff highlighting
// ---------------------------------------------------------------------------

/**
 * Compute a simple character-level diff between two strings.
 * Returns an array of {char, different} segments for `b` relative to `a`.
 *
 * Algorithm: align from left, align from right, bold the middle "changed" region.
 * This is a simple edit-window approach — not a full LCS diff, but good enough
 * for single-char or small-edit variants.
 */
function charDiff(a: string, b: string): Array<{ char: string; different: boolean }> {
  // Find common prefix length
  let prefixLen = 0;
  while (prefixLen < a.length && prefixLen < b.length && a[prefixLen] === b[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix length (from the end, not overlapping prefix)
  let suffixLen = 0;
  while (
    suffixLen < a.length - prefixLen &&
    suffixLen < b.length - prefixLen &&
    a[a.length - 1 - suffixLen] === b[b.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const result: Array<{ char: string; different: boolean }> = [];
  for (let i = 0; i < b.length; i++) {
    const inPrefix = i < prefixLen;
    const inSuffix = suffixLen > 0 && i >= b.length - suffixLen;
    result.push({ char: b[i], different: !inPrefix && !inSuffix });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ClusterCardProps = {
  cluster: TextSimilarityCluster;
};

export function ClusterCard({ cluster }: ClusterCardProps) {
  const severityVariant = cluster.severity === "high"
    ? "high"
    : cluster.severity === "medium"
      ? "medium"
      : "low";

  // Unique vendors in cluster
  const vendorNames = [
    ...new Set(
      cluster.members
        .map((m) => m.vendor_name)
        .filter((n): n is string => n !== null)
    ),
  ];
  const sameVendor = vendorNames.length === 1;
  const vendorLabel = sameVendor ? vendorNames[0] : null;

  // Pick a representative pair for diff display (first two members)
  const memberPairs = cluster.members.length >= 2
    ? cluster.members.slice(0, Math.min(cluster.members.length, 4))
    : cluster.members;

  // Use first member as the reference for diffing subsequent members
  const referenceText = cluster.members[0].raw_text;

  return (
    <div className="rounded-lg border border-stone-200 bg-white ring-1 ring-stone-100 hover:ring-stone-200 transition-shadow p-6 space-y-4">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <Badge variant={severityVariant} className="shrink-0 mt-0.5">
          {cluster.severity}
        </Badge>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Cluster {cluster.id}
          </p>
          {vendorLabel && (
            <p className="mt-0.5 text-sm font-medium text-stone-700">{vendorLabel}</p>
          )}
        </div>
        <div className="ml-auto shrink-0">
          <span className="text-[11px] font-mono text-stone-400">
            dist={cluster.representative_distance}
          </span>
        </div>
      </div>

      {/* Variant texts side-by-side */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
          Variant texts
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {memberPairs.map((member) => {
            const segments = charDiff(referenceText, member.raw_text);
            return (
              <div
                key={`${member.document_id}-${member.line_id}`}
                className="rounded-md border border-stone-100 bg-stone-50 px-3 py-2"
              >
                <p className="text-sm font-medium text-stone-800 break-words">
                  {segments.map((seg, i) =>
                    seg.different ? (
                      <strong
                        key={i}
                        className="font-bold text-rose-600 underline decoration-dotted"
                      >
                        {seg.char}
                      </strong>
                    ) : (
                      <span key={i}>{seg.char}</span>
                    )
                  )}
                </p>
                <p className="mt-1">
                  <Link
                    href={`/documents/${member.document_id}`}
                    className="font-mono text-[11px] text-stone-400 hover:text-stone-700 transition-colors underline"
                  >
                    {member.document_id}
                  </Link>
                </p>
              </div>
            );
          })}
          {cluster.members.length > 4 && (
            <div className="rounded-md border border-dashed border-stone-200 bg-stone-50/50 px-3 py-2 flex items-center justify-center">
              <span className="text-[12px] text-stone-400">
                +{cluster.members.length - 4} more
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Explanation */}
      <p className="text-[13px] text-stone-600 italic">{cluster.explanation}</p>

      {/* Document ID links */}
      <div className="flex flex-wrap gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 self-center">
          Documents:
        </span>
        {cluster.members.map((member) => (
          <Link
            key={member.document_id}
            href={`/documents/${member.document_id}`}
            className="font-mono text-[12px] text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded px-2 py-0.5 transition-colors"
          >
            {member.document_id}
          </Link>
        ))}
      </div>
    </div>
  );
}
