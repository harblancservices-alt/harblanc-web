import type { ComponentType, SVGProps } from "react";
import {
  IconDashboard,
  IconCompanies,
  IconContacts,
  IconPipeline,
  IconTasks,
  IconReports,
  IconSettings,
} from "./icons";

export type CrmNavItem = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Extra path prefixes that should also light this item as active. */
  match?: string[];
};

/**
 * The Hello Hotshot CRM's own navigation. Deliberately distinct from the
 * dispatch/admin nav — a CRM user never sees a dispatch destination here.
 */
export const CRM_NAV: CrmNavItem[] = [
  { href: "/crm", label: "Dashboard", Icon: IconDashboard },
  { href: "/crm/accounts", label: "Companies", Icon: IconCompanies },
  { href: "/crm/contacts", label: "Contacts", Icon: IconContacts },
  { href: "/crm/pipeline", label: "Pipeline", Icon: IconPipeline },
  { href: "/crm/tasks", label: "Tasks", Icon: IconTasks },
  { href: "/crm/reports", label: "Reports", Icon: IconReports },
  { href: "/crm/settings", label: "Settings", Icon: IconSettings },
];

/** The four primary destinations surfaced in the mobile bottom bar. */
export const CRM_BOTTOM_NAV: CrmNavItem[] = [
  CRM_NAV[0],
  CRM_NAV[1],
  CRM_NAV[3],
  CRM_NAV[4],
];

export function isActive(pathname: string, item: CrmNavItem): boolean {
  if (item.href === "/crm") return pathname === "/crm";
  if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
  return (item.match ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
