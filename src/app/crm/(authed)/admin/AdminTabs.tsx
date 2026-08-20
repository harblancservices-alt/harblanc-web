"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; exact: boolean }[] = [
  { href: "/crm/admin", label: "Overview", exact: true },
  // BOL Center and OTR sit right after Overview, matching crm-design's
  // admin tab order — the two intake funnels are the highest-priority admin
  // work, grouped adjacently. Neither has a real backend yet (no bolRecords/
  // otrEntries table); both pages say so honestly rather than faking data —
  // see admin/bol-center/page.tsx and admin/otr/page.tsx.
  { href: "/crm/admin/bol-center", label: "BOL Center", exact: false },
  { href: "/crm/admin/otr", label: "OTR", exact: false },
  { href: "/crm/admin/accounts", label: "Accounts", exact: false },
  // Deliberately still labeled "Activity", not "Activity Log" — this tab
  // shows the real CRM's org-wide SALES activity feed (crm_activities/
  // crm_calls/crm_notes), not an admin audit trail. crm-design's "Activity
  // Log" tab is a genuinely different, real audit-log feature (who changed
  // what admin setting, when) that the real CRM has no backend for yet
  // (CRM_MASTER_AUDIT.md §3/§12). Renaming the label without building that
  // backend would repeat the exact "Overview lies about what Documents
  // shows" bug this section already had fixed once — see admin/page.tsx.
  { href: "/crm/admin/activity", label: "Activity", exact: false },
  { href: "/crm/admin/documents", label: "Documents", exact: false },
  { href: "/crm/admin/organization", label: "Organization", exact: false },
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
                ? "bg-card text-admin shadow-e2 ring-1 ring-line-strong"
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
