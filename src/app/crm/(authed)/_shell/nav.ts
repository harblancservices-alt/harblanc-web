import type { ComponentType, SVGProps } from "react";
import {
  IconDashboard,
  IconCompanies,
  IconContacts,
  IconTasks,
  IconSettings,
  IconFlame,
  IconStarSolid,
  IconFlagSolid,
  IconAdminAccount,
} from "./icons";

export type CrmNavItem = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Extra path prefixes that should also light this item as active. */
  match?: string[];
  /** Small count badge rendered beside the label (e.g. pending AI reviews). */
  badge?: number;
  /** Badge color: "alert" (red, `bg-bad`) is reserved for genuinely urgent,
   * time-sensitive queues — currently just Prospects' unclaimed leads.
   * Everything else ("neutral", the default when omitted) renders as a
   * plain gray count, e.g. Active Clients' size or AI Review's queue
   * depth — informational, not something demanding action. */
  badgeTone?: "alert" | "neutral";
  /** Forces the item's ICON (only — border/background/label stay the normal
   * item treatment) to a fixed color regardless of active state. Currently
   * just "Active Clients", which wants a solid gold star at all times — the
   * one deliberate, documented brand-color exception in the nav (everything
   * else pulls from the shared accent/admin token pair below). */
  iconTint?: "gold";
  /** True for the single "Admin Account" item — owner-only (pushed only when
   * role==='owner') and rendered in the CRM's dedicated `--admin` token
   * (violet), full nav weight, promoted back into the main scrolling list
   * with one divider above it rather than demoted into footer chrome — the
   * owner's most powerful surface shouldn't be visually the smallest thing
   * in the shell (CRM_MASTER_AUDIT.md §1/§2/§13 P1 #7).
   *
   * 2026-08-19: collapsed from four independent hardcoded accent flags
   * (ownerOnly→amber, redAccent→red, adminAccent→raw hex, iconTint→gold) down
   * to two — this flag (the one elevated/admin token) and iconTint (the one
   * named brand exception). AI Review and Upgrades no longer carry their own
   * ad-hoc color: AI Review is already role-gated structurally (only ever
   * pushed for an owner), so it doesn't need a color to also say "owner
   * only"; Upgrades is demoted to footer placement instead of a permanent red
   * flag (see CrmShell). One accent per semantic category, not one invented
   * color per feature. */
  adminAccent?: boolean;
};

/**
 * Build the CRM nav for the signed-in user. "Prospects" (route stays
 * /crm/ai-agent — the team's released lead register) is visible to everyone,
 * badged with the count of released leads nobody has claimed yet — the same
 * alert surfaced on the dashboard's "New leads to claim" card and folded
 * into its due-count bell. "AI Review"
 * (the pending-review queue) is owner-only — mirroring the server-side
 * redirect on /crm/ai-review, so a non-owner never even sees the destination
 * in the nav — and its badge (`pendingReviewCount`) is owner-only too.
 *
 * Built fresh per call (rather than spread from a shared module-level array)
 * so the per-request badge counts never leak between requests.
 *
 * Call this ONLY from a Client Component (CrmShell does, client-side). Each
 * item carries `Icon`, a component function reference — a function value —
 * and React Server Components cannot serialize function props crossing the
 * Server->Client boundary (same class of bug as commit fbfabd7's pipeline/
 * settings render-prop crash — "pipeline" the deal-dialog crash, not the
 * removed nav tab). layout.tsx (a Server Component) must pass only plain
 * primitives — role, pendingReviewCount, unclaimedAiLeadsCount,
 * customerCount, outstandingUpgradeCount — into CrmShell, which calls this
 * itself instead of receiving its output as a prop. Since /crm routes are
 * all force-dynamic and never prerendered at build time, `next build`/`tsc`
 * won't catch a regression here — it only throws on a real request.
 */
export function buildCrmNav(
  role: string,
  pendingReviewCount: number,
  unclaimedAiLeadsCount: number,
  customerCount: number,
  outstandingUpgradeCount: number,
): CrmNavItem[] {
  const nav: CrmNavItem[] = [
    { href: "/crm", label: "Dashboard", Icon: IconDashboard },
    { href: "/crm/accounts", label: "Companies", Icon: IconCompanies },
    { href: "/crm/contacts", label: "Contacts", Icon: IconContacts },
    {
      href: "/crm/ai-agent",
      label: "Prospects",
      Icon: IconFlame,
      badge: unclaimedAiLeadsCount > 0 ? unclaimedAiLeadsCount : undefined,
      badgeTone: "alert",
    },
    { href: "/crm/tasks", label: "Tasks", Icon: IconTasks },
    {
      href: "/crm/active-customers",
      label: "Active Clients",
      Icon: IconStarSolid,
      match: ["/crm/shipments", "/crm/carriers", "/crm/customers"],
      badge: customerCount > 0 ? customerCount : undefined,
      badgeTone: "neutral",
      iconTint: "gold",
    },
  ];
  // AI Review moved under Admin Account (2026-08-20, Brent's explicit
  // directive, overriding /crm-design's own silence on this feature — see
  // CRM_MIGRATION_MATRIX.md §0/§3): the pending-review queue is an
  // owner/admin tool, not a sales-agent nav destination, and having it as a
  // standalone Workspace item alongside Companies/Tasks/etc. was exactly the
  // "same underlying concept split across two disconnected destinations"
  // problem CRM_MASTER_AUDIT.md §1 flagged. It's still reachable at
  // /crm/ai-review (route unchanged, functionality untouched) via a stat
  // tile on the Admin Overview page instead of a nav item here.
  nav.push({
    href: "/crm/upgrades",
    label: "Upgrades",
    Icon: IconFlagSolid,
    // Backlog count, informational — same "neutral" bucket as Active
    // Clients/AI Review, no longer paired with a permanent red flag (moved
    // to footer placement in CrmShell, see CRM_MASTER_AUDIT.md §1/§2 P1 #6).
    badge: outstandingUpgradeCount > 0 ? outstandingUpgradeCount : undefined,
    badgeTone: "neutral",
  });
  nav.push({ href: "/crm/settings", label: "Settings", Icon: IconSettings });
  if (role === "owner") {
    nav.push({
      href: "/crm/admin",
      label: "Admin Account",
      Icon: IconAdminAccount,
      adminAccent: true,
    });
  }
  return nav;
}

// Pipeline was removed from the nav/bottom bar; Contacts takes its old 4th
// slot so the mobile bottom bar still fills all four columns.
const BOTTOM_HREFS = ["/crm", "/crm/accounts", "/crm/contacts", "/crm/tasks"];

/**
 * The four primary destinations surfaced in the mobile bottom bar, picked
 * from the built nav by href — so owner-only items never disturb the
 * bottom bar's fixed 4-column layout.
 */
export function bottomNav(nav: CrmNavItem[]): CrmNavItem[] {
  return BOTTOM_HREFS.map((href) => nav.find((item) => item.href === href)).filter(
    (item): item is CrmNavItem => Boolean(item),
  );
}

/**
 * Everything NOT in the mobile bottom bar's 4 fixed slots — Active
 * Customers, Prospects, Settings, and (owner-only, already filtered out of
 * `nav` for non-owners by buildCrmNav) AI Review. Fed into the mobile
 * "More" sheet so every destination the desktop sidebar lists stays
 * reachable on mobile too. Derived from the same `nav` array as bottomNav
 * (and the desktop sidebar) rather than its own hardcoded list, so the three
 * surfaces can never drift out of sync with each other.
 */
export function moreNav(nav: CrmNavItem[]): CrmNavItem[] {
  return nav.filter((item) => !BOTTOM_HREFS.includes(item.href));
}

export function isActive(pathname: string, item: CrmNavItem): boolean {
  if (item.href === "/crm") return pathname === "/crm";
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.match ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
