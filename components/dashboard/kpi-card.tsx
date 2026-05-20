import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  /** Formatted value string, or undefined to show "—" */
  value?: string;
  /** Sub-label below the value */
  sub?: string;
  /** When true, renders the card with the indigo→violet gradient ring (brand accent) */
  accent?: boolean;
  className?: string;
};

/**
 * KPI stat card — one of 4 across the top of the Dashboard.
 *
 * `value` is optional: when undefined (e.g., Findings before features land),
 * the card shows "—" in stone-300. This typed seam lets issues 04/05/06
 * wire in real counts without touching the layout.
 */
export function KpiCard({ label, value, sub, accent = false, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-white p-5 ring-1 transition-shadow",
        accent
          ? "ring-transparent bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm [box-shadow:0_0_0_1px_theme(colors.indigo.200)]"
          : "ring-stone-200 hover:ring-stone-300",
        className
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums leading-none",
          value === undefined ? "text-stone-300" : "text-stone-900"
        )}
      >
        {value ?? "—"}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}
