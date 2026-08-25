"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; exact: boolean }[] = [
  { href: "/crm/admin", label: "Overview", exact: true },
  // BOL Center and OTR sit right after Overview, matching crm-design's
  // admin tab order — the two intake funnels are the highest-priority admin
  // work, grouped adjacently. Both have real backends now (crm_bol_entries
  // and crm_otr_entries, 2026-08-20).
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
export function AdminTabs({
  otrNeedsAttention = 0,
  bolNeedsAttention = 0,
}: {
  otrNeedsAttention?: number;
  bolNeedsAttention?: number;
}) {
  const pathname = usePathname() ?? "";
  const badgeByHref: Record<string, number> = {
    "/crm/admin/otr": otrNeedsAttention,
    "/crm/admin/bol-center": bolNeedsAttention,
  };

  return (
    <div
      role="tablist"
      aria-label="Admin Account sections"
      className="flex gap-6 overflow-x-auto border-b border-line"
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const badge = badgeByHref[t.href] ?? 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            role="tab"
            aria-selected={active}
            className={`relative flex shrink-0 items-center gap-1.5 pb-2.5 pt-1 text-[13.5px] transition-colors ${
              active ? "font-semibold text-fg" : "font-normal text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
            {badge > 0 && (
              <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-admin px-1 text-[10px] font-bold text-white">
                {badge}
              </span>
            )}
            {active && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-[#c0272d]" />}
          </Link>
        );
      })}
    </div>
  );
}
