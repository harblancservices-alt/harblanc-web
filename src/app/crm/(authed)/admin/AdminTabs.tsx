"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; exact: boolean }[] = [
  { href: "/crm/admin", label: "Overview", exact: true },
  { href: "/crm/admin/accounts", label: "Accounts", exact: false },
  { href: "/crm/admin/activity", label: "Activity", exact: false },
  { href: "/crm/admin/documents", label: "Documents", exact: false },
];

/**
 * Top-row tab strip for the Admin Account section — real routes (not client-
 * only state like ProfileCenterTabs.tsx's company-profile tabs), since the
 * Accounts tab drills into its own /crm/admin/accounts/[userId] detail
 * route and needs a real back-navigable URL. Same pill-in-an-inset-bar
 * visual idiom as that component, just Link-driven with pathname-based
 * active state instead of client tab-index state.
 */
export function AdminTabs() {
  const pathname = usePathname() ?? "";

  return (
    <div
      role="tablist"
      aria-label="Admin Account sections"
      className="flex gap-1 overflow-x-auto rounded-lg border border-line-strong bg-inset p-1.5 shadow-e1"
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            role="tab"
            aria-selected={active}
            className={`shrink-0 rounded-md px-3.5 py-2 text-[13px] font-bold transition-all ${
              active
                ? "bg-card text-[#9333ea] shadow-e2 ring-1 ring-line-strong"
                : "text-fg-muted hover:bg-card/60 hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
