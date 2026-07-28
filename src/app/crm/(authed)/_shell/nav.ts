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

const BASE_NAV: CrmNavItem[] = [
  { href: "/crm", label: "Dashboard", Icon: IconDashboard },
  { href: "/crm/accounts", label: "Companies", Icon: IconCompanies },
  { href: "/crm/contacts", label: "Contacts", Icon: IconContacts },
  { href: "/crm/ai-agent", label: "AI Agent", Icon: IconAiAgent },
  { href: "/crm/pipeline", label: "Pipeline", Icon: IconPipeline },
  { href: "/crm/tasks", label: "Tasks", Icon: IconTasks },
  { href: "/crm/reports", label: "Reports", Icon: IconReports },
];

/**
 * Build the CRM nav for the signed-in user. "AI Agent" (the team's released
 * lead register) is visible to everyone; "AI Review" (the pending-review
 * queue) is owner-only — mirroring the server-side redirect on
 * /crm/ai-review, so a non-owner never even sees the destination in the nav.
 * `pendingAiCount` badges the review item for owners only.
 */
export function buildCrmNav(role: string, pendingAiCount: number): CrmNavItem[] {
  const nav = [...BASE_NAV];
  if (role === "owner") {
    nav.push({
      href: "/crm/ai-review",
      label: "AI Review",
      Icon: IconAiReview,
      badge: pendingAiCount > 0 ? pendingAiCount : undefined,
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
