"use client";

import React, { useMemo, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown, X, ChevronDown as ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatEUR } from "@/lib/format/money";
import { formatDate } from "@/lib/format/dates";
import type { DocumentView } from "@/lib/types";
import type { Vendor, Customer, Account } from "@/lib/types";

// ---------------------------------------------------------------------------
// Row shape passed into the table
// ---------------------------------------------------------------------------

export type DocumentRow = DocumentView & {
  vendor_name: string | null;
  customer_name: string | null;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentsTableProps {
  rows: DocumentRow[];
  vendors: Vendor[];
  customers: Customer[];
  accounts: Account[];
  /** Current URL searchParams (for controlled filter form) */
  searchParams: Record<string, string>;
}

// ---------------------------------------------------------------------------
// URL search-param helpers
// ---------------------------------------------------------------------------

function useUrlFilters(searchParams: Record<string, string>) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function clearAll() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  return { setParam, clearAll };
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  vendors: Vendor[];
  accounts: Account[];
  searchParams: Record<string, string>;
  onParamChange: (key: string, value: string) => void;
  onClearAll: () => void;
}

function FilterBar({ vendors, accounts, searchParams, onParamChange, onClearAll }: FilterBarProps) {
  const dateFrom = searchParams["dateFrom"] ?? "";
  const dateTo = searchParams["dateTo"] ?? "";
  const vendorId = searchParams["vendor"] ?? "";
  const glAccount = searchParams["glAccount"] ?? "";
  const amtMin = searchParams["amtMin"] ?? "";
  const amtMax = searchParams["amtMax"] ?? "";
  const text = searchParams["text"] ?? "";

  const hasFilters = !!(dateFrom || dateTo || vendorId || glAccount || amtMin || amtMax || text);

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  const selectedAccount = accounts.find((a) => a.code === glAccount);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Date from */}
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => onParamChange("dateFrom", e.target.value)}
        className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
        placeholder="Von"
        title="Posting date from"
      />

      <span className="text-stone-400 text-sm">–</span>

      {/* Date to */}
      <input
        type="date"
        value={dateTo}
        onChange={(e) => onParamChange("dateTo", e.target.value)}
        className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
        placeholder="Bis"
        title="Posting date to"
      />

      {/* Vendor dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 text-sm text-stone-700 hover:border-stone-300 hover:text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400">
          {selectedVendor ? (
            <span className="max-w-[140px] truncate">{selectedVendor.name_de}</span>
          ) : (
            <span className="text-stone-400">Vendor</span>
          )}
          <ChevronDownIcon className="h-3.5 w-3.5 text-stone-400 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-64 overflow-y-auto w-56">
          <DropdownMenuItem onClick={() => onParamChange("vendor", "")}>
            <span className="text-stone-400">All vendors</span>
          </DropdownMenuItem>
          {vendors.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onClick={() => onParamChange("vendor", v.id)}
              className={v.id === vendorId ? "bg-stone-100" : ""}
            >
              <span className="font-mono text-[11px] text-stone-400 mr-2">{v.id}</span>
              {v.name_de}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* G/L Account dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 text-sm text-stone-700 hover:border-stone-300 hover:text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400">
          {selectedAccount ? (
            <span className="max-w-[160px] truncate">
              {selectedAccount.code} — {selectedAccount.name_de}
            </span>
          ) : (
            <span className="text-stone-400">G/L Account</span>
          )}
          <ChevronDownIcon className="h-3.5 w-3.5 text-stone-400 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-64 overflow-y-auto w-72">
          <DropdownMenuItem onClick={() => onParamChange("glAccount", "")}>
            <span className="text-stone-400">All accounts</span>
          </DropdownMenuItem>
          {accounts.map((a) => (
            <DropdownMenuItem
              key={a.code}
              onClick={() => onParamChange("glAccount", a.code)}
              className={a.code === glAccount ? "bg-stone-100" : ""}
            >
              <span className="font-mono text-[11px] w-10 shrink-0 text-stone-500">{a.code}</span>
              <span className="truncate">{a.name_de}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Amount min */}
      <input
        type="number"
        value={amtMin}
        onChange={(e) => onParamChange("amtMin", e.target.value)}
        className="h-8 w-24 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
        placeholder="Min EUR"
        min="0"
        step="0.01"
      />

      <span className="text-stone-400 text-sm">–</span>

      {/* Amount max */}
      <input
        type="number"
        value={amtMax}
        onChange={(e) => onParamChange("amtMax", e.target.value)}
        className="h-8 w-24 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
        placeholder="Max EUR"
        min="0"
        step="0.01"
      />

      {/* Booking text search */}
      <input
        type="text"
        value={text}
        onChange={(e) => onParamChange("text", e.target.value)}
        className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
        placeholder="Search booking text…"
      />

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={onClearAll}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column definitions — module-level constant (no hooks, safe to define once)
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDef<DocumentRow>[] = [
    {
      id: "document_id",
      accessorKey: "document_id",
      header: "Document ID",
      cell: ({ getValue }) => (
        <span className="font-mono text-[13px] text-stone-700">{getValue<string>()}</span>
      ),
    },
    {
      id: "posting_date",
      accessorKey: "posting_date",
      header: "Posting date",
      cell: ({ getValue }) => (
        <span className="text-sm text-stone-700">{formatDate(getValue<string>())}</span>
      ),
    },
    {
      id: "debit_cents",
      accessorKey: "debit_cents",
      header: "Document Amount",
      cell: ({ getValue }) => (
        <span className="font-mono text-[13px] text-stone-900">{formatEUR(getValue<number>())}</span>
      ),
    },
    {
      id: "counterparty",
      header: "Vendor / Customer",
      accessorFn: (row) => row.vendor_name ?? row.customer_name ?? "—",
      cell: ({ getValue }) => (
        <span className="text-sm text-stone-700 max-w-[180px] truncate block">{getValue<string>()}</span>
      ),
    },
    {
      id: "line_count",
      accessorKey: "line_count",
      header: "Lines",
      cell: ({ getValue }) => (
        <span className="text-sm text-stone-500">{getValue<number>()}</span>
      ),
    },
    {
      id: "template",
      accessorKey: "template",
      header: "Template",
      cell: ({ getValue }) => {
        const val = getValue<string | null>();
        return val ? (
          <Badge variant="secondary" className="text-[11px] font-medium">
            {val}
          </Badge>
        ) : (
          <span className="text-stone-300">—</span>
        );
      },
    },
];

// ---------------------------------------------------------------------------
// Sort icon helper
// ---------------------------------------------------------------------------

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ChevronUp className="h-3.5 w-3.5" />;
  if (direction === "desc") return <ChevronDown className="h-3.5 w-3.5" />;
  return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DocumentsTable({
  rows,
  vendors,
  accounts,
  searchParams,
}: DocumentsTableProps) {
  const { setParam, clearAll } = useUrlFilters(searchParams);
  const router = useRouter();

  // Sort state — stored in URL via "sort" and "dir" params
  const sortKey = searchParams["sort"] ?? "";
  const sortDir = (searchParams["dir"] ?? "") as "asc" | "desc" | "";

  const sorting: SortingState = useMemo(() => {
    if (!sortKey) return [];
    return [{ id: sortKey, desc: sortDir === "desc" }];
  }, [sortKey, sortDir]);

  const table = useReactTable({
    data: rows,
    columns: COLUMNS,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (next.length === 0) {
        setParam("sort", "");
        setParam("dir", "");
      } else {
        setParam("sort", next[0].id);
        setParam("dir", next[0].desc ? "desc" : "asc");
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: true, // filtering is done server-side (before this component receives rows)
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
        <FilterBar
          vendors={vendors}
          accounts={accounts}
          searchParams={searchParams}
          onParamChange={setParam}
          onClearAll={clearAll}
        />
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-200 bg-white px-8 py-12 text-center">
          <p className="text-sm font-medium text-stone-500">No documents match these filters.</p>
          <button
            onClick={clearAll}
            className="mt-2 text-[13px] text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-stone-100">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400",
                          canSort && "cursor-pointer select-none hover:text-stone-600"
                        )}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <span className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && <SortIcon direction={sorted} />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, idx) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/documents/${row.original.document_id}`)}
                  className={cn(
                    "cursor-pointer border-b border-stone-50 transition-colors hover:bg-stone-50",
                    idx % 2 === 0 ? "" : "bg-stone-50/30"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-stone-100 px-4 py-2">
            <p className="text-[12px] text-stone-400">
              {rows.length} document{rows.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
