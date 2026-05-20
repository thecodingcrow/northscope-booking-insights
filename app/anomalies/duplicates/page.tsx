/**
 * /anomalies/duplicates — Duplicate document clusters
 *
 * Server component. Reads from the in-memory store, calls
 * findDuplicateDocuments, and renders each cluster card with the
 * full transparent component breakdown.
 *
 * No 'use client' — pure server rendering.
 */

import { lines } from "@/lib/data/store";
import { documentViews } from "@/lib/data/views";
import { vendorById } from "@/lib/data/store";
import { findDuplicateDocuments } from "@/lib/heuristics/duplicate-docs";
import { DuplicateCard } from "@/components/anomalies/duplicate-card";

export default function DuplicatesPage() {
  const clusters = findDuplicateDocuments(documentViews, lines);

  const totalClusters = clusters.length;
  const highConfidenceCount = clusters.filter((c) => c.confidence >= 0.90).length;
  const mediumConfidenceCount = clusters.filter(
    (c) => c.confidence >= 0.75 && c.confidence < 0.90
  ).length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Anomalies
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
            Duplicate Documents
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-8 py-8">
        <div className="space-y-6">

          {/* Summary row */}
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Duplicate pairs
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-900">
                {totalClusters}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">clusters detected</p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                High confidence
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-rose-700">
                {highConfidenceCount}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">confidence ≥ 90%</p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Medium confidence
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-700">
                {mediumConfidenceCount}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">confidence 75–89%</p>
            </div>
          </section>

          {/* Clusters list */}
          <section className="space-y-4">
            {clusters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200 bg-white px-8 py-12 text-center">
                <p className="text-sm font-medium text-stone-500">No duplicate clusters found</p>
                <p className="mt-1 text-[13px] text-stone-400">
                  All documents passed the duplicate detection heuristic.
                </p>
              </div>
            ) : (
              clusters.map((cluster) => (
                <DuplicateCard
                  key={cluster.id}
                  cluster={cluster}
                  vendorById={vendorById}
                />
              ))
            )}
          </section>

        </div>
      </main>
    </div>
  );
}
