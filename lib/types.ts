/**
 * Shared domain types for Northscope Booking Insights.
 * See CONTEXT.md for the canonical glossary.
 * Money: signed integer cents (positive = debit, negative = credit). See ADR-0001.
 */

// ---------------------------------------------------------------------------
// Raw data shapes (match what's in data/*.json)
// ---------------------------------------------------------------------------

export type TemplateName =
  | "vendorInvoiceWithVAT"
  | "vendorInvoiceNoVAT"
  | "vendorPayment"
  | "customerInvoice"
  | "customerPayment"
  | "rent"
  | "payroll"
  | "depreciation"
  | "itServicesV042"
  | "officeSupplies";

/** One side of an accounting event within a Document. */
export type JournalLine = {
  // Document-level (denormalized to line)
  document_id: string;
  company_code: "1000";
  posting_date: string; // ISO date "2026-03-15"
  template: TemplateName | null;

  // Line-level
  line_id: number; // 1, 2, 3… per document
  gl_account: string; // e.g. "6310"
  cost_center: string | null; // "ADMIN" | "SALES" | "IT" | "MARKETING" | "OPS" | null

  // Money — signed integer cents (positive = debit, negative = credit)
  amount_cents: number;
  currency: "EUR";
  debit_credit: "D" | "C";

  // Text & meta
  booking_text: string; // German free text
  vendor_id: string | null; // e.g. "V-042"
  customer_id: string | null; // e.g. "C-007"
  tax_code: string | null; // "V19" | "V07" | null
};

/** G/L Account from chart of accounts. */
export type Account = {
  code: string;
  name_de: string;
  type: "asset" | "liability" | "revenue" | "expense" | "equity";
  normal_balance: "D" | "C";
};

/** Vendor (supplier). */
export type Vendor = {
  id: string;
  name_de: string;
  default_template_kind: string;
};

/** Customer (buyer). */
export type Customer = {
  id: string;
  name_de: string;
};

/** Cost Center. */
export type CostCenter = {
  id: string;
  name_de: string;
};

// ---------------------------------------------------------------------------
// Derived / view types
// ---------------------------------------------------------------------------

/**
 * Per-Document rollup view.
 * Document Amount = sum of positive line amounts (total debits).
 */
export type DocumentView = {
  document_id: string;
  posting_date: string; // ISO date
  template: TemplateName | null;
  line_count: number;
  /** Sum of positive amount_cents (debit volume). */
  debit_cents: number;
  /** Vendor ID if all lines with a vendor_id agree on the same one; null otherwise. */
  vendor_id: string | null;
  /** Unique G/L accounts touched by this document. */
  accounts: string[];
  /** Unique tax codes present on this document's lines. */
  tax_codes: Array<string>; // non-null only
};

/** Denormalized line view — JournalLine with master-data lookups attached. */
export type LineView = JournalLine & {
  vendor_name_de: string | null;
  customer_name_de: string | null;
  account_name_de: string | null;
};

// ---------------------------------------------------------------------------
// Feature seam: Findings
// ---------------------------------------------------------------------------

/** Severity level for a finding. */
export type Severity = "high" | "medium" | "low";

/**
 * A single detected anomaly surfaced by a heuristic.
 * Features 1, 2, 3 (issues 04, 05, 06) will return Finding[].
 */
export type Finding = {
  id: string; // stable ID like "A1", "B2", or generated
  kind: "text-similarity" | "duplicate-document" | "rule-violation";
  severity: Severity;
  headline: string;
  detail: string;
  document_ids: string[];
  confidence: number; // 0–1
};
