import type { ComponentType, SVGProps } from "react";
import {
  IconDashboard,
  IconCompanies,
  IconContacts,
  IconTasks,
  IconSettings,
  IconFlame,
  IconAiReview,
  IconCustomers,
  IconCalendar,
  IconUpgrades,
  IconRateConfirmation,
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
   * plain gray count, e.g. Active Customers' size or AI Review's queue
   * depth — informational, not something demanding action. */
  badgeTone?: "alert" | "neutral";
  /** True for items only ever pushed when role==='owner' (currently just AI
   * Review). CrmShell and MobileMoreSheet render these in an orange accent
   * — icon + label — so the admin can tell admin-only tabs apart from
   * everyday ones at a glance, in both the desktop sidebar and the mobile
   * More sheet. */
  ownerOnly?: boolean;
  /** True for items that should read as urgent/attention-grabbing for EVERY
   * user, not just the owner (currently just Upgrades — a place to flag
   * things Brent should look at). CrmShell and MobileMoreSheet render these
   * in the CRM's red `--bad` token — icon + label — regardless of active
   * state, same mechanism as `ownerOnly`'s always-orange treatment but not
   * role-gated. An item is never expected to set both. */
  redAccent?: boolean;
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
    { href: "/crm/calendar", label: "Calendar", Icon: IconCalendar },
    {
      href: "/crm/rate-confirmation",
      label: "Rate Confirmation",
      Icon: IconRateConfirmation,
    },
    {
      href: "/crm/customers",
      label: "Active Customers",
      Icon: IconCustomers,
      badge: customerCount > 0 ? customerCount : undefined,
      badgeTone: "neutral",
    },
    {
      href: "/crm/upgrades",
      label: "Upgrades",
      Icon: IconUpgrades,
      redAccent: true,
      // Backlog count, not a time-sensitive queue (see badgeTone doc above)
      // — same "neutral" bucket as Active Customers/AI Review, independent
      // of the item's always-on red accent.
      badge: outstandingUpgradeCount > 0 ? outstandingUpgradeCount : undefined,
      badgeTone: "neutral",
    },
  ];
  if (role === "owner") {
    nav.push({
      href: "/crm/ai-review",
      label: "AI Review",
      Icon: IconAiReview,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
      badgeTone: "neutral",
      ownerOnly: true,
    });
  }
  nav.push({ href: "/crm/settings", label: "Settings", Icon: IconSettings });
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
