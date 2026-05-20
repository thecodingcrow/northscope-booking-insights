/**
 * Dashboard route — "/"
 *
 * Server component. Reads directly from the in-memory store singleton.
 * No fetch, no client state, no useEffect.
 *
 * Visual grammar: Variant B "Triage Inbox"
 * See docs/prototype-notes/0001-dashboard-direction.md
 */

import { lines } from "@/lib/data/store";
import { documentViews } from "@/lib/data/views";
import { formatEUR } from "@/lib/format/money";
import { KpiCard } from "@/components/dashboard/kpi-card";

export default function DashboardPage() {
  // ---------------------------------------------------------------------------
  // KPI computations (server-side, zero cost)
  // ---------------------------------------------------------------------------

  const documentCount = documentViews.length;
  const lineCount = lines.length;

  // Debit volume = sum of all positive amount_cents across all documents
  const debitCents = documentViews.reduce((sum, doc) => sum + doc.debit_cents, 0);
  const debitFormatted = formatEUR(debitCents);

  // Findings count: placeholder until features 04/05/06 land.
  // Value is undefined so KpiCard renders "—" via the typed seam.
  // Issues 04/05/06 will pass a real number here.
  const findingsValue: string | undefined = undefined;

  // Date range from data
  const dates = documentViews.map((d) => d.posting_date).sort();
  const dateFrom = dates[0] ?? "";
  const dateTo = dates[dates.length - 1] ?? "";
  const dateRange =
    dateFrom && dateTo
      ? `${dateFrom.slice(0, 7)} – ${dateTo.slice(0, 7)}`
      : "";

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div className="max-w-4xl">
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
        <div className="max-w-4xl space-y-8">

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
                value={findingsValue}
                sub="anomalies detected"
              />
            </div>
          </section>

          {/* Placeholder for findings list — populated by issues 04/05/06 */}
          <section>
            <div className="rounded-lg border border-dashed border-stone-200 bg-white px-8 py-12 text-center">
              <p className="text-sm font-medium text-stone-500">Findings</p>
              <p className="mt-1 text-[13px] text-stone-400">
                Heuristic results will appear here once features are implemented
                (Issues 04, 05, 06).
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
