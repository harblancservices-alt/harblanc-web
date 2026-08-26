"use client";

import { usePathname } from "next/navigation";
import { SegmentedTabs } from "../_shell/SegmentedTabs";

/**
 * FOUR TABS (2026-08-25). What left, and why:
 *
 *   Companies    — moved to the left sidebar as a child of Admin Account. It
 *                  is a destination of its own, not one of Admin's sections.
 *   BOL Center   — off the row per Brent's direction that the two intake
 *   OTR            funnels stop being prominent destinations and become
 *                  SOURCES feeding the central company/work model. Both
 *                  routes and pages are untouched and still hold live data;
 *                  Overview reads from them.
 *   Organization — folded into Accounts as a compact info card; the route
 *                  now redirects there.
 */
const TABS: { href: string; label: string; exact: boolean }[] = [
  { href: "/crm/admin", label: "Overview", exact: true },
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
];

/**
 * Top-row tab strip for the Admin Account section — real routes (not
 * client-only tab state), since Accounts drills into its own
 * /crm/admin/accounts/[userId] detail route and needs a back-navigable URL.
 *
 * No badges any more: the only two this row ever carried were BOL Center's
 * and OTR's attention counts, and both tabs are gone. See admin/layout.tsx
 * for what that means for the counts themselves.
 */
export function AdminTabs() {
  const pathname = usePathname() ?? "";

  return (
    <SegmentedTabs
      ariaLabel="Admin Account sections"
      size="lg"
      items={TABS.map((t) => ({
        key: t.href,
        label: t.label,
        href: t.href,
        active: t.exact ? pathname === t.href : pathname.startsWith(t.href),
      }))}
    />
  );
}
