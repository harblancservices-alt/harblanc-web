"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupedNav, TMS_V2_SETTINGS, isNavItemActive } from "@/lib/nav/nav.config";

/**
 * Desktop sidebar (>=1024px) — grouped nav rendered from nav.config.ts,
 * Settings pinned in the footer (v2-design.md's desktop wireframe). Active
 * item: accent-red left rule + accent text, no filled pill background —
 * "nothing else changes, keeps it calm" per the design doc.
 *
 * prefetch={false} on every Link: /tms-v2's middleware gate re-issues
 * Supabase session cookies on every request (same as /admin's), which the
 * Next.js router cache won't store — auto-prefetch would loop forever.
 * Carried forward from /admin's PortalSidebar, which hit this already.
 */
export function Sidebar() {
  const pathname = usePathname();
  const groups = groupedNav();

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-r-md border-l-2 px-2.5 py-1.5 text-[14px] transition-colors ${
      active
        ? "border-accent font-medium text-accent"
        : "border-transparent text-fg hover:bg-elevated"
    }`;

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-56px)] w-56 shrink-0 flex-col justify-between border-r border-line bg-panel py-4 lg:flex">
      <nav className="flex flex-col gap-5 overflow-y-auto px-3">
        {groups.map((group) => (
          <div key={group.id}>
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
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
      <div className="border-t border-line px-3 pt-3">
        <Link
          href={TMS_V2_SETTINGS.href}
          prefetch={false}
          className={linkClass(isNavItemActive(pathname, TMS_V2_SETTINGS.href))}
        >
          <TMS_V2_SETTINGS.Icon className="h-[18px] w-[18px]" />
          {TMS_V2_SETTINGS.label}
        </Link>
      </div>
    </aside>
  );
}
