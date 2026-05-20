/**
 * Derived views over the in-memory store.
 *
 * Two views are exported:
 *   - `documentViews`  — per-Document rollup (debit volume, vendor, accounts, etc.)
 *   - `lineViews`      — denormalized lines (master-data lookups attached)
 *
 * These are computed once at module load (same singleton semantics as store.ts).
 * See spec §6 and issue 02 acceptance criteria.
 */

import { lines, accountByCode, vendorById, customerById } from "@/lib/data/store";
import type { DocumentView, LineView, JournalLine, TemplateName } from "@/lib/types";

// ---------------------------------------------------------------------------
// DocumentView — per-doc rollup
// ---------------------------------------------------------------------------

function buildDocumentViews(): DocumentView[] {
  // Group lines by document_id
  const byDoc = new Map<string, JournalLine[]>();
  for (const line of lines) {
    const bucket = byDoc.get(line.document_id);
    if (bucket) {
      bucket.push(line);
    } else {
      byDoc.set(line.document_id, [line]);
    }
  }

  const views: DocumentView[] = [];

  for (const [document_id, docLines] of byDoc) {
    const first = docLines[0];

    // Debit volume = sum of positive amount_cents
    const debit_cents = docLines.reduce(
      (sum, l) => (l.amount_cents > 0 ? sum + l.amount_cents : sum),
      0
    );

    // Vendor: uniform across lines that have a vendor_id
    const vendorIds = [...new Set(docLines.map((l) => l.vendor_id).filter(Boolean))];
    const vendor_id = vendorIds.length === 1 ? (vendorIds[0] as string) : null;

    // Unique G/L accounts
    const accounts = [...new Set(docLines.map((l) => l.gl_account))];

    // Unique non-null tax codes
    const tax_codes = [
      ...new Set(docLines.map((l) => l.tax_code).filter((t): t is string => t !== null)),
    ];

    views.push({
      document_id,
      posting_date: first.posting_date,
      template: first.template as TemplateName | null,
      line_count: docLines.length,
      debit_cents,
      vendor_id,
      accounts,
      tax_codes,
    });
  }

  // Sort by posting_date ascending, then document_id ascending
  views.sort((a, b) => {
    const dateCmp = a.posting_date.localeCompare(b.posting_date);
    return dateCmp !== 0 ? dateCmp : a.document_id.localeCompare(b.document_id);
  });

  return views;
}

// ---------------------------------------------------------------------------
// LineView — denormalized lines with master-data lookups
// ---------------------------------------------------------------------------

function buildLineViews(): LineView[] {
  return lines.map((line) => ({
    ...line,
    vendor_name_de: line.vendor_id ? (vendorById.get(line.vendor_id)?.name_de ?? null) : null,
    customer_name_de: line.customer_id
      ? (customerById.get(line.customer_id)?.name_de ?? null)
      : null,
    account_name_de: accountByCode.get(line.gl_account)?.name_de ?? null,
  }));
}

// Module-level singletons (computed once on first import)
export const documentViews: DocumentView[] = buildDocumentViews();
export const lineViews: LineView[] = buildLineViews();
