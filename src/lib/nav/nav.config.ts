import type { ComponentType, SVGProps } from "react";
import {
  IconToday,
  IconCalendar,
  IconLoadBoard,
  IconTrips,
  IconBrokers,
  IconReach,
  IconInquiry,
  IconPipeline,
  IconReceivables,
  IconExpenses,
  IconAccounting,
  IconPerformance,
  IconMaintenance,
  IconFiles,
  IconCamera,
  IconSettings,
} from "./icons";

/**
 * The ONE route registry for /tms-v2 (v2-architecture.md §2/§4). Desktop
 * sidebar, mobile bottom nav, mobile "More" sheet, and (later) the command
 * palette's navigation results all render from this single array — add a
 * route here once and it appears correctly on every surface, by
 * construction, not by hand-sync discipline. This directly targets the V1
 * failure this rebuild exists to fix: hand-duplicated nav config that
 * drifted out of sync across desktop/mobile.
 *
 * A plain module-level array (not a function), because none of these items
 * carry per-request state (badge counts) yet — later phases that wire the
 * notification model's badge counts in will likely turn this into a
 * `buildNav(counts)` function the way /crm's nav.ts does, at that point.
 *
 * Icons are component values, so this module must only ever be imported by
 * Client Components (Sidebar/BottomNav/MoreSheet) — never constructed in a
 * Server Component and passed down as a prop, which would fail to
 * serialize across the RSC boundary (same class of issue /crm's nav.ts
 * documents).
 */
export type NavGroupId =
  | "today"
  | "loads"
  | "partners"
  | "pipeline"
  | "money"
  | "records";

export const NAV_GROUP_LABEL: Record<NavGroupId, string> = {
  today: "Today",
  loads: "Loads",
  partners: "Partners",
  pipeline: "Pipeline",
  money: "Money",
  records: "Records",
};

export type NavItem = {
  id: string;
  label: string;
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  group: NavGroupId;
  /** Small count badge rendered beside the label — wired up once the
   * notification model (v2-design.md) exists; unused for now. */
  badge?: number;
  /** True for items only ever reachable/relevant to the owner account.
   * No /tms-v2 route is owner-gated yet (single-operator app) — present
   * for parity with the nav item contract, unused today. */
  ownerOnly?: boolean;
  /** Surfaced as one of the 3 fixed mobile bottom-nav slots (alongside
   * "More"). Per v2-design.md's mobile wireframe: Today, Load Board,
   * Brokers. */
  mobilePrimary?: boolean;
};

export const TMS_V2_NAV: NavItem[] = [
  { id: "today", label: "Today", href: "/tms-v2", Icon: IconToday, group: "today", mobilePrimary: true },
  { id: "calendar", label: "Calendar", href: "/tms-v2/calendar", Icon: IconCalendar, group: "today" },

  { id: "loads", label: "Load Board", href: "/tms-v2/loads", Icon: IconLoadBoard, group: "loads", mobilePrimary: true },
  { id: "trips", label: "Trips", href: "/tms-v2/trips", Icon: IconTrips, group: "loads" },

  { id: "brokers", label: "Brokers", href: "/tms-v2/brokers", Icon: IconBrokers, group: "partners", mobilePrimary: true },
  { id: "reach", label: "Reach", href: "/tms-v2/reach", Icon: IconReach, group: "partners" },
  { id: "load-inquiry", label: "Load Inquiry", href: "/tms-v2/load-inquiry", Icon: IconInquiry, group: "partners" },

  { id: "operations", label: "Operations", href: "/tms-v2/operations", Icon: IconPipeline, group: "pipeline" },

  { id: "receivables", label: "Receivables", href: "/tms-v2/receivables", Icon: IconReceivables, group: "money" },
  { id: "expenses", label: "Expenses", href: "/tms-v2/expenses", Icon: IconExpenses, group: "money" },
  { id: "accounting", label: "Accounting", href: "/tms-v2/accounting", Icon: IconAccounting, group: "money" },
  { id: "performance", label: "Performance", href: "/tms-v2/performance", Icon: IconPerformance, group: "money" },

  { id: "maintenance", label: "Maintenance", href: "/tms-v2/maintenance", Icon: IconMaintenance, group: "records" },
  { id: "files", label: "Files", href: "/tms-v2/files", Icon: IconFiles, group: "records" },
  { id: "camera", label: "Camera", href: "/tms-v2/camera", Icon: IconCamera, group: "records" },
];

/** Settings is pinned at the bottom of the shell, outside the six groups
 * above — same treatment v2-design.md's shell wireframe gives it. */
export const TMS_V2_SETTINGS: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/tms-v2/settings",
  Icon: IconSettings,
  group: "records",
};

export function groupedNav(): { id: NavGroupId; label: string; items: NavItem[] }[] {
  const order: NavGroupId[] = ["today", "loads", "partners", "pipeline", "money", "records"];
  return order.map((id) => ({
    id,
    label: NAV_GROUP_LABEL[id],
    items: TMS_V2_NAV.filter((item) => item.group === id),
  }));
}

/** The 3 fixed mobile bottom-nav destinations, in nav-array order. The
 * 4th slot is always "More" (rendered separately, not part of this list). */
export function mobilePrimaryNav(): NavItem[] {
  return TMS_V2_NAV.filter((item) => item.mobilePrimary);
}

/** Everything not pinned to the mobile bottom bar's 3 fixed slots, plus
 * Settings — fed into the "More" sheet so every desktop-sidebar
 * destination stays reachable on mobile. */
export function moreNav(): NavItem[] {
  return [...TMS_V2_NAV.filter((item) => !item.mobilePrimary), TMS_V2_SETTINGS];
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/tms-v2") return pathname === "/tms-v2";
  return pathname === href || pathname.startsWith(href + "/");
}
