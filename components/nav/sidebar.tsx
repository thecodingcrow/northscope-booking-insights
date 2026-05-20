"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Repeat2,
  Copy,
  BookOpen,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav item types
// ---------------------------------------------------------------------------

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

// ---------------------------------------------------------------------------
// Nav structure (matches spec §6 routes)
// ---------------------------------------------------------------------------

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Documents", href: "/documents", icon: FileText },
    ],
  },
  {
    title: "Findings",
    items: [
      { label: "Text similarities", href: "/anomalies/text", icon: Repeat2 },
      { label: "Duplicates", href: "/anomalies/duplicates", icon: Copy },
    ],
  },
  {
    title: "Library",
    items: [
      { label: "Booking manual", href: "/booking-manual", icon: BookOpen },
      { label: "Vendors", href: "/vendors", icon: Users },
      { label: "Chart of accounts", href: "/accounts", icon: BarChart3 },
    ],
  },
];

// ---------------------------------------------------------------------------
// NavItem component
// ---------------------------------------------------------------------------

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        isActive
          ? "bg-stone-100 text-stone-900 font-medium"
          : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
      )}
    >
      <item.icon
        className={cn(
          "h-4 w-4 shrink-0",
          isActive ? "text-stone-700" : "text-stone-400"
        )}
      />
      {item.label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-stone-200 bg-white">
      {/* Logo / brand */}
      <div className="flex h-14 items-center gap-2 border-b border-stone-200 px-4">
        {/* Gradient brand mark */}
        <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-indigo-500 to-violet-600">
          <span className="text-[10px] font-bold text-white">N</span>
        </div>
        <div>
          <span className="text-[13px] font-semibold text-stone-900">Northscope</span>
          <span className="ml-1 text-[11px] text-stone-400">Insights</span>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarNavItem key={item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-stone-200 px-4 py-3">
        <p className="text-[11px] text-stone-400">
          Mar – Apr 2026 · 170 docs
        </p>
      </div>
    </aside>
  );
}
