/**
 * In-memory data store — module-level singleton.
 *
 * Next.js bundles the JSON files at build time. ES module caching gives
 * singleton semantics automatically: the first import triggers the load;
 * subsequent imports return the cached module. No fetch, no API routes,
 * no client-side state.
 *
 * See spec §6 "In-memory data layer".
 */

import rawLines from "@/data/data.json";
import rawAccounts from "@/data/accounts.json";
import rawVendors from "@/data/vendors.json";
import rawCustomers from "@/data/customers.json";
import rawCostCenters from "@/data/cost-centers.json";

import type { JournalLine, Account, Vendor, Customer, CostCenter } from "@/lib/types";

// ---------------------------------------------------------------------------
// Typed casts — JSON imports are typed as the literal shape of the file.
// We assert to our canonical types (shapes are compatible).
// ---------------------------------------------------------------------------

export const lines: JournalLine[] = rawLines as JournalLine[];
export const accounts: Account[] = rawAccounts as Account[];
export const vendors: Vendor[] = rawVendors as Vendor[];
export const customers: Customer[] = rawCustomers as Customer[];
export const costCenters: CostCenter[] = rawCostCenters as CostCenter[];

// ---------------------------------------------------------------------------
// Lookup maps (built once, O(1) access for views)
// ---------------------------------------------------------------------------

export const accountByCode: Map<string, Account> = new Map(
  accounts.map((a) => [a.code, a])
);

export const vendorById: Map<string, Vendor> = new Map(
  vendors.map((v) => [v.id, v])
);

export const customerById: Map<string, Customer> = new Map(
  customers.map((c) => [c.id, c])
);

// ---------------------------------------------------------------------------
// Store aggregate
// ---------------------------------------------------------------------------

const store = {
  lines,
  accounts,
  vendors,
  customers,
  costCenters,
  accountByCode,
  vendorById,
  customerById,
} as const;

export default store;
