"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconBuilding,
  IconCalendar,
  IconCamera,
  IconChart,
  IconClipboard,
  IconCoins,
  IconDashboard,
  IconFiles,
  IconLogout,
  IconMail,
  IconMailPlus,
  IconReceipt,
  IconRoute,
  IconSettings,
  IconStack,
  IconWrench,
} from "./icons";

/**
 * Level 4 — desktop sidebar (V2 "Fleet Ops" chrome).
 *
 * Hidden below lg (`hidden lg:flex`). Sticky at the top-bar's lower edge
 * (top-14), full remaining viewport height. The bottom nav handles the
 * mobile/tablet equivalent.
 *
 * VISUAL: deep-graphite rail (bg-graphite) with grouped section labels.
 * Active row = graphite-2 fill + a 3px accent left edge. Settings is
 * pinned in the footer above an owner-operator identity chip. Every
 * destination is a route that already exists — labels/grouping are
 * cosmetic; no href, prop, or behaviour changed. Groups mirror the
 * approved V2 scheme (Operations / Fleet / Partners) with the remaining
 * existing destinations kept under "More" exactly as they linked before.
 *
 * prefetch={false} on every Link: the admin middleware re-issues
 * Supabase session cookies on every request, which the Next.js router
 * cache won't store — auto-prefetch would loop forever.
 */

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  // Solid accent-red fill with a white outline, label, and icon instead of the
  // bare rail row. Mirrors the same two tiles in MoreSheet.
  red?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { href: "/admin", label: "Dashboard", Icon: IconDashboard },
      { href: "/admin/dispatch/loads", label: "Loads", Icon: IconStack },
      {
        href: "/admin/dispatch/email-broker",
        label: "Load Inquiry",
        Icon: IconMailPlus,
        red: true,
      },
      { href: "/admin/dispatch/trips", label: "Trips", Icon: IconRoute },
      { href: "/admin/calendar", label: "Calendar", Icon: IconCalendar },
    ],
  },
  {
    title: "Partners",
    items: [
      { href: "/admin/dispatch/brokers", label: "Brokers", Icon: IconBuilding },
    ],
  },
  {
    title: "Payments",
    items: [
      { href: "/admin/operations", label: "Operations", Icon: IconClipboard },
      {
        href: "/admin/dispatch/receivables",
        label: "Receivables",
        Icon: IconCoins,
      },
      { href: "/admin/expenses", label: "Expenses", Icon: IconReceipt },
    ],
  },
  {
    // Reporting over the money the two groups above move — sits directly under
    // them so the read-only view of the numbers is next to where they're made.
    title: "Insights",
    items: [
      { href: "/admin/performance", label: "Performance", Icon: IconChart },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/admin/maintenance", label: "Maintenance", Icon: IconWrench },
      { href: "/admin/files", label: "Files", Icon: IconFiles },
      { href: "/admin/camera", label: "Camera", Icon: IconCamera },
    ],
  },
  {
    title: "More",
    items: [
      {
        href: "/admin/dispatch/reach",
        label: "Send Backhaul",
        Icon: IconMail,
        red: true,
      },
      { href: "/admin/previews", label: "Email Previews", Icon: IconMail },
    ],
  },
];

const SETTINGS: NavItem = {
  href: "/admin/settings",
  label: "Settings",
  Icon: IconSettings,
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function PortalSidebar({ email }: { email: string | null }) {
  const pathname = usePathname() ?? "";

  return (
    <aside
      aria-label="Portal navigation"
      data-shell="sidebar"
      className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[212px] shrink-0 flex-col border-r border-graphite-line bg-graphite text-on-dark-dim lg:flex"
    >
      <nav className="flex-1 overflow-y-auto py-2">
        {GROUPS.map((group) => (
          <div key={group.title} className="pb-1">
            <p className="px-4 pt-4 pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-on-dark-dim">
              {group.title}
            </p>
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                Icon={item.Icon}
                red={item.red}
                active={isActive(pathname, item.href)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-graphite-line pt-1">
        <SidebarLink
          href={SETTINGS.href}
          label={SETTINGS.label}
          Icon={SETTINGS.Icon}
          active={isActive(pathname, SETTINGS.href)}
        />

        <div className="mt-1 flex items-center gap-2.5 border-t border-graphite-line px-4 py-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-graphite-2 font-mono text-[12px] font-bold tracking-[0.04em] text-white ring-1 ring-graphite-line"
          >
            BH
          </span>
          <div className="min-w-0 flex-1" title={email ?? undefined}>
            <p className="truncate text-[13px] font-bold leading-tight text-white">
              Brent H.
            </p>
            <p className="truncate text-[11px] leading-tight text-on-dark-dim">
              Owner-operator
            </p>
          </div>
          <form action="/logout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-on-dark-dim transition-colors hover:bg-white/[0.06] hover:text-accent"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  Icon,
  active,
  red = false,
}: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  active: boolean;
  red?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={
        // Red rows are inset pills rather than full-bleed rail rows so the
        // white outline reads as an outline; mx-2 + px-2 keeps their icon on
        // the same left edge as every other row. Their active state doubles
        // the white outline, since an accent ring would vanish on accent.
        "flex items-center gap-3 py-2.5 text-[13px] font-semibold tracking-[0.01em] transition-colors " +
        (red
          ? "mx-2 rounded-md border border-white bg-accent px-2 text-white shadow-sm hover:bg-accent-hover " +
            (active ? "ring-1 ring-white" : "")
          : "border-l-[3px] px-4 " +
            (active
              ? "border-accent bg-graphite-2 text-white"
              : "border-transparent text-on-dark-dim hover:bg-white/[0.06] hover:text-white"))
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
