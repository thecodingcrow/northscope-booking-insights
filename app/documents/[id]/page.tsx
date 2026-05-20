/**
 * /documents/[id] — Document detail page
 *
 * Server component. Looks up a Document by ID from documentViews and lineViews.
 * Returns 404 if the ID doesn't exist.
 *
 * Sections:
 *   1. Header card — Document ID, posting date, amount, vendor/customer, template
 *   2. Lines table — all Lines for this document
 *   3. Flags seam — placeholder for Phase 3b features (04/05/06)
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { documentViews, lineViews } from "@/lib/data/views";
import { vendorById, customerById, accountByCode, lines } from "@/lib/data/store";
import { formatEUR } from "@/lib/format/money";
import { formatDate } from "@/lib/format/dates";
import { Badge } from "@/components/ui/badge";
import type { Finding } from "@/lib/types";
import { findTextSimilarities } from "@/lib/heuristics/text-similarity";
import { findDuplicateDocuments } from "@/lib/heuristics/duplicate-docs";
import { mineRules } from "@/lib/heuristics/rule-mining";

// ---------------------------------------------------------------------------
// Heuristic results — computed once per server boot (module cache)
// ---------------------------------------------------------------------------

const textClusters = findTextSimilarities(lines);
const duplicateClusters = findDuplicateDocuments(documentViews, lineViews);
const rules = mineRules(documentViews, lineViews);

function getDocumentFlags(documentId: string): Finding[] {
  const flags: Finding[] = [];

  for (const c of textClusters) {
    if (c.members.some((m) => m.document_id === documentId)) {
      flags.push({
        id: c.id,
        kind: "text-similarity",
        severity: c.severity,
        headline: `Near-duplicate booking text (${c.members.length} variants)`,
        detail: c.explanation,
        document_ids: c.members.map((m) => m.document_id),
        confidence: 1 - c.representative_distance / 10,
      });
    }
  }

  for (const c of duplicateClusters) {
    if (c.members.some((m) => m.doc_id === documentId)) {
      const sev: Finding["severity"] =
        c.confidence >= 0.9 ? "high" : c.confidence >= 0.8 ? "medium" : "low";
      flags.push({
        id: c.id,
        kind: "duplicate-document",
        severity: sev,
        headline: `Possible duplicate Document (${(c.confidence * 100).toFixed(0)}% confidence)`,
        detail: `Cluster of ${c.members.length} Documents with matching vendor/amount/text/accounts`,
        document_ids: c.members.map((m) => m.doc_id),
        confidence: c.confidence,
      });
    }
  }

  for (const r of rules) {
    if (r.violations.includes(documentId)) {
      flags.push({
        id: r.id,
        kind: "rule-violation",
        severity: "medium",
        headline: `Rule violation: ${r.description}`,
        detail: `Support ${r.support} · Confidence ${(r.confidence * 100).toFixed(0)}%`,
        document_ids: [documentId],
        confidence: r.confidence,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const doc = documentViews.find((d) => d.document_id === id);
  if (!doc) notFound();

  const docLines = lineViews.filter((l) => l.document_id === id);
  const flags = getDocumentFlags(id);

  // Resolve vendor or customer name
  const vendorName = doc.vendor_id ? (vendorById.get(doc.vendor_id)?.name_de ?? null) : null;
  // Attempt to resolve customer from any line that has a customer_id
  const customerLine = docLines.find((l) => l.customer_id);
  const customerName = customerLine?.customer_id
    ? (customerById.get(customerLine.customer_id)?.name_de ?? null)
    : null;

  const counterpartyName = vendorName ?? customerName;

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Link
              href="/documents"
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400 hover:text-stone-600 transition-colors"
            >
              <ChevronLeft className="h-3 w-3" />
              Documents
            </Link>
          </div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900 font-mono">
            {doc.document_id}
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-8 py-8">
        <div className="space-y-6">

          {/* Header card */}
          <div className="rounded-lg border border-stone-200 bg-white p-6">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">

              {/* Document ID */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                  Document ID
                </p>
                <p className="font-mono text-[15px] font-medium text-stone-900">
                  {doc.document_id}
                </p>
              </div>

              {/* Posting date */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                  Posting date
                </p>
                <p className="text-[15px] font-medium text-stone-900">
                  {formatDate(doc.posting_date)}
                </p>
              </div>

              {/* Document Amount */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                  Document Amount
                </p>
                <p className="font-mono text-[15px] font-semibold text-stone-900">
                  {formatEUR(doc.debit_cents)}
                </p>
              </div>

              {/* Lines */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                  Lines
                </p>
                <p className="text-[15px] font-medium text-stone-900">
                  {doc.line_count}
                </p>
              </div>

              {/* Vendor / Customer */}
              {counterpartyName && (
                <div className="col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                    {vendorName ? "Vendor" : "Customer"}
                  </p>
                  <p className="text-[15px] font-medium text-stone-900">
                    {counterpartyName}
                  </p>
                  {doc.vendor_id && (
                    <p className="text-[11px] font-mono text-stone-400 mt-0.5">{doc.vendor_id}</p>
                  )}
                </div>
              )}

              {/* Template */}
              {doc.template && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                    Template
                  </p>
                  <Badge variant="secondary" className="text-[11px]">
                    {doc.template}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Lines table */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-3">
              Lines
            </h2>
            <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">#</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">G/L Account</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">Cost Center</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">D/C</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-stone-400">Amount</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">Booking text</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400">Tax code</th>
                  </tr>
                </thead>
                <tbody>
                  {docLines.map((line, idx) => {
                    const account = accountByCode.get(line.gl_account);
                    const accountLabel = account
                      ? `${line.gl_account} — ${account.name_de}`
                      : line.gl_account;
                    const isDebit = line.debit_credit === "D";
                    const absCents = Math.abs(line.amount_cents);

                    return (
                      <tr
                        key={`${line.document_id}-${line.line_id}`}
                        className={`border-b border-stone-50 ${idx % 2 !== 0 ? "bg-stone-50/30" : ""}`}
                      >
                        {/* Line ID */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-[12px] text-stone-400">{line.line_id}</span>
                        </td>

                        {/* G/L Account */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-stone-700">{accountLabel}</span>
                        </td>

                        {/* Cost Center */}
                        <td className="px-4 py-3">
                          {line.cost_center ? (
                            <Badge variant="secondary" className="text-[11px]">
                              {line.cost_center}
                            </Badge>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>

                        {/* Debit / Credit badge */}
                        <td className="px-4 py-3">
                          <Badge
                            className={
                              isDebit
                                ? "border-transparent bg-rose-100 text-rose-700 text-[11px]"
                                : "border-transparent bg-sky-100 text-sky-700 text-[11px]"
                            }
                          >
                            {line.debit_credit}
                          </Badge>
                        </td>

                        {/* Amount — positive, German locale, Geist Mono */}
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-[13px] text-stone-900">
                            {formatEUR(absCents)}
                          </span>
                        </td>

                        {/* Booking text */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-stone-600 max-w-[220px] block truncate" title={line.booking_text}>
                            {line.booking_text}
                          </span>
                        </td>

                        {/* Tax code */}
                        <td className="px-4 py-3">
                          {line.tax_code ? (
                            <span className="font-mono text-[12px] text-stone-500">{line.tax_code}</span>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Flags seam — placeholder for Phase 3b (Issues 04/05/06) */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-3">
              Flags on this Document
            </h2>
            <div className="rounded-lg border border-dashed border-stone-200 bg-white px-6 py-8">
              {flags.length === 0 ? (
                <p className="text-center text-[13px] text-stone-400">
                  No flags from any feature yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {flags.map((flag) => (
                    <li key={flag.id} className="flex items-start gap-3 text-sm text-stone-700">
                      <Badge
                        variant={
                          flag.severity === "high"
                            ? "high"
                            : flag.severity === "medium"
                              ? "medium"
                              : "low"
                        }
                      >
                        {flag.severity}
                      </Badge>
                      <div>
                        <p className="font-medium">{flag.headline}</p>
                        <p className="text-stone-500">{flag.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
