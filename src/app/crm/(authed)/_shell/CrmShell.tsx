"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { bottomNav, isActive, type CrmNavItem } from "./nav";
import { IconLogout } from "./icons";

type CrmShellProps = {
  email: string;
  fullName: string | null;
  orgName: string;
  navItems: CrmNavItem[];
  children: React.ReactNode;
};

/**
 * The Hello Hotshot CRM application shell. Carries the `.crm-light` theme
 * scope (so the shared V2 design tokens resolve to the CRM's premium light
 * palette with a steel-blue brand accent), and renders the CRM's OWN nav —
 * a desktop sidebar, a sticky top bar, and a mobile bottom bar. It shares no
 * markup or state with the admin PortalShell.
 */
export function CrmShell({ email, fullName, orgName, navItems, children }: CrmShellProps) {
  const pathname = usePathname() ?? "";
  const initial = (fullName || email || "?").trim().charAt(0).toUpperCase();
  const mobileNav = bottomNav(navItems);

  return (
    <div className="crm-light min-h-screen bg-canvas text-fg">
      {/* Desktop sticky top bar */}
      <header className="sticky top-0 z-30 hidden h-14 items-center justify-between border-b border-line bg-panel px-5 lg:flex">
        <BrandMark />
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] font-medium text-fg-subtle sm:inline">
            {orgName}
          </span>
          <span className="h-8 w-8 shrink-0 rounded-full bg-graphite text-center text-[13px] font-semibold leading-8 text-white">
            {initial}
          </span>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[220px] shrink-0 flex-col border-r border-graphite-line bg-graphite lg:flex">
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
            {navItems.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={[
                    "flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-[13.5px] font-medium transition-colors",
                    active
                      ? "border-accent bg-graphite-2 text-white"
                      : "border-transparent text-on-dark-dim hover:bg-graphite-2/60 hover:text-white",
                  ].join(" ")}
                >
                  <item.Icon
                    className={active ? "text-accent" : "text-on-dark-dim"}
                  />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10.5px] font-bold leading-none tabular-nums text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Identity + sign out */}
          <div className="border-t border-graphite-line p-3">
            <div className="mb-2 flex items-center gap-2.5 px-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white">
                {initial}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-white">
                  {fullName || "CRM user"}
                </span>
                <span className="block truncate text-[11px] text-on-dark-dim">
                  {email}
                </span>
              </span>
            </div>
            <form action="/crm/logout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium text-on-dark-dim transition-colors hover:bg-graphite-2/60 hover:text-white"
              >
                <IconLogout width={18} height={18} />
                Sign out
              </button>
            </form>
          </div>
        </aside>

        {/* Content column */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-panel px-4 lg:hidden">
            <BrandMark />
            <span className="h-8 w-8 shrink-0 rounded-full bg-graphite text-center text-[13px] font-semibold leading-8 text-white">
              {initial}
            </span>
          </div>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-graphite-line bg-graphite pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobileNav.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={[
                "flex flex-col items-center gap-1 border-t-2 py-2.5 text-[10.5px] font-medium transition-colors",
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-on-dark-dim",
              ].join(" ")}
            >
              <item.Icon width={22} height={22} />
              {item.label}
            </Link>
          );
        })}
        <form
          action="/crm/logout"
          method="post"
          className="flex items-stretch"
        >
          <button
            type="submit"
            className="flex w-full flex-col items-center gap-1 border-t-2 border-transparent py-2.5 text-[10.5px] font-medium text-on-dark-dim"
          >
            <IconLogout width={22} height={22} />
            Sign out
          </button>
        </form>
      </nav>
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/crm" prefetch={false} className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[15px] font-black text-white">
        H
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-tight text-fg">
          Hello Hotshot
        </span>
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-fg-subtle">
          CRM
        </span>
      </span>
    </Link>
  );
}
