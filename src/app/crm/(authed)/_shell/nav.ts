import type { ComponentType, SVGProps } from "react";
import {
  IconDashboard,
  IconCompanies,
  IconContacts,
  IconTasks,
  IconActivity,
  IconPipeline,
  IconSettings,
  IconFlagSolid,
  IconAdminAccount,
  IconTruck,
  IconCamera,
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
   * time-sensitive queues. Nothing sets it today — Prospects' unclaimed-leads
   * count was the only one and left with the item on 2026-08-25. Everything
   * else ("neutral", the default when omitted) renders as a plain gray count,
   * e.g. Upgrades' backlog depth — informational, not demanding action. */
  badgeTone?: "alert" | "neutral";
  /** Forces the item's ICON (only — border/background/label stay the normal
   * item treatment) to a fixed color regardless of active state. Currently
   * unused since 2026-08-22, when "Active Clients" — the only item that ever
   * set it (a solid gold star at all times) — became an Operations sub-tab.
   * Kept as a supported flag, with its CrmShell rendering intact, so the
   * next deliberate brand exception has somewhere to go; everything in the
   * nav today pulls from the shared accent/admin token pair below. */
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
  /**
   * Sub-items rendered indented beneath this one in the sidebar.
   *
   * Added 2026-08-25 for Admin Account → Companies, and built as a general
   * mechanism rather than a special case: the centralised company/work model
   * will keep adding surfaces under Admin Account, and a second child should
   * cost one line here and nothing else.
   *
   * A child inherits its parent's visibility — buildCrmNav only ever pushes
   * the Admin Account item for an owner, so its children are owner-only for
   * free, with /crm/admin/**'s own requireCrmAdmin() gate behind them.
   *
   * Children are flattened into the mobile "More" sheet (see moreNav) so
   * nothing the desktop sidebar lists is unreachable on a phone.
   */
  children?: CrmNavItem[];
};

/**
 * Build the CRM nav for the signed-in user.
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
 * primitives — role, outstandingUpgradeCount — into CrmShell, which calls
 * this itself instead of receiving its output as a prop. Since /crm routes
 * are all force-dynamic and never prerendered at build time, `next build`/
 * `tsc` won't catch a regression here — it only throws on a real request.
 *
 * 2026-08-25: `pendingReviewCount` and then `unclaimedAiLeadsCount` came off
 * this signature as AI Review and Prospects lost their nav items. Each was
 * threaded layout.tsx -> CrmShell -> here purely to badge an item that no
 * longer exists, and each cost a count query on every CRM page render; both
 * queries were deleted with the parameter rather than left computing a
 * number nothing reads.
 */
export function buildCrmNav(
  role: string,
  outstandingUpgradeCount: number,
): CrmNavItem[] {
  const nav: CrmNavItem[] = [
    { href: "/crm", label: "Dashboard", Icon: IconDashboard },
    { href: "/crm/accounts", label: "Companies", Icon: IconCompanies },
    { href: "/crm/contacts", label: "Contacts", Icon: IconContacts },
    // The funnel view of the same companies — one column per
    // lifecycle_status, drag to advance a stage. Sits next to Companies
    // because it is the same book of business, arranged by where each one is
    // rather than alphabetically.
    { href: "/crm/pipeline", label: "Pipeline", Icon: IconPipeline },
    // ACTIVITY IS NOT HERE. It shipped in this list on 2026-08-28 with the
    // comment "every role sees it", which was wrong: the page shows every
    // agent's numbers beside each other and defaults to all agents. Tyler,
    // the org's one member, opened it seven times before Brent caught it.
    // It now lives under Admin Account below, owner-gated in the nav, in
    // the route, and in the loaders themselves.
    // PROSPECTS IS GONE. The claim model was retired 2026-08-25 (agents no
    // longer pick work out of a shared pool, an admin assigns it), which left
    // /crm/ai-agent loading but unreachable; the route itself was deleted
    // 2026-08-26. Its one load-bearing piece, the predicate that keeps
    // unowned companies out of an agent's roster, moved to
    // _shell/unclaimedCompanies.ts. Unassigned companies surface on Admin →
    // Companies under the Unassigned filter, and in Admin → Overview's pool.
    { href: "/crm/tasks", label: "Tasks", Icon: IconTasks },
    // Operations — the everyday operating tools: Quote Calculator,
    // Documents/vendor packets, Active Loads, Active Clients, Active
    // Carriers. Visible to EVERY CRM user, sales agents included: nothing
    // under it is owner-only. The one admin-gated piece of the Documents
    // story — UPLOADING the lawyer-provided templates — deliberately stays
    // where it already lives (/crm/admin/documents, owner-only); this tab
    // only ever READS that library and bundles a selection into a download.
    //
    // 2026-08-22: "Active Clients" was a top-level item of its own here
    // (/crm/active-customers, gold star, customer-count badge) until it
    // became an Operations sub-tab; the carrier directory (/crm/carriers)
    // joined it. `match` carries over from that removed item so the
    // still-live standalone routes those sub-tabs reuse — and the compat
    // redirects — keep lighting Operations in the sidebar rather than
    // nothing at all.
    {
      href: "/crm/operations",
      label: "Operations",
      Icon: IconTruck,
      match: [
        "/crm/active-customers",
        "/crm/carriers",
        "/crm/customers",
        "/crm/shipments",
      ],
    },
  ];
  // AI Review lost its nav item here on 2026-08-20 (it became a stat tile on
  // Admin Overview), and the whole surface was deleted 2026-08-25 along with
  // the ai_agent/field_capture pipelines that were its only producers —
  // nothing writes ai_status='pending_review' anymore. No route to link to.
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
      children: [
        // The management view of every company in the org. Lives here rather
        // than in the Admin top tab row (Brent, 2026-08-25) — it is a
        // destination of its own, not one of Admin's internal sections.
        { href: "/crm/admin/companies", label: "Companies", Icon: IconCompanies },
        // Its sibling: every contact in the org, whoever owns the company
        // behind it. Counterpart to the workspace directory, which is scoped
        // to the companies you own.
        { href: "/crm/admin/contacts", label: "Contacts", Icon: IconContacts },
        // Its sibling: every open task in the org, one column per person,
        // draggable between them. Same reasoning as Companies — a destination
        // of its own, not one of Admin's internal tab sections.
        { href: "/crm/admin/tasks", label: "Tasks", Icon: IconTasks },
        // Its sibling: who did what, to whom, when. Management reporting —
        // one row per agent with the detailed feed one click behind it — so
        // it belongs with the rest of the owner-only section rather than in
        // the workspace nav every agent sees.
        { href: "/crm/admin/activity", label: "Activity", Icon: IconActivity },
        // Its sibling: the BOL scanner. A capture surface, not a reader —
        // it photographs paperwork in bulk and stores it in batches; a
        // separate session parses a batch afterwards. Sits here rather than
        // in Operations because it is Brent's own bulk-intake tool, not
        // something an agent touches during a day's calling.
        { href: "/crm/admin/snapshot", label: "Snapshot", Icon: IconCamera },
      ],
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
 * Everything NOT in the mobile bottom bar's 4 fixed slots — Operations,
 * Upgrades, Settings, and (owner-only, already filtered out of `nav` for
 * non-owners by buildCrmNav) Admin Account. Fed into the mobile
 * "More" sheet so every destination the desktop sidebar lists stays
 * reachable on mobile too. Derived from the same `nav` array as bottomNav
 * (and the desktop sidebar) rather than its own hardcoded list, so the three
 * surfaces can never drift out of sync with each other.
 */
export function moreNav(nav: CrmNavItem[]): CrmNavItem[] {
  // Children are flattened in beside their parent so a nested destination is
  // still reachable on a phone — the sheet is a flat list by design.
  return nav
    .filter((item) => !BOTTOM_HREFS.includes(item.href))
    .flatMap((item) => [item, ...(item.children ?? [])]);
}

export function isActive(pathname: string, item: CrmNavItem): boolean {
  if (item.href === "/crm") return pathname === "/crm";
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.match ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * Should the PARENT row light up?
 *
 * Not simply isActive(): a parent's href is a prefix of its children's, so
 * /crm/admin/companies makes plain isActive() true for Admin Account too and
 * both rows would read as selected at once. A parent is active only when the
 * path is within it AND no child owns it.
 */
export function isParentActive(pathname: string, item: CrmNavItem): boolean {
  if (!isActive(pathname, item)) return false;
  return !(item.children ?? []).some((child) => isActive(pathname, child));
}
