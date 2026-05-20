/**
 * /documents — Document browse table
 *
 * Server component. Reads URL searchParams, applies filters server-side,
 * and passes filtered rows to the client DocumentsTable component.
 *
 * Filter params:
 *   dateFrom, dateTo  — ISO date strings (inclusive range on posting_date)
 *   vendor            — vendor_id string
 *   glAccount         — G/L account code
 *   amtMin, amtMax    — amount in EUR (converted to cents for comparison)
 *   text              — free-text search on booking_text (via lineViews)
 *   sort, dir         — column sort key + "asc" | "desc"
 */

import { documentViews, lineViews } from "@/lib/data/views";
import { vendors, customers, accounts, vendorById } from "@/lib/data/store";
import { DocumentsTable } from "@/components/documents/documents-table";
import type { DocumentRow } from "@/components/documents/documents-table";

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

function applyFilters(
  params: Record<string, string>
): DocumentRow[] {
  const dateFrom = params["dateFrom"] ?? "";
  const dateTo = params["dateTo"] ?? "";
  const vendorFilter = params["vendor"] ?? "";
  const glAccountFilter = params["glAccount"] ?? "";
  const amtMinEur = parseFloat(params["amtMin"] ?? "");
  const amtMaxEur = parseFloat(params["amtMax"] ?? "");
  const amtMinCents = isNaN(amtMinEur) ? null : Math.round(amtMinEur * 100);
  const amtMaxCents = isNaN(amtMaxEur) ? null : Math.round(amtMaxEur * 100);
  const textFilter = (params["text"] ?? "").trim().toLowerCase();

  // Build a set of document_ids that match the text filter (on booking_text of any line)
  let textMatchIds: Set<string> | null = null;
  if (textFilter) {
    textMatchIds = new Set<string>();
    for (const line of lineViews) {
      if (line.booking_text.toLowerCase().includes(textFilter)) {
        textMatchIds.add(line.document_id);
      }
    }
  }

  return documentViews
    .filter((doc) => {
      // Date range
      if (dateFrom && doc.posting_date < dateFrom) return false;
      if (dateTo && doc.posting_date > dateTo) return false;

      // Vendor filter
      if (vendorFilter && doc.vendor_id !== vendorFilter) return false;

      // G/L Account filter — document must touch that account
      if (glAccountFilter && !doc.accounts.includes(glAccountFilter)) return false;

      // Amount range
      if (amtMinCents !== null && doc.debit_cents < amtMinCents) return false;
      if (amtMaxCents !== null && doc.debit_cents > amtMaxCents) return false;

      // Text filter
      if (textMatchIds !== null && !textMatchIds.has(doc.document_id)) return false;

      return true;
    })
    .map((doc): DocumentRow => ({
      ...doc,
      vendor_name: doc.vendor_id ? (vendorById.get(doc.vendor_id)?.name_de ?? null) : null,
      customer_name: null, // DocumentView doesn't carry customer_id; resolved below if needed
    }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const rows = applyFilters(params);

  // Deduplicate accounts list for filter dropdown (all accounts from store)
  const allAccounts = accounts;
  const allVendors = vendors;

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky page header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/80 backdrop-blur-sm px-8 py-4">
        <div className="max-w-5xl">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Library
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-stone-900">
            Documents
          </h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-8 py-8">
        <div className="max-w-5xl">
          <DocumentsTable
            rows={rows}
            vendors={allVendors}
            customers={customers}
            accounts={allAccounts}
            searchParams={params}
          />
        </div>
      </main>
    </div>
  );
}
