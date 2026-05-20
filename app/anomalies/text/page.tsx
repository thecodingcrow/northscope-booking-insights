/**
 * /anomalies/text — Text Similarity clusters
 *
 * Server component. Reads from the in-memory store, runs findTextSimilarities,
 * and renders cluster cards. Inherits the visual grammar from the Dashboard:
 * stone palette, ring cards, Geist Sans body, Geist Mono for IDs.
 *
 * No 'use client' — pure server rendering.
 */

import { lines } from "@/lib/data/store";
import { findTextSimilarities } from "@/lib/heuristics/text-similarity";
import { ClusterCard } from "@/components/anomalies/cluster-card";

export default function TextSimilaritiesPage() {
  const clusters = findTextSimilarities(lines);

  const highCount = clusters.filter((c) => c.severity === "high").length;
  const mediumCount = clusters.filter((c) => c.severity === "medium").length;
  const lowCount = clusters.filter((c) => c.severity === "low").length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Anomalies
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
            Text Similarities
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-8 py-8">
        <div className="space-y-6">

          {/* Summary row */}
          <section className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Total clusters
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-900">
                {clusters.length}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">near-duplicate texts</p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                High
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-rose-700">
                {highCount}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">same vendor, typo</p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Medium
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-700">
                {mediumCount}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">cross-vendor overlap</p>
            </div>
            <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200 hover:ring-stone-300 transition-shadow">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Low
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-600">
                {lowCount}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">whitespace / casing</p>
            </div>
          </section>

          {/* Clusters list */}
          <section className="space-y-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Clusters
            </h2>
            {clusters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200 bg-white px-8 py-12 text-center">
                <p className="text-sm font-medium text-stone-500">No text-similarity clusters found</p>
                <p className="mt-1 text-[13px] text-stone-400">
                  All booking texts are sufficiently distinct.
                </p>
              </div>
            ) : (
              clusters.map((cluster) => (
                <ClusterCard key={cluster.id} cluster={cluster} />
              ))
            )}
          </section>

        </div>
      </main>
    </div>
  );
}
