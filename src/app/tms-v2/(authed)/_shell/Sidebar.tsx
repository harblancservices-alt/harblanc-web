"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupedNav, TMS_V2_SETTINGS, isNavItemActive } from "@/lib/nav/nav.config";
import { IconSearch, IconBell } from "@/lib/nav/icons";
import { useShellSearch } from "./ShellSearchProvider";

/**
 * Desktop sidebar (>=1024px) — grouped nav rendered from nav.config.ts
 * (Command/Dispatch/Money/Partners & Truck/Insight), Settings pinned in the
 * footer. Dark graphite chrome (v2-design.md's approved shell) rather than
 * a white panel — reuses the same --bar/--bar-fg tokens the dark hero tiles
 * (KpiTile's emphasis="dark") already use, so this isn't a new color, just
 * the existing dark surface applied to the sidebar too. Active item:
 * accent-red left rule + a tinted accent background + white label —
 * visible at a glance, not just a text-color change. Group labels sit at
 * 70% white opacity (matches KpiTile's dark-label precedent) — clearly
 * legible against graphite, never the faint/washed-out grey the house
 * rule forbids.
 *
 * Now also carries everything the removed TopBar used to (brand mark,
 * search trigger, notifications, account identity, sign out) — Brent's
 * explicit ask was no top bar anywhere, on any viewport, with the vertical
 * space it occupied gone too, not just its border/background. Nothing is
 * deleted, just relocated: brand mark up top, search as its own entry
 * below it, and the account block (bell/email/sign out) pinned under
 * Settings at the bottom. Mobile gets the equivalent via MoreSheet.
 *
 * prefetch={false} on every Link: /tms-v2's middleware gate re-issues
 * Supabase session cookies on every request (same as /admin's), which the
 * Next.js router cache won't store — auto-prefetch would loop forever.
 * Carried forward from /admin's PortalSidebar, which hit this already.
 */
export function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const groups = groupedNav();
  const { setOpen } = useShellSearch();

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-r-md border-l-2 px-2.5 py-1.5 text-[14px] transition-colors ${
      active
        ? "border-accent bg-accent/20 font-medium text-white"
        : "border-transparent text-bar-fg/80 hover:bg-white/5 hover:text-bar-fg"
    }`;

  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col border-r border-graphite-line bg-bar py-4 lg:flex">
      <Link href="/tms-v2" prefetch={false} className="flex items-center gap-2 px-3 pb-4 font-semibold text-bar-fg">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[13px] font-bold text-white">H</span>
        Harblanc
      </Link>

      <div className="px-3 pb-3">
        <button type="button" onClick={() => setOpen(true)} className={`${linkClass(false)} w-full text-left`}>
          <IconSearch className="h-[18px] w-[18px]" />
          Search
        </button>
      </div>

      <nav className="no-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto px-3">
        {groups.map((group) => (
          <div key={group.id}>
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-bar-fg/70">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link key={item.id} href={item.href} prefetch={false} className={linkClass(active)}>
                    <item.Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-graphite-line px-3 pt-3">
        <Link
          href={TMS_V2_SETTINGS.href}
          prefetch={false}
          className={linkClass(isNavItemActive(pathname, TMS_V2_SETTINGS.href))}
        >
          <TMS_V2_SETTINGS.Icon className="h-[18px] w-[18px]" />
          {TMS_V2_SETTINGS.label}
        </Link>

        <button
          type="button"
          disabled
          title="Notifications — coming soon"
          className="mt-1 flex w-full items-center gap-2.5 rounded-r-md border-l-2 border-transparent px-2.5 py-1.5 text-[14px] text-bar-fg/50"
        >
          <IconBell className="h-[18px] w-[18px]" />
          Notifications
        </button>

        <div className="mt-3 flex flex-col gap-1.5 px-2.5">
          {email ? <span className="truncate text-[12px] text-bar-fg/60">{email}</span> : null}
          <form action="/admin/logout" method="post">
            <button type="submit" className="text-[13px] font-medium text-bar-fg/80 hover:text-bar-fg">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
