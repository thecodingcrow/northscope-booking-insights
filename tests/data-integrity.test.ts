/**
 * Data integrity assertions for the generated data.json.
 *
 * This test file is part of Issue 01 — Anomaly Catalog + data generator.
 * It asserts structural correctness of the corrupted dataset:
 *   - Every Document's Lines sum to zero (balanced)
 *   - Document count is within [140, 170]
 *   - Line count is within [400, 500]
 *   - Posting dates are all within 2026-03-01 – 2026-04-30 inclusive
 *   - All amounts are signed integers (no floats)
 *   - All 12 vendors, 8 customers, 5 cost centers appear at least once
 *   - ~30 distinct G/L Accounts referenced (≥ 25 to be safe)
 */

import { describe, it, expect } from "vitest";
import dataRaw from "../data/data.json";
import vendorsRaw from "../data/vendors.json";
import customersRaw from "../data/customers.json";
import costCentersRaw from "../data/cost-centers.json";

type JournalLine = {
  document_id: string;
  company_code: "1000";
  posting_date: string;
  template?: string | null;
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

const lines = dataRaw as JournalLine[];

// Group lines by document_id
function groupByDocument(lines: JournalLine[]): Map<string, JournalLine[]> {
  const map = new Map<string, JournalLine[]>();
  for (const line of lines) {
    const existing = map.get(line.document_id);
    if (existing) {
      existing.push(line);
    } else {
      map.set(line.document_id, [line]);
    }
  }
  return map;
}

const byDocument = groupByDocument(lines);

describe("data.json integrity", () => {
  it("every document has lines summing to zero (balanced)", () => {
    const unbalanced: string[] = [];
    for (const [docId, docLines] of byDocument) {
      const sum = docLines.reduce((acc, l) => acc + l.amount_cents, 0);
      if (sum !== 0) {
        unbalanced.push(`${docId}: sum=${sum}`);
      }
    }
    expect(unbalanced, `Unbalanced documents: ${unbalanced.join(", ")}`).toEqual([]);
  });

  it("document count is within [140, 170]", () => {
    const count = byDocument.size;
    expect(count).toBeGreaterThanOrEqual(140);
    expect(count).toBeLessThanOrEqual(170);
  });

  it("line count is within [400, 500]", () => {
    expect(lines.length).toBeGreaterThanOrEqual(400);
    expect(lines.length).toBeLessThanOrEqual(500);
  });

  it("all posting dates are within 2026-03-01 to 2026-04-30 inclusive", () => {
    const outOfRange: string[] = [];
    for (const line of lines) {
      const date = line.posting_date;
      if (date < "2026-03-01" || date > "2026-04-30") {
        outOfRange.push(`${line.document_id}:${line.line_id} → ${date}`);
      }
    }
    expect(outOfRange, `Out-of-range dates: ${outOfRange.slice(0, 5).join(", ")}`).toEqual([]);
  });

  it("all amount_cents are integers (no floats)", () => {
    const nonInt: string[] = [];
    for (const line of lines) {
      if (!Number.isInteger(line.amount_cents)) {
        nonInt.push(`${line.document_id}:${line.line_id} → ${line.amount_cents}`);
      }
    }
    expect(nonInt, `Non-integer amounts: ${nonInt.slice(0, 5).join(", ")}`).toEqual([]);
  });

  it("debit_credit matches sign of amount_cents", () => {
    const mismatches: string[] = [];
    for (const line of lines) {
      const shouldBeDebit = line.amount_cents > 0;
      const isDebit = line.debit_credit === "D";
      if (shouldBeDebit !== isDebit) {
        mismatches.push(`${line.document_id}:${line.line_id} dc=${line.debit_credit} cents=${line.amount_cents}`);
      }
    }
    expect(mismatches, `D/C mismatches: ${mismatches.slice(0, 5).join(", ")}`).toEqual([]);
  });

  it("all vendor_ids referenced in lines appear in vendors.json", () => {
    const vendorIds = new Set((vendorsRaw as { id: string }[]).map((v) => v.id));
    const missing: string[] = [];
    for (const line of lines) {
      if (line.vendor_id && !vendorIds.has(line.vendor_id)) {
        missing.push(line.vendor_id);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it("all 12 vendor IDs appear at least once in the dataset", () => {
    const vendors = vendorsRaw as { id: string }[];
    const lineVendors = new Set(lines.map((l) => l.vendor_id).filter(Boolean));
    const missing = vendors.filter((v) => !lineVendors.has(v.id)).map((v) => v.id);
    expect(missing, `Vendors with no lines: ${missing.join(", ")}`).toEqual([]);
  });

  it("all 8 customer IDs appear at least once in the dataset", () => {
    const customers = customersRaw as { id: string }[];
    const lineCustomers = new Set(lines.map((l) => l.customer_id).filter(Boolean));
    const missing = customers.filter((c) => !lineCustomers.has(c.id)).map((c) => c.id);
    expect(missing, `Customers with no lines: ${missing.join(", ")}`).toEqual([]);
  });

  it("all 5 cost centers appear at least once in the dataset", () => {
    const costCenters = costCentersRaw as { id: string }[];
    const lineCostCenters = new Set(lines.map((l) => l.cost_center).filter(Boolean));
    const missing = costCenters.filter((cc) => !lineCostCenters.has(cc.id)).map((cc) => cc.id);
    expect(missing, `Cost centers with no lines: ${missing.join(", ")}`).toEqual([]);
  });

  it("at least 25 distinct G/L Accounts are referenced", () => {
    const accounts = new Set(lines.map((l) => l.gl_account));
    expect(accounts.size).toBeGreaterThanOrEqual(25);
  });

  it("company_code is 1000 for all lines", () => {
    const bad = lines.filter((l) => l.company_code !== "1000");
    expect(bad.length).toBe(0);
  });

  it("currency is EUR for all lines", () => {
    const bad = lines.filter((l) => l.currency !== "EUR");
    expect(bad.length).toBe(0);
  });
});
