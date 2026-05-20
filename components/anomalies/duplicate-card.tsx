/**
 * DuplicateCard — renders one DuplicatePairCluster as a ring card.
 *
 * Shows the transparent component breakdown: one row per scoring component
 * with the actual values (not just ticks), so reviewers see exactly why
 * each pair scored as it did.
 *
 * Visual grammar: stone palette, ring borders, hover state. Matches Dashboard
 * and Document pages. No 'use client' — server component.
 */

import Link from "next/link";
import type { DuplicatePairCluster } from "@/lib/heuristics/duplicate-docs";
import { formatEUR } from "@/lib/format/money";
import { formatDate } from "@/lib/format/dates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkmark(score: number, threshold = 0.5): string {
  return score >= threshold ? "✓" : "−";
}

function partialMark(score: number): string {
  if (score >= 0.95) return "✓";
  if (score >= 0.5) return "~";
  return "−";
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type DuplicateCardProps = {
  cluster: DuplicatePairCluster;
  vendorById: Map<string, { name_de: string }>;
};

export function DuplicateCard({ cluster, vendorById }: DuplicateCardProps) {
  const { id, confidence, members, score_breakdown: sb } = cluster;

  // Canonical members: first two (or more) involved docs
  const [a, b, ...rest] = members;
  const allMembers = [a, b, ...rest].filter(Boolean);

  // Vendor display
  const vendorId = a?.vendor_id;
  const vendorName = vendorId ? (vendorById.get(vendorId)?.name_de ?? vendorId) : null;
  const vendorLabel = vendorId ? `${vendorId} (${vendorName})` : null;

  // Amount display
  const aAmount = a ? formatEUR(a.amount_cents) : "—";
  const bAmount = b ? formatEUR(b.amount_cents) : "—";

  // Account pair display (from first member)
  const [debitAcct, creditAcct] = a?.primary_account_pair ?? ["—", "—"];
  const accountLabel = `${debitAcct} ↔ ${creditAcct}`;

  // Text display (raw normalized texts)
  const aText = a?.normalized_text ? `"${a.normalized_text}"` : "—";
  const bText = b?.normalized_text ? `"${b.normalized_text}"` : "—";

  // Time proximity display
  const daysApart = a && b
    ? Math.abs(
        (new Date(b.posting_date + "T00:00:00Z").getTime() -
          new Date(a.posting_date + "T00:00:00Z").getTime()) /
          86_400_000
      )
    : null;
  const timeLabel =
    daysApart === null
      ? "—"
      : daysApart === 0
        ? "same day"
        : daysApart === 1
          ? "1 day apart"
          : `${Math.round(daysApart)} days apart`;

  // Confidence as percentage
  const confidencePct = Math.round(confidence * 100);

  return (
    <article className="rounded-lg bg-white ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-stone-400">{id}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              Duplicate document
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-stone-700">
            Confidence{" "}
            <span className="font-mono text-stone-900">{confidencePct}%</span>
          </p>
        </div>

        {/* Member document links */}
        <div className="flex flex-col items-end gap-1">
          {allMembers.map((m) => (
            <Link
              key={m.doc_id}
              href={`/documents/${m.doc_id}`}
              className="font-mono text-[12px] text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              {m.doc_id}
            </Link>
          ))}
        </div>
      </div>

      {/* Score breakdown table */}
      <div className="px-6 py-4">
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-stone-50">

            {/* Vendor / customer match */}
            <tr>
              <td className="py-1.5 w-6 text-stone-400 font-mono font-medium">
                {checkmark(sb.vendor_match)}
              </td>
              <td className="py-1.5 pr-4 text-stone-600 font-medium w-48">
                Vendor match
              </td>
              <td className="py-1.5 text-stone-800">
                {vendorLabel ?? (
                  <span className="text-stone-400">no common vendor</span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono text-stone-400 text-[11px]">
                {pct(sb.vendor_match)}
              </td>
            </tr>

            {/* Amount match */}
            <tr>
              <td className="py-1.5 font-mono font-medium text-stone-400">
                {checkmark(sb.amount_match)}
              </td>
              <td className="py-1.5 pr-4 text-stone-600 font-medium">Amount match</td>
              <td className="py-1.5 text-stone-800 font-mono">
                {aAmount}
                {b && aAmount !== bAmount ? (
                  <span className="text-stone-400"> / {bAmount}</span>
                ) : (
                  <span className="text-stone-400"> = {bAmount}</span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono text-stone-400 text-[11px]">
                {pct(sb.amount_match)}
              </td>
            </tr>

            {/* Text similarity */}
            <tr>
              <td className="py-1.5 font-mono font-medium text-stone-400">
                {partialMark(sb.text_similarity)}
              </td>
              <td className="py-1.5 pr-4 text-stone-600 font-medium">
                Text similarity{" "}
                <span className="font-mono text-stone-400">
                  {sb.text_similarity.toFixed(2)}
                </span>
              </td>
              <td className="py-1.5 text-stone-600 text-[12px] max-w-[280px] truncate" title={`${aText} / ${bText}`}>
                {aText}
                {b && a.normalized_text !== b.normalized_text && (
                  <span className="text-stone-400"> / {bText}</span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono text-stone-400 text-[11px]">
                {pct(sb.text_similarity)}
              </td>
            </tr>

            {/* Account pair match */}
            <tr>
              <td className="py-1.5 font-mono font-medium text-stone-400">
                {checkmark(sb.account_pair_match)}
              </td>
              <td className="py-1.5 pr-4 text-stone-600 font-medium">Account pair</td>
              <td className="py-1.5 text-stone-800 font-mono">{accountLabel}</td>
              <td className="py-1.5 text-right font-mono text-stone-400 text-[11px]">
                {pct(sb.account_pair_match)}
              </td>
            </tr>

            {/* Time proximity */}
            <tr>
              <td className="py-1.5 font-mono font-medium text-stone-400">
                {checkmark(sb.time_proximity, 0.1)}
              </td>
              <td className="py-1.5 pr-4 text-stone-600 font-medium">Time proximity</td>
              <td className="py-1.5 text-stone-800">{timeLabel}</td>
              <td className="py-1.5 text-right font-mono text-stone-400 text-[11px]">
                {pct(sb.time_proximity)}
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      {/* Member date strip */}
      <div className="px-6 pb-4">
        <div className="flex flex-wrap gap-3">
          {allMembers.map((m) => (
            <Link
              key={m.doc_id}
              href={`/documents/${m.doc_id}`}
              className="flex items-center gap-2 rounded-md bg-stone-50 px-3 py-1.5 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow"
            >
              <span className="font-mono text-[12px] font-semibold text-indigo-700">
                {m.doc_id}
              </span>
              <span className="text-[11px] text-stone-500">
                {formatDate(m.posting_date)}
              </span>
              <span className="font-mono text-[11px] text-stone-600">
                {formatEUR(m.amount_cents)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
