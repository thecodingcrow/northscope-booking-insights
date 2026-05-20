/**
 * gen-clean.ts — Pass 1: Generate clean, balanced Documents
 *
 * Produces data/data.clean.json from master data + 10 transaction templates
 * over the window 2026-03-01 → 2026-04-30 (61 days).
 *
 * Run with: pnpm gen:clean  (or: tsx scripts/gen-clean.ts)
 *
 * Determinism: fixed seed via a simple LCG RNG. Seed = 42.
 * Money: signed integer cents (positive = debit, negative = credit).
 * Every Document's lines sum to exactly zero.
 *
 * Target: 140–170 documents, 400–500 lines
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JournalLine = {
  document_id: string;
  company_code: "1000";
  posting_date: string; // ISO date "2026-03-15"
  template: string | null;
  line_id: number;
  gl_account: string;
  cost_center: string | null;
  amount_cents: number;
  currency: "EUR";
  debit_credit: "D" | "C";
  booking_text: string;
  vendor_id: string | null;
  customer_id: string | null;
  tax_code: string | null;
};

// ---------------------------------------------------------------------------
// Seeded RNG (LCG — deterministic, no external dep)
// Seed: 42 (fixed value; documented here for reproducibility)
// Uses 32-bit unsigned integer arithmetic via >>> 0 (compatible with ES2017)
// ---------------------------------------------------------------------------

let rngState = 42;

function nextRng(): number {
  // LCG parameters from Numerical Recipes (mod 2^32 via >>> 0)
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 0x100000000;
}

/** Random integer in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return min + Math.floor(nextRng() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Document ID counter
// Starting at 1900000100 (SAP-style; leaves room for corrupt-pass inserts at 1900009xxx)
// ---------------------------------------------------------------------------

let docCounter = 100;

function nextDocId(): string {
  return `190000${String(docCounter++).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}


// ---------------------------------------------------------------------------
// VAT helpers
// ---------------------------------------------------------------------------

function vat19(netCents: number): number {
  return Math.round(netCents * 0.19);
}

function outVat19(netCents: number): number {
  return Math.round(netCents * 0.19);
}

// ---------------------------------------------------------------------------
// Template builders (each returns lines summing to zero)
// ---------------------------------------------------------------------------

function makeVendorInvoiceWithVAT(params: {
  doc_id: string; posting_date: string; vendor_id: string; gl_expense: string;
  net_cents: number; cost_center: string | null; booking_text: string; tax_code: string;
}): JournalLine[] {
  const vat = vat19(params.net_cents);
  const total = params.net_cents + vat;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "vendorInvoiceWithVAT", line_id: 1, gl_account: params.gl_expense, cost_center: params.cost_center, amount_cents: params.net_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: params.tax_code },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "vendorInvoiceWithVAT", line_id: 2, gl_account: "1576", cost_center: null, amount_cents: vat, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: params.tax_code },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "vendorInvoiceWithVAT", line_id: 3, gl_account: "1600", cost_center: null, amount_cents: -total, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
  ];
}

function makeVendorInvoiceNoVAT(params: {
  doc_id: string; posting_date: string; vendor_id: string; gl_expense: string;
  amount_cents: number; cost_center: string | null; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "vendorInvoiceNoVAT", line_id: 1, gl_account: params.gl_expense, cost_center: params.cost_center, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "vendorInvoiceNoVAT", line_id: 2, gl_account: "1600", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
  ];
}

function makeVendorPayment(params: {
  doc_id: string; posting_date: string; vendor_id: string; amount_cents: number; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "vendorPayment", line_id: 1, gl_account: "1600", cost_center: null, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "vendorPayment", line_id: 2, gl_account: "1800", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
  ];
}

function makeCustomerInvoice(params: {
  doc_id: string; posting_date: string; customer_id: string; gl_revenue: string;
  net_cents: number; cost_center: string | null; booking_text: string;
}): JournalLine[] {
  const vat = outVat19(params.net_cents);
  const total = params.net_cents + vat;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "customerInvoice", line_id: 1, gl_account: "1400", cost_center: null, amount_cents: total, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "customerInvoice", line_id: 2, gl_account: params.gl_revenue, cost_center: params.cost_center, amount_cents: -params.net_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "customerInvoice", line_id: 3, gl_account: "3806", cost_center: null, amount_cents: -vat, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: "V19" },
  ];
}

function makeCustomerPayment(params: {
  doc_id: string; posting_date: string; customer_id: string; amount_cents: number; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "customerPayment", line_id: 1, gl_account: "1800", cost_center: null, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "customerPayment", line_id: 2, gl_account: "1400", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: null },
  ];
}

function makeRent(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string; cost_center?: string;
}): JournalLine[] {
  const cc = params.cost_center ?? "ADMIN";
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "rent", line_id: 1, gl_account: "6310", cost_center: cc, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-001", customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "rent", line_id: 2, gl_account: "1800", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: "V-001", customer_id: null, tax_code: null },
  ];
}

function makePayroll(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string; cost_center: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "payroll", line_id: 1, gl_account: "6020", cost_center: params.cost_center, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "payroll", line_id: 2, gl_account: "1800", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
  ];
}

function makeDepreciation(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "depreciation", line_id: 1, gl_account: "6520", cost_center: null, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "depreciation", line_id: 2, gl_account: "0710", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
  ];
}

function makeItServicesV042(params: {
  doc_id: string; posting_date: string; net_cents: number; booking_text: string;
}): JournalLine[] {
  const vat = vat19(params.net_cents);
  const total = params.net_cents + vat;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "itServicesV042", line_id: 1, gl_account: "6815", cost_center: "IT", amount_cents: params.net_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-042", customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "itServicesV042", line_id: 2, gl_account: "1576", cost_center: null, amount_cents: vat, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-042", customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "itServicesV042", line_id: 3, gl_account: "1600", cost_center: null, amount_cents: -total, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: "V-042", customer_id: null, tax_code: null },
  ];
}

function makeOfficeSupplies(params: {
  doc_id: string; posting_date: string; vendor_id: string; net_cents: number;
  cost_center: string; booking_text: string;
}): JournalLine[] {
  const vat = vat19(params.net_cents);
  const total = params.net_cents + vat;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "officeSupplies", line_id: 1, gl_account: "6400", cost_center: params.cost_center, amount_cents: params.net_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "officeSupplies", line_id: 2, gl_account: "1576", cost_center: null, amount_cents: vat, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: "officeSupplies", line_id: 3, gl_account: "1600", cost_center: null, amount_cents: -total, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
  ];
}

// Noise templates (no template tag)
function makeLegalFees(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "6700", cost_center: "ADMIN", amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-035", customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "1600", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: "V-035", customer_id: null, tax_code: null },
  ];
}

function makeConferenceReg(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string; cost_center: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "6740", cost_center: params.cost_center, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-038", customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "1600", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: "V-038", customer_id: null, tax_code: null },
  ];
}

function makeTelecom(params: {
  doc_id: string; posting_date: string; net_cents: number; booking_text: string; cost_center: string;
}): JournalLine[] {
  const vat = vat19(params.net_cents);
  const total = params.net_cents + vat;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "6820", cost_center: params.cost_center, amount_cents: params.net_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-023", customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "1576", cost_center: null, amount_cents: vat, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-023", customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 3, gl_account: "1600", cost_center: null, amount_cents: -total, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: "V-023", customer_id: null, tax_code: null },
  ];
}

function makeInsurance(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "6600", cost_center: "ADMIN", amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: "V-061", customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "1800", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: "V-061", customer_id: null, tax_code: null },
  ];
}

// Petty cash disbursement — uses 1810 (Kasse) and 6030 (Löhne/minor wages)
function makePettyCash(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string; cost_center: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "6400", cost_center: params.cost_center, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "1810", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
  ];
}

// Social insurance contribution — 6110, paid via bank
function makeSocialInsurance(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "6110", cost_center: "ADMIN", amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "3000", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
  ];
}

// Reduced-VAT invoice (food/beverages at events) — uses 1577 and 3807
function makeReducedVatInvoice(params: {
  doc_id: string; posting_date: string; vendor_id: string; gl_expense: string;
  net_cents: number; cost_center: string; booking_text: string;
}): JournalLine[] {
  const vat7 = Math.round(params.net_cents * 0.07);
  const total = params.net_cents + vat7;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: params.gl_expense, cost_center: params.cost_center, amount_cents: params.net_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: "V07" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "1577", cost_center: null, amount_cents: vat7, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: "V07" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 3, gl_account: "1600", cost_center: null, amount_cents: -total, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
  ];
}

// Customer invoice with 7% VAT (for some categories)
function makeCustomerInvoiceReduced(params: {
  doc_id: string; posting_date: string; customer_id: string; gl_revenue: string;
  net_cents: number; cost_center: string | null; booking_text: string;
}): JournalLine[] {
  const vat7 = Math.round(params.net_cents * 0.07);
  const total = params.net_cents + vat7;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "1400", cost_center: null, amount_cents: total, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: params.gl_revenue, cost_center: params.cost_center, amount_cents: -params.net_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: "V07" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 3, gl_account: "3807", cost_center: null, amount_cents: -vat7, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: params.customer_id, tax_code: "V07" },
  ];
}

// Equity contribution / capital movement — 2900
function makeEquityMovement(params: {
  doc_id: string; posting_date: string; amount_cents: number; booking_text: string;
}): JournalLine[] {
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "1800", cost_center: null, amount_cents: params.amount_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "2900", cost_center: null, amount_cents: -params.amount_cents, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: null, customer_id: null, tax_code: null },
  ];
}

function makeMarketing(params: {
  doc_id: string; posting_date: string; net_cents: number; booking_text: string; vendor_id: string;
}): JournalLine[] {
  const vat = vat19(params.net_cents);
  const total = params.net_cents + vat;
  return [
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 1, gl_account: "6850", cost_center: "MARKETING", amount_cents: params.net_cents, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 2, gl_account: "1576", cost_center: null, amount_cents: vat, currency: "EUR", debit_credit: "D", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: "V19" },
    { document_id: params.doc_id, company_code: "1000", posting_date: params.posting_date, template: null, line_id: 3, gl_account: "1600", cost_center: null, amount_cents: -total, currency: "EUR", debit_credit: "C", booking_text: params.booking_text, vendor_id: params.vendor_id, customer_id: null, tax_code: null },
  ];
}

// ---------------------------------------------------------------------------
// Booking texts
// ---------------------------------------------------------------------------

const v042Texts = [
  "Cloud hosting Apr", "Cloud hosting März", "AWS Hosting März", "AWS Hosting Apr",
  "V&C Cloud Abonnement März", "V&C Cloud Abonnement Apr", "Cloudinfrastruktur März",
  "Cloudinfrastruktur Apr", "Server-Hosting V&C März", "Server-Hosting V&C Apr",
  "CDN-Dienste V&C März", "CDN-Dienste V&C Apr", "Datenspeicher Cloud März",
  "Datenspeicher Cloud Apr", "V&C Managed Services März", "V&C Managed Services Apr",
  "Backup-Dienste Cloud März", "Monitoring-Dienste V&C Apr",
];

const bueroTexts = [
  "Rechnung 4471", "Rechnung 4512", "Büromöbel Bürowelt", "Bürozubehör März",
  "Bürozubehör Apr", "Druckerpatronen Bürowelt", "Rechnung 4571", "Bürobedarf März",
  "Bürobedarf Apr", "Ordner und Ablage Bürowelt",
];

const staplesTexts = [
  "Büromaterial Staples", "Büromaterial Staples", "Büromaterial Staples",
  "Papier und Toner Staples", "Druckpapier Staples", "Tinte und Toner Staples",
];

const lyrecoTexts = [
  "Büromaterial Lyreco März", "Büromaterial Lyreco Apr", "Toner und Druckerzubehör",
  "Büroartikel Lyreco", "Papier Lyreco",
];

const microsoftTexts = [
  "Lizenzgebühr Microsoft 365 März", "Lizenzgebühr Microsoft 365 Apr",
  "Azure-Dienste März 2026", "Azure-Dienste Apr 2026", "Teams-Lizenz März",
  "Teams-Lizenz Apr",
];

const lufthansaTexts = [
  "Lufthansa Flug Berlin", "Lufthansa Flug München", "Lufthansa Flug Hamburg",
  "Lufthansa Flug Frankfurt", "Lufthansa Flug Wien",
];

const customerNames = [
  "Müller & Söhne", "Bayer AG", "Schäfer Logistik", "Hoffmann Consulting",
  "Braun Industrietechnik", "Werner & Koch", "Fischer Technologie", "Steinberg Handel",
];

const revAccounts = ["4120", "4200", "4400", "4600"];
const costCenterList = ["ADMIN", "IT", "SALES", "MARKETING", "OPS"];

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

const allLines: JournalLine[] = [];

// Track template instance doc IDs for gen-corrupt reference
const templateInstances: Record<string, string[]> = {
  vendorInvoiceWithVAT: [],
  vendorInvoiceNoVAT: [],
  vendorPayment: [],
  customerInvoice: [],
  customerPayment: [],
  rent: [],
  payroll: [],
  depreciation: [],
  itServicesV042: [],
  officeSupplies: [],
};

function push(lines: JournalLine[], template: string | null, docId: string) {
  allLines.push(...lines);
  if (template && template in templateInstances) {
    templateInstances[template].push(docId);
  }
}

// ---- RECURRING: rent (day 1 of each month) — exactly 2 instances ----
for (const month of [3, 4]) {
  const docId = nextDocId();
  const monthName = month === 3 ? "März" : "April";
  push(makeRent({ doc_id: docId, posting_date: isoDate(2026, month, 1), amount_cents: 350000, booking_text: `Miete ${monthName} 2026` }), "rent", docId);
}

// ---- RECURRING: payroll (last day of each month) — exactly 2 instances ----
for (const month of [3, 4]) {
  const docId = nextDocId();
  const lastDay = lastDayOfMonth(2026, month);
  const monthName = month === 3 ? "März" : "April";
  const cc = month === 3 ? "ADMIN" : "IT";
  push(makePayroll({ doc_id: docId, posting_date: isoDate(2026, month, lastDay), amount_cents: 12500000, booking_text: `Gehalt ${monthName} 2026`, cost_center: cc }), "payroll", docId);
}

// ---- RECURRING: depreciation (last day of each month) — exactly 2 instances ----
for (const month of [3, 4]) {
  const docId = nextDocId();
  const lastDay = lastDayOfMonth(2026, month);
  const monthName = month === 3 ? "März" : "April";
  push(makeDepreciation({ doc_id: docId, posting_date: isoDate(2026, month, lastDay), amount_cents: 125000, booking_text: `Abschreibung ${monthName} 2026` }), "depreciation", docId);
}

// ---- itServicesV042: exactly 18 instances ----
{
  // 9 in March, 9 in April
  const marchDays = [3, 5, 7, 10, 12, 14, 17, 19, 24];
  const aprilDays = [2, 4, 7, 9, 11, 14, 16, 21, 27];
  let idx = 0;
  for (const day of marchDays) {
    const docId = nextDocId();
    push(makeItServicesV042({ doc_id: docId, posting_date: isoDate(2026, 3, day), net_cents: randInt(50000, 250000), booking_text: v042Texts[idx % v042Texts.length] }), "itServicesV042", docId);
    idx++;
  }
  for (const day of aprilDays) {
    const docId = nextDocId();
    push(makeItServicesV042({ doc_id: docId, posting_date: isoDate(2026, 4, day), net_cents: randInt(50000, 250000), booking_text: v042Texts[idx % v042Texts.length] }), "itServicesV042", docId);
    idx++;
  }
}

// ---- officeSupplies: Staples (V-012) + Lyreco (V-074), 6 each = 12 total ----
{
  const staplesDays = [
    { m: 3, d: 8, cc: "ADMIN" }, { m: 3, d: 17, cc: "SALES" }, { m: 3, d: 26, cc: "IT" },
    { m: 4, d: 3, cc: "ADMIN" }, { m: 4, d: 14, cc: "MARKETING" }, { m: 4, d: 24, cc: "OPS" },
  ];
  for (let i = 0; i < staplesDays.length; i++) {
    const s = staplesDays[i];
    const docId = nextDocId();
    push(makeOfficeSupplies({ doc_id: docId, posting_date: isoDate(2026, s.m, s.d), vendor_id: "V-012", net_cents: randInt(5000, 30000), cost_center: s.cc, booking_text: staplesTexts[i % staplesTexts.length] }), "officeSupplies", docId);
  }
  const lyrecoDays = [
    { m: 3, d: 4, cc: "OPS" }, { m: 3, d: 13, cc: "MARKETING" }, { m: 3, d: 25, cc: "IT" },
    { m: 4, d: 7, cc: "ADMIN" }, { m: 4, d: 10, cc: "SALES" }, { m: 4, d: 22, cc: "OPS" },
  ];
  for (let i = 0; i < lyrecoDays.length; i++) {
    const s = lyrecoDays[i];
    const docId = nextDocId();
    push(makeOfficeSupplies({ doc_id: docId, posting_date: isoDate(2026, s.m, s.d), vendor_id: "V-074", net_cents: randInt(8000, 35000), cost_center: s.cc, booking_text: lyrecoTexts[i % lyrecoTexts.length] }), "officeSupplies", docId);
  }
}

// ---- customerInvoice: 8 customers × ~2 invoices each = 16 total ----
{
  const customers = ["C-001", "C-002", "C-003", "C-004", "C-005", "C-006", "C-007", "C-008"];
  const round1 = [
    { m: 3, d: 4 }, { m: 3, d: 6 }, { m: 3, d: 11 }, { m: 3, d: 18 },
    { m: 4, d: 1 }, { m: 4, d: 8 }, { m: 4, d: 15 }, { m: 4, d: 22 },
  ];
  const round2 = [
    { m: 3, d: 20 }, { m: 3, d: 25 }, { m: 4, d: 5 }, { m: 4, d: 12 },
    { m: 4, d: 18 }, { m: 4, d: 25 }, { m: 3, d: 28 }, { m: 4, d: 28 },
  ];
  for (let i = 0; i < 8; i++) {
    const docId = nextDocId();
    push(makeCustomerInvoice({
      doc_id: docId, posting_date: isoDate(2026, round1[i].m, round1[i].d),
      customer_id: customers[i], gl_revenue: revAccounts[i % 4],
      net_cents: randInt(100000, 800000), cost_center: costCenterList[i % 5],
      booking_text: `Rechnung ${customerNames[i]} ${round1[i].m === 3 ? "März" : "Apr"} 2026`,
    }), "customerInvoice", docId);
  }
  for (let i = 0; i < 8; i++) {
    const docId = nextDocId();
    push(makeCustomerInvoice({
      doc_id: docId, posting_date: isoDate(2026, round2[i].m, round2[i].d),
      customer_id: customers[i], gl_revenue: revAccounts[(i + 2) % 4],
      net_cents: randInt(80000, 500000), cost_center: costCenterList[(i + 2) % 5],
      booking_text: `Dienstleistung ${customerNames[i]} ${round2[i].m === 3 ? "März" : "Apr"}`,
    }), "customerInvoice", docId);
  }
}

// ---- customerPayment: 8 customers × 2 payments = 16 total ----
{
  const customers = ["C-001", "C-002", "C-003", "C-004", "C-005", "C-006", "C-007", "C-008"];
  const pay1 = [
    { m: 3, d: 14 }, { m: 3, d: 16 }, { m: 3, d: 21 }, { m: 3, d: 28 },
    { m: 4, d: 5 }, { m: 4, d: 12 }, { m: 4, d: 19 }, { m: 4, d: 26 },
  ];
  const pay2 = [
    { m: 4, d: 4 }, { m: 4, d: 7 }, { m: 4, d: 10 }, { m: 4, d: 16 },
    { m: 4, d: 20 }, { m: 4, d: 23 }, { m: 3, d: 24 }, { m: 3, d: 30 },
  ];
  for (let i = 0; i < 8; i++) {
    const docId = nextDocId();
    push(makeCustomerPayment({ doc_id: docId, posting_date: isoDate(2026, pay1[i].m, pay1[i].d), customer_id: customers[i], amount_cents: randInt(80000, 900000), booking_text: `Zahlungseingang ${customers[i]}` }), "customerPayment", docId);
  }
  for (let i = 0; i < 8; i++) {
    const docId = nextDocId();
    push(makeCustomerPayment({ doc_id: docId, posting_date: isoDate(2026, pay2[i].m, pay2[i].d), customer_id: customers[i], amount_cents: randInt(60000, 700000), booking_text: `Zahlung ${customerNames[i]}` }), "customerPayment", docId);
  }
}

// ---- vendorInvoiceWithVAT: Bürowelt (V-007) × 10, Microsoft (V-061) × 6, DATEV (V-031) × 4 ----
{
  // Bürowelt
  const bwDays = [
    { m: 3, d: 2 }, { m: 3, d: 9 }, { m: 3, d: 15 }, { m: 3, d: 20 }, { m: 3, d: 27 },
    { m: 4, d: 2 }, { m: 4, d: 6 }, { m: 4, d: 13 }, { m: 4, d: 20 }, { m: 4, d: 27 },
  ];
  for (let i = 0; i < bwDays.length; i++) {
    const docId = nextDocId();
    push(makeVendorInvoiceWithVAT({
      doc_id: docId, posting_date: isoDate(2026, bwDays[i].m, bwDays[i].d),
      vendor_id: "V-007", gl_expense: "6400", net_cents: randInt(20000, 80000),
      cost_center: "ADMIN", booking_text: bueroTexts[i % bueroTexts.length], tax_code: "V19",
    }), "vendorInvoiceWithVAT", docId);
  }

  // Microsoft
  const msDays = [
    { m: 3, d: 5 }, { m: 3, d: 22 }, { m: 4, d: 5 }, { m: 4, d: 22 },
    { m: 3, d: 14 }, { m: 4, d: 14 },
  ];
  for (let i = 0; i < msDays.length; i++) {
    const docId = nextDocId();
    push(makeVendorInvoiceWithVAT({
      doc_id: docId, posting_date: isoDate(2026, msDays[i].m, msDays[i].d),
      vendor_id: "V-061", gl_expense: "6815", net_cents: randInt(15000, 90000),
      cost_center: "IT", booking_text: microsoftTexts[i % microsoftTexts.length], tax_code: "V19",
    }), "vendorInvoiceWithVAT", docId);
  }

  // DATEV
  const datevDays = [{ m: 3, d: 3 }, { m: 3, d: 17 }, { m: 4, d: 3 }, { m: 4, d: 17 }];
  for (let i = 0; i < datevDays.length; i++) {
    const docId = nextDocId();
    push(makeVendorInvoiceWithVAT({
      doc_id: docId, posting_date: isoDate(2026, datevDays[i].m, datevDays[i].d),
      vendor_id: "V-031", gl_expense: "6815", net_cents: randInt(30000, 120000),
      cost_center: "IT", booking_text: `DATEV Buchführungssoftware ${datevDays[i].m === 3 ? "März" : "Apr"} 2026`, tax_code: "V19",
    }), "vendorInvoiceWithVAT", docId);
  }
}

// ---- vendorInvoiceNoVAT: Lufthansa (V-018) × 5, Wolff & Partner (V-035) × 4, Messe München (V-038) × 3 ----
{
  const luftDays = [
    { m: 3, d: 6 }, { m: 3, d: 19 }, { m: 4, d: 8 }, { m: 4, d: 16 }, { m: 4, d: 25 },
  ];
  for (let i = 0; i < luftDays.length; i++) {
    const docId = nextDocId();
    push(makeVendorInvoiceNoVAT({
      doc_id: docId, posting_date: isoDate(2026, luftDays[i].m, luftDays[i].d),
      vendor_id: "V-018", gl_expense: "6800", amount_cents: randInt(30000, 120000),
      cost_center: "SALES", booking_text: lufthansaTexts[i % lufthansaTexts.length],
    }), "vendorInvoiceNoVAT", docId);
  }

  const wolffDays = [{ m: 3, d: 9 }, { m: 3, d: 23 }, { m: 4, d: 14 }, { m: 4, d: 29 }];
  const wolffTexts = ["Rechtsberatung März 2026", "Vertragsrecht Beratung", "Rechtsberatung Apr 2026", "Gesellschaftsrecht Apr"];
  for (let i = 0; i < wolffDays.length; i++) {
    const docId = nextDocId();
    push(makeVendorInvoiceNoVAT({
      doc_id: docId, posting_date: isoDate(2026, wolffDays[i].m, wolffDays[i].d),
      vendor_id: "V-035", gl_expense: "6700", amount_cents: randInt(100000, 300000),
      cost_center: "ADMIN", booking_text: wolffTexts[i],
    }), "vendorInvoiceNoVAT", docId);
  }

  const messeDays = [{ m: 3, d: 12 }, { m: 4, d: 4 }, { m: 4, d: 21 }];
  const messeTexts = ["Messegebühr Hannover Messe", "Konferenzgebühr April", "Ausstellungsgebühr Apr 2026"];
  for (let i = 0; i < messeDays.length; i++) {
    const docId = nextDocId();
    push(makeVendorInvoiceNoVAT({
      doc_id: docId, posting_date: isoDate(2026, messeDays[i].m, messeDays[i].d),
      vendor_id: "V-038", gl_expense: "6740", amount_cents: randInt(40000, 200000),
      cost_center: "SALES", booking_text: messeTexts[i],
    }), "vendorInvoiceNoVAT", docId);
  }
}

// ---- vendorPayment: for the main vendors ----
{
  const payments = [
    // V-007 Bürowelt — 4 payments
    { v: "V-007", t: "Zahlung Bürowelt GmbH März", m: 3, d: 20 },
    { v: "V-007", t: "Zahlung Bürowelt GmbH Apr", m: 4, d: 23 },
    { v: "V-007", t: "Zahlung Bürowelt GmbH II März", m: 3, d: 29 },
    { v: "V-007", t: "Zahlung Bürowelt Apr II", m: 4, d: 28 },
    // V-042 V&C Cloud — 4 payments
    { v: "V-042", t: "Zahlung V&C Cloud GmbH März", m: 3, d: 22 },
    { v: "V-042", t: "Zahlung V&C Cloud GmbH Apr", m: 4, d: 25 },
    { v: "V-042", t: "Zahlung V&C Cloud GmbH II März", m: 3, d: 28 },
    { v: "V-042", t: "Zahlung V&C Cloud Apr II", m: 4, d: 29 },
    // V-018 Lufthansa — 2 payments
    { v: "V-018", t: "Zahlung Lufthansa AG März", m: 3, d: 12 },
    { v: "V-018", t: "Zahlung Lufthansa AG Apr", m: 4, d: 18 },
    // V-061 Microsoft — 2 payments
    { v: "V-061", t: "Zahlung Microsoft Deutschland März", m: 3, d: 28 },
    { v: "V-061", t: "Zahlung Microsoft Deutschland Apr", m: 4, d: 28 },
    // V-012 Staples — 2 payments
    { v: "V-012", t: "Zahlung Staples Deutschland März", m: 3, d: 24 },
    { v: "V-012", t: "Zahlung Staples Apr", m: 4, d: 21 },
    // V-031 DATEV — 2 payments
    { v: "V-031", t: "Zahlung DATEV eG März", m: 3, d: 25 },
    { v: "V-031", t: "Zahlung DATEV eG Apr", m: 4, d: 24 },
  ];
  for (const p of payments) {
    const docId = nextDocId();
    push(makeVendorPayment({ doc_id: docId, posting_date: isoDate(2026, p.m, p.d), vendor_id: p.v, amount_cents: randInt(30000, 400000), booking_text: p.t }), "vendorPayment", docId);
  }
}

// ---- Noise documents ----
{
  // Legal fees — 5 instances
  const legalData = [
    { m: 3, d: 16, t: "Anwaltshonorar März 2026" }, { m: 4, d: 7, t: "Rechtsberatung Vertragsrecht Apr" },
    { m: 4, d: 28, t: "Anwaltshonorar Apr 2026" }, { m: 3, d: 24, t: "Markenrecht Beratung März" },
    { m: 4, d: 17, t: "Arbeitsrecht Beratung Apr" },
  ];
  for (const l of legalData) {
    const docId = nextDocId();
    push(makeLegalFees({ doc_id: docId, posting_date: isoDate(2026, l.m, l.d), amount_cents: randInt(50000, 250000), booking_text: l.t }), null, docId);
  }

  // Conference registrations — 4 instances
  const confData = [
    { m: 3, d: 22, t: "Konferenzanmeldung SAP Summit 2026", cc: "IT" },
    { m: 4, d: 15, t: "Fortbildung Buchhaltung Apr 2026", cc: "ADMIN" },
    { m: 3, d: 7, t: "Seminar Steuerrecht 2026", cc: "ADMIN" },
    { m: 4, d: 9, t: "IT-Kongress Apr 2026 Anmeldung", cc: "IT" },
  ];
  for (const c of confData) {
    const docId = nextDocId();
    push(makeConferenceReg({ doc_id: docId, posting_date: isoDate(2026, c.m, c.d), amount_cents: randInt(30000, 120000), booking_text: c.t, cost_center: c.cc }), null, docId);
  }

  // Telecom (Deutsche Telekom) — 4 instances
  const telecomData = [
    { m: 3, d: 5, t: "Telekommunikation März 2026", cc: "OPS" },
    { m: 4, d: 5, t: "Telekommunikation Apr 2026", cc: "OPS" },
    { m: 3, d: 20, t: "Mobilfunk März 2026", cc: "SALES" },
    { m: 4, d: 20, t: "Mobilfunk Apr 2026", cc: "IT" },
  ];
  for (const t of telecomData) {
    const docId = nextDocId();
    push(makeTelecom({ doc_id: docId, posting_date: isoDate(2026, t.m, t.d), net_cents: randInt(25000, 60000), booking_text: t.t, cost_center: t.cc }), null, docId);
  }

  // Insurance — 2 instances
  const insData = [
    { m: 3, d: 31, t: "Versicherungsprämie Q1 2026" },
    { m: 4, d: 30, t: "Versicherungsprämie Q2 2026" },
  ];
  for (const i of insData) {
    const docId = nextDocId();
    push(makeInsurance({ doc_id: docId, posting_date: isoDate(2026, i.m, i.d), amount_cents: 85000, booking_text: i.t }), null, docId);
  }

  // Petty cash — 3 instances (uses 1810 Kasse)
  const pettyData = [
    { m: 3, d: 11, t: "Kleingeld Bürobedarf", cc: "OPS" },
    { m: 4, d: 6, t: "Barkauf Reinigungsmittel", cc: "OPS" },
    { m: 3, d: 29, t: "Barkauf Kaffeemittel Büro", cc: "ADMIN" },
  ];
  for (const p of pettyData) {
    const docId = nextDocId();
    push(makePettyCash({ doc_id: docId, posting_date: isoDate(2026, p.m, p.d), amount_cents: randInt(1500, 8000), booking_text: p.t, cost_center: p.cc }), null, docId);
  }

  // Social insurance — 2 instances (uses 6110, 3000)
  const socialData = [
    { m: 3, d: 31, t: "Sozialversicherungsbeiträge März 2026" },
    { m: 4, d: 30, t: "Sozialversicherungsbeiträge Apr 2026" },
  ];
  for (const s of socialData) {
    const docId = nextDocId();
    push(makeSocialInsurance({ doc_id: docId, posting_date: isoDate(2026, s.m, s.d), amount_cents: randInt(400000, 600000), booking_text: s.t }), null, docId);
  }

  // Reduced VAT invoices (7%) — 3 instances (uses 1577)
  const redVatData = [
    { m: 3, d: 8, t: "Cateringservice Konferenz März", v: "V-038", cc: "ADMIN" },
    { m: 4, d: 11, t: "Verpflegung Team-Event Apr", v: "V-038", cc: "SALES" },
    { m: 3, d: 25, t: "Pausenverpflegung Seminar", v: "V-038", cc: "IT" },
  ];
  for (const r of redVatData) {
    const docId = nextDocId();
    push(makeReducedVatInvoice({ doc_id: docId, posting_date: isoDate(2026, r.m, r.d), vendor_id: r.v, gl_expense: "6740", net_cents: randInt(8000, 30000), cost_center: r.cc, booking_text: r.t }), null, docId);
  }

  // Customer invoice with 7% VAT — 2 instances (uses 3807)
  const custRedVat = [
    { m: 3, d: 17, t: "Schulungsmaterial 7% MwSt März", cid: "C-005" },
    { m: 4, d: 19, t: "Trainingsunterlagen 7% MwSt Apr", cid: "C-007" },
  ];
  for (const c of custRedVat) {
    const docId = nextDocId();
    push(makeCustomerInvoiceReduced({ doc_id: docId, posting_date: isoDate(2026, c.m, c.d), customer_id: c.cid, gl_revenue: "4600", net_cents: randInt(30000, 100000), cost_center: "SALES", booking_text: c.t }), null, docId);
  }

  // Equity / capital movement — 1 instance (uses 2900)
  {
    const docId = nextDocId();
    push(makeEquityMovement({ doc_id: docId, posting_date: isoDate(2026, 3, 31), amount_cents: 5000000, booking_text: "Kapitaleinlage Gesellschafter März 2026" }), null, docId);
  }

  // Marketing (V-055 Amazon) — 5 instances
  const mktgData = [
    { m: 3, d: 10, t: "Online-Marketing März 2026", v: "V-055" },
    { m: 4, d: 12, t: "Online-Marketing Apr 2026", v: "V-055" },
    { m: 3, d: 24, t: "Social-Media-Werbung März", v: "V-055" },
    { m: 4, d: 8, t: "Display-Werbung Apr 2026", v: "V-055" },
    { m: 3, d: 18, t: "Suchmaschinenmarketing März", v: "V-055" },
  ];
  for (const m of mktgData) {
    const docId = nextDocId();
    push(makeMarketing({ doc_id: docId, posting_date: isoDate(2026, m.m, m.d), net_cents: randInt(50000, 200000), booking_text: m.t, vendor_id: m.v }), null, docId);
  }

  // Additional Bürowelt invoices to bring line count into range (3 lines each)
  const extraBw = [
    { m: 3, d: 8, t: "Schreibwaren Bürowelt März" }, { m: 3, d: 16, t: "Verbrauchsmaterial Bürowelt" },
    { m: 3, d: 23, t: "Druckerzubehör Bürowelt März" }, { m: 4, d: 9, t: "Schreibwaren Bürowelt Apr" },
    { m: 4, d: 16, t: "Verbrauchsmaterial Bürowelt Apr" }, { m: 4, d: 24, t: "Büromaterial Bürowelt Apr" },
  ];
  for (const e of extraBw) {
    const docId = nextDocId();
    push(makeVendorInvoiceWithVAT({
      doc_id: docId, posting_date: isoDate(2026, e.m, e.d),
      vendor_id: "V-007", gl_expense: "6400", net_cents: randInt(15000, 60000),
      cost_center: "ADMIN", booking_text: e.t, tax_code: "V19",
    }), "vendorInvoiceWithVAT", docId);
  }

  // Additional customer invoices (3 lines each)
  const extraCustomers = ["C-001", "C-004", "C-006", "C-007", "C-002", "C-003", "C-008"];
  const extraCustData = [
    { m: 3, d: 13, t: "Projektphase 3 Müller & Söhne" }, { m: 4, d: 3, t: "Folgerechnung Hoffmann Apr" },
    { m: 3, d: 26, t: "Beratungsleistung Werner Apr" }, { m: 4, d: 24, t: "Projektabschluss Fischer Apr" },
    { m: 3, d: 19, t: "Softwareanpassung Bayer März" }, { m: 4, d: 11, t: "Logistik Schäfer Apr" },
    { m: 4, d: 29, t: "Handel Steinberg Apr" },
  ];
  for (let i = 0; i < extraCustData.length; i++) {
    const docId = nextDocId();
    push(makeCustomerInvoice({
      doc_id: docId, posting_date: isoDate(2026, extraCustData[i].m, extraCustData[i].d),
      customer_id: extraCustomers[i], gl_revenue: revAccounts[i % 4],
      net_cents: randInt(100000, 500000), cost_center: costCenterList[i % 5],
      booking_text: extraCustData[i].t,
    }), "customerInvoice", docId);
  }

  // More DATEV invoices (3 lines each)
  const datev2 = [
    { m: 3, d: 31, t: "DATEV Lohn März 2026" }, { m: 4, d: 30, t: "DATEV Lohn Apr 2026" },
    { m: 3, d: 10, t: "DATEV Steuerberatung März" }, { m: 4, d: 10, t: "DATEV Steuerberatung Apr" },
  ];
  for (const d of datev2) {
    const docId = nextDocId();
    push(makeVendorInvoiceWithVAT({
      doc_id: docId, posting_date: isoDate(2026, d.m, d.d),
      vendor_id: "V-031", gl_expense: "6815", net_cents: randInt(20000, 80000),
      cost_center: "ADMIN", booking_text: d.t, tax_code: "V19",
    }), "vendorInvoiceWithVAT", docId);
  }
}

// ---------------------------------------------------------------------------
// Verify balance
// ---------------------------------------------------------------------------

function groupByDoc(lines: JournalLine[]): Map<string, JournalLine[]> {
  const m = new Map<string, JournalLine[]>();
  for (const l of lines) {
    const ex = m.get(l.document_id);
    if (ex) ex.push(l); else m.set(l.document_id, [l]);
  }
  return m;
}

const byDoc = groupByDoc(allLines);
const docCount = byDoc.size;
const lineCount = allLines.length;

console.log(`Generated ${docCount} documents, ${lineCount} lines`);
console.log(`Template instance counts:`);
for (const [tmpl, ids] of Object.entries(templateInstances)) {
  console.log(`  ${tmpl}: ${ids.length}`);
}

let unbalanced = 0;
for (const [docId, docLines] of byDoc) {
  const sum = docLines.reduce((s, l) => s + l.amount_cents, 0);
  if (sum !== 0) {
    console.error(`UNBALANCED: ${docId} sum=${sum}`);
    unbalanced++;
  }
}
if (unbalanced > 0) {
  console.error(`${unbalanced} unbalanced document(s) — generator bug!`);
  process.exit(1);
}

if (docCount < 140 || docCount > 170) {
  console.warn(`WARNING: Document count ${docCount} is outside target [140, 170]`);
}
if (lineCount < 400 || lineCount > 500) {
  console.warn(`WARNING: Line count ${lineCount} is outside target [400, 500]`);
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = path.join(process.cwd(), "data", "data.clean.json");
fs.writeFileSync(outPath, JSON.stringify(allLines, null, 2));
console.log(`Written ${outPath}`);

const manifestPath = path.join(process.cwd(), "data", "template-manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(templateInstances, null, 2));
console.log(`Written ${manifestPath}`);
