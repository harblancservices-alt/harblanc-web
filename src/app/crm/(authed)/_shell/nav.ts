import type { ComponentType, SVGProps } from "react";
import {
  IconDashboard,
  IconCompanies,
  IconContacts,
  IconPipeline,
  IconTasks,
  IconReports,
  IconSettings,
  IconAiAgent,
  IconAiReview,
  IconFieldCapture,
} from "./icons";

export type CrmNavItem = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Extra path prefixes that should also light this item as active. */
  match?: string[];
  /** Small count badge rendered beside the label (e.g. pending AI reviews). */
  badge?: number;
};

/**
 * Build the CRM nav for the signed-in user. "AI Agent" (the team's released
 * lead register) is visible to everyone, badged with the count of released
 * leads nobody has claimed yet — the same alert surfaced on the dashboard's
 * "New leads to claim" card and folded into its due-count bell. "AI Review"
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
 * settings render-prop crash). layout.tsx (a Server Component) must pass
 * only plain primitives — role, pendingReviewCount, unclaimedAiLeadsCount —
 * into CrmShell, which calls this itself instead of receiving its output as
 * a prop. Since /crm routes are all force-dynamic and never prerendered at
 * build time, `next build`/`tsc` won't catch a regression here — it only
 * throws on a real request.
 */
export function buildCrmNav(
  role: string,
  pendingReviewCount: number,
  unclaimedAiLeadsCount: number,
): CrmNavItem[] {
  const nav: CrmNavItem[] = [
    { href: "/crm", label: "Dashboard", Icon: IconDashboard },
    { href: "/crm/accounts", label: "Companies", Icon: IconCompanies },
    { href: "/crm/contacts", label: "Contacts", Icon: IconContacts },
    {
      href: "/crm/ai-agent",
      label: "AI Agent",
      Icon: IconAiAgent,
      badge: unclaimedAiLeadsCount > 0 ? unclaimedAiLeadsCount : undefined,
    },
    { href: "/crm/pipeline", label: "Pipeline", Icon: IconPipeline },
    { href: "/crm/tasks", label: "Tasks", Icon: IconTasks },
    { href: "/crm/reports", label: "Reports", Icon: IconReports },
  ];
  if (role === "owner") {
    nav.push({
      href: "/crm/ai-review",
      label: "AI Review",
      Icon: IconAiReview,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    });
    nav.push({
      href: "/crm/field-capture",
      label: "Field Capture",
      Icon: IconFieldCapture,
    });
  }
  nav.push({ href: "/crm/settings", label: "Settings", Icon: IconSettings });
  return nav;
}

const BOTTOM_HREFS = ["/crm", "/crm/accounts", "/crm/pipeline", "/crm/tasks"];

/**
 * The four primary destinations surfaced in the mobile bottom bar, picked
 * from the built nav by href — so the AI/owner-only items never disturb the
 * bottom bar's fixed 4-column layout.
 */
export function bottomNav(nav: CrmNavItem[]): CrmNavItem[] {
  return BOTTOM_HREFS.map((href) => nav.find((item) => item.href === href)).filter(
    (item): item is CrmNavItem => Boolean(item),
  );
}

export function isActive(pathname: string, item: CrmNavItem): boolean {
  if (item.href === "/crm") return pathname === "/crm";
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.match ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
