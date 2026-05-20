/**
 * Dashboard route — "/"
 *
 * Server component. Reads directly from the in-memory store singleton.
 * No fetch, no client state, no useEffect.
 *
 * Visual grammar: Variant B "Triage Inbox"
 * See docs/prototype-notes/0001-dashboard-direction.md
 */

import Link from "next/link";
import { lines } from "@/lib/data/store";
import { documentViews, lineViews } from "@/lib/data/views";
import { formatEUR } from "@/lib/format/money";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { findTextSimilarities } from "@/lib/heuristics/text-similarity";
import { findDuplicateDocuments } from "@/lib/heuristics/duplicate-docs";
import { mineRules } from "@/lib/heuristics/rule-mining";

export default function DashboardPage() {
  // ---------------------------------------------------------------------------
  // KPI computations (server-side, zero cost)
  // ---------------------------------------------------------------------------

  const documentCount = documentViews.length;
  const lineCount = lines.length;

  // Debit volume = sum of all positive amount_cents across all documents
  const debitCents = documentViews.reduce((sum, doc) => sum + doc.debit_cents, 0);
  const debitFormatted = formatEUR(debitCents);

  // Heuristic findings (memoized at module load via store import caching)
  const textClusters = findTextSimilarities(lines);
  const duplicateClusters = findDuplicateDocuments(documentViews, lineViews);
  const rules = mineRules(documentViews, lineViews);
  const ruleViolationCount = rules.reduce((sum, r) => sum + r.violations.length, 0);
  const totalFindings = textClusters.length + duplicateClusters.length + ruleViolationCount;

  // Date range from data — German "MM.YYYY – MM.YYYY"
  const dates = documentViews.map((d) => d.posting_date).sort();
  const dateFrom = dates[0] ?? "";
  const dateTo = dates[dates.length - 1] ?? "";
  const toMonthYear = (iso: string) => {
    const [y, m] = iso.split("-");
    return `${m}.${y}`;
  };
  const dateRange =
    dateFrom && dateTo ? `${toMonthYear(dateFrom)} – ${toMonthYear(dateTo)}` : "";

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Overview
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
            Dashboard
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-8 py-8">
        <div className="space-y-8">

          {/* KPI row */}
          <section>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="Documents"
                value={documentCount.toLocaleString("de-DE")}
                sub={dateRange}
              />
              <KpiCard
                label="Lines"
                value={lineCount.toLocaleString("de-DE")}
                sub="journal entries"
              />
              <KpiCard
                label="Debit volume"
                value={debitFormatted}
                sub="gross debit EUR"
                accent
              />
              <KpiCard
                label="Findings"
                value={totalFindings.toLocaleString("de-DE")}
                sub="across 3 features"
              />
            </div>
          </section>

          {/* Findings overview — one entry card per feature, linked to its view */}
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-3">
              By feature
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FeatureEntry
                href="/anomalies/text"
                label="Text similarities"
                count={textClusters.length}
                sub="clusters of near-duplicate booking texts"
              />
              <FeatureEntry
                href="/anomalies/duplicates"
                label="Duplicate documents"
                count={duplicateClusters.length}
                sub="candidate pairs after recurring & storno filters"
              />
              <FeatureEntry
                href="/booking-manual"
                label="Booking manual"
                count={rules.length}
                sub={`${ruleViolationCount} rule violation${ruleViolationCount === 1 ? "" : "s"}`}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function FeatureEntry({
  href,
  label,
  count,
  sub,
}: {
  href: string;
  label: string;
  count: number;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-stone-200 bg-white p-5 hover:border-stone-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
          {label}
        </p>
        <span className="text-2xl font-semibold tabular-nums text-stone-900">
          {count.toLocaleString("de-DE")}
        </span>
      </div>
      <p className="text-[13px] text-stone-500">{sub}</p>
      <p className="mt-3 text-[12px] font-medium text-indigo-600 group-hover:underline">
        Open →
      </p>
    </Link>
  );
}
