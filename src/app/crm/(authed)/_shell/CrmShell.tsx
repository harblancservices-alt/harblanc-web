"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildCrmNav, bottomNav, moreNav, isActive } from "./nav";
import { IconLogout, IconMore } from "./icons";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { ActivityTracker } from "./ActivityTracker";

type CrmShellProps = {
  email: string;
  fullName: string | null;
  /** CRM role ("owner"/"member") — only the role and counts (plain,
   * serializable values) cross the Server->Client boundary from layout.tsx;
   * the nav itself (built with icon COMPONENT references, which are function
   * values and cannot cross that boundary — see buildCrmNav's docstring for
   * the exact failure mode this avoids) is built here, client-side. */
  role: string;
  pendingReviewCount: number;
  unclaimedAiLeadsCount: number;
  customerCount: number;
  children: React.ReactNode;
};

/**
 * The Hello Hotshot CRM application shell. Carries the `.crm-light` theme
 * scope (so the shared V2 design tokens resolve to the CRM's premium light
 * palette with a steel-blue brand accent), and renders the CRM's OWN nav —
 * a desktop sidebar and a mobile bottom bar. It shares no markup or state
 * with the admin PortalShell.
 *
 * NO top bar, on any viewport (matches the tms-v2 shell's PortalShell/
 * Sidebar precedent) — its vertical space is gone too, not just its border/
 * background. What it used to hold moved rather than disappeared: the brand
 * mark is now the first thing in the desktop sidebar, and the account
 * identity + sign out were already pinned at the sidebar's bottom (and
 * already duplicated into MobileMoreSheet for mobile) before this pass —
 * removing the top bar didn't strand either. Content starts flush at the
 * top of <main> on every viewport.
 */
export function CrmShell({
  email,
  fullName,
  role,
  pendingReviewCount,
  unclaimedAiLeadsCount,
  customerCount,
  children,
}: CrmShellProps) {
  const pathname = usePathname() ?? "";
  const initial = (fullName || email || "?").trim().charAt(0).toUpperCase();
  const navItems = buildCrmNav(role, pendingReviewCount, unclaimedAiLeadsCount, customerCount);
  const mobileNav = bottomNav(navItems);
  // Everything the bottom bar's 4 fixed slots don't cover (Active
  // Customers, Prospects, Settings, and — owner-only — AI Review) surfaces
  // in the mobile "More" sheet instead, so no destination the desktop
  // sidebar lists is ever unreachable on mobile.
  const moreItems = moreNav(navItems);
  // Only "alert"-tone badges (currently Prospects' unclaimed count) bubble up
  // as the red More-sheet dot — a neutral badge (Active Customers, AI
  // Review) hiding inside More shouldn't make the dot read as urgent.
  const moreAlertTotal = moreItems.reduce(
    (sum, item) => sum + (item.badgeTone === "alert" ? (item.badge ?? 0) : 0),
    0,
  );
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="crm-light min-h-screen bg-canvas text-fg">
      {/* Silent, owner-only-visible activity logging — renders nothing. */}
      <ActivityTracker />

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-graphite-line bg-graphite lg:flex">
          <BrandMark dark />

          <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {navItems.map((item) => {
              const active = isActive(pathname, item);
              // Owner-only items (currently just AI Review) render in an
              // orange accent — the CRM's existing --warn/amber token —
              // regardless of active state, so the admin can tell
              // admin-only tabs apart from everyday ones at a glance.
              // Red-accent items (currently just Upgrades) render the same
              // way but in --bad/red, for every user, not just the owner.
              const ownerOnly = !!item.ownerOnly;
              const redAccent = !!item.redAccent;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={[
                    "flex items-center gap-3.5 border-l-2 px-3.5 py-3 text-[15px] font-medium transition-colors",
                    active
                      ? ownerOnly
                        ? "border-warn bg-graphite-2 text-warn"
                        : redAccent
                          ? "border-bad bg-graphite-2 text-bad"
                          : "border-accent bg-graphite-2 text-white"
                      : ownerOnly
                        ? "border-transparent text-warn/90 hover:bg-graphite-2/60 hover:text-warn"
                        : redAccent
                          ? "border-transparent text-bad/90 hover:bg-graphite-2/60 hover:text-bad"
                          : "border-transparent text-on-dark-dim hover:bg-graphite-2/60 hover:text-white",
                  ].join(" ")}
                >
                  <item.Icon
                    width={22}
                    height={22}
                    className={
                      ownerOnly
                        ? "text-warn"
                        : redAccent
                          ? "text-bad"
                          : active
                            ? "text-accent"
                            : "text-on-dark-dim"
                    }
                  />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span
                      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center px-1 text-[10.5px] font-bold leading-none tabular-nums ${
                        item.badgeTone === "alert"
                          ? "bg-bad text-white"
                          : "bg-graphite-2 text-on-dark-dim"
                      }`}
                    >
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
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-accent text-[13px] font-semibold text-white">
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

        {/* Content column — no mobile top bar either; the brand mark isn't
            needed on mobile (the bottom nav is the primary chrome there,
            same as tms-v2), and account identity/sign out already live in
            MobileMoreSheet. Content starts flush at the top. */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
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
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="relative flex flex-col items-center gap-1 border-t-2 border-transparent py-2.5 text-[10.5px] font-medium text-on-dark-dim"
        >
          <IconMore width={22} height={22} />
          More
          {moreAlertTotal > 0 && (
            <span className="absolute right-[24%] top-1 inline-flex h-[16px] min-w-[16px] items-center justify-center bg-bad px-1 text-[9.5px] font-bold leading-none tabular-nums text-white">
              {moreAlertTotal > 99 ? "99+" : moreAlertTotal}
            </span>
          )}
        </button>
      </nav>

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} items={moreItems} />
    </div>
  );
}

/** `dark` sits it on the sidebar's graphite background (white/dim-white
 * wordmark) instead of the light `.crm-light` panel it was originally
 * built for — the only caller left since the top bars were removed. */
function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      href="/crm"
      prefetch={false}
      className="flex items-center gap-2.5 px-3 pb-4 pt-3"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-accent text-[15px] font-black text-white">
        H
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={`text-[15px] font-bold tracking-tight ${dark ? "text-white" : "text-fg"}`}
        >
          Hello Hotshot
        </span>
        <span
          className={`text-[9.5px] font-semibold uppercase tracking-[0.22em] ${
            dark ? "text-on-dark-dim" : "text-fg-subtle"
          }`}
        >
          CRM
        </span>
      </span>
    </Link>
  );
}
