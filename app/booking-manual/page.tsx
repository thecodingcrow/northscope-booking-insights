/**
 * /booking-manual — Booking Manual (Rule Mining)
 *
 * Server component. Calls mineRules() and renders each discovered rule as a
 * check card with:
 *   - Plain-language description
 *   - Stats row: Support, Confidence, Violation count
 *   - Evidence: 3 supporting Document IDs (clickable)
 *   - Violations: Document IDs that break the rule (visually distinct)
 *
 * Inherits the stone/white visual grammar from /documents and /anomalies.
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { documentViews } from "@/lib/data/views";
import { lines } from "@/lib/data/store";
import { mineRules } from "@/lib/heuristics/rule-mining";
import type { Rule } from "@/lib/heuristics/rule-mining";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Helper: format confidence as percentage
// ---------------------------------------------------------------------------

function fmtPct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

// ---------------------------------------------------------------------------
// Helper: rule ID → severity badge variant
// Rules with violations are "medium" severity; clean rules are informational
// ---------------------------------------------------------------------------

function violationSeverity(rule: Rule): "high" | "medium" | "low" {
  if (rule.violations.length === 0) return "low";
  const violationRate = rule.violations.length / rule.support;
  if (violationRate > 0.1) return "high";
  return "medium";
}

// ---------------------------------------------------------------------------
// RuleCard component (server-side, no 'use client')
// ---------------------------------------------------------------------------

function RuleCard({ rule }: { rule: Rule }) {
  const hasViolations = rule.violations.length > 0;
  const severity = violationSeverity(rule);

  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      {/* Card header */}
      <div className="px-6 py-5 border-b border-stone-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Rule ID */}
            <span className="text-[11px] font-mono font-semibold text-stone-400 mb-1 block">
              {rule.id}
            </span>
            {/* Description */}
            <p className="text-[15px] font-semibold text-stone-900 leading-snug">
              {rule.description}
            </p>
          </div>
          {/* Status badge */}
          {hasViolations ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <Badge variant={severity} className="whitespace-nowrap">
                {rule.violations.length} violation{rule.violations.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <Badge variant="low" className="whitespace-nowrap">
                No violations
              </Badge>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-3 flex items-center gap-4 text-[12px] text-stone-500">
          <span>
            <span className="font-semibold text-stone-700">{rule.support}</span> docs
          </span>
          <span className="text-stone-200">·</span>
          <span>
            <span className="font-semibold text-stone-700">{fmtPct(rule.confidence)}</span>{" "}
            confidence
          </span>
          {hasViolations && (
            <>
              <span className="text-stone-200">·</span>
              <span className="text-amber-600 font-medium">
                {rule.violations.length} violation{rule.violations.length !== 1 ? "s" : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Card body: evidence + violations */}
      <div className="grid grid-cols-1 divide-y divide-stone-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {/* Evidence */}
        <div className="px-6 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
            Supporting docs
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rule.evidence.map((docId) => (
              <Link
                key={docId}
                href={`/documents/${docId}`}
                className="inline-flex items-center gap-1 rounded-md bg-stone-50 border border-stone-200 px-2 py-1 font-mono text-[11px] text-stone-600 hover:bg-stone-100 hover:text-stone-900 hover:border-stone-300 transition-colors"
              >
                {docId}
                <ChevronRight className="h-2.5 w-2.5 text-stone-400" />
              </Link>
            ))}
          </div>
        </div>

        {/* Violations */}
        <div className="px-6 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
            Violations
          </p>
          {rule.violations.length === 0 ? (
            <p className="text-[12px] text-stone-300 italic">None detected</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {rule.violations.map((docId) => (
                <Link
                  key={docId}
                  href={`/documents/${docId}`}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-1 font-mono text-[11px] text-rose-700 hover:bg-rose-100 hover:text-rose-900 hover:border-rose-300 transition-colors"
                >
                  <AlertTriangle className="h-2.5 w-2.5 text-rose-500" />
                  {docId}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BookingManualPage() {
  const rules = mineRules(documentViews, lines);
  const violationCount = rules.reduce((sum, r) => sum + r.violations.length, 0);

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Analysis
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
            Booking Manual
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-8 py-8">
        <div className="space-y-8">

          {/* Summary bar */}
          <section>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-white ring-1 ring-stone-200 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  Rules discovered
                </p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">
                  {rules.length}
                </p>
                <p className="mt-1.5 text-[11px] text-stone-400">
                  booking patterns
                </p>
              </div>
              <div className="rounded-lg bg-white ring-1 ring-stone-200 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  Rules with violations
                </p>
                <p className="mt-2 text-2xl font-semibold text-amber-600">
                  {rules.filter((r) => r.violations.length > 0).length}
                </p>
                <p className="mt-1.5 text-[11px] text-stone-400">
                  need review
                </p>
              </div>
              <div className="rounded-lg bg-white ring-1 ring-stone-200 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  Total violations
                </p>
                <p className="mt-2 text-2xl font-semibold text-rose-600">
                  {violationCount}
                </p>
                <p className="mt-1.5 text-[11px] text-stone-400">
                  documents to inspect
                </p>
              </div>
            </div>
          </section>

          {/* Rule cards */}
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-4">
              Discovered rules
            </h2>
            <div className="space-y-4">
              {rules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} />
              ))}
            </div>
          </section>

          {/* Methodology note */}
          <section>
            <div className="rounded-lg border border-dashed border-stone-200 bg-white px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
                Methodology
              </p>
              <p className="text-[13px] text-stone-500 leading-relaxed">
                Rules are mined from the journal using association rule analysis over 8 candidate
                patterns: vendor→G/L account, vendor→cost center, vendor→tax code,
                template→cost center, template→tax code, template→has cost center,
                4xxx accounts→credit side, 6xxx accounts→has cost center. Each rule reports
                support (count of matching documents) and confidence (fraction that satisfy the
                consequent). Violations are documents where the antecedent applies but the
                consequent does not.
              </p>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
