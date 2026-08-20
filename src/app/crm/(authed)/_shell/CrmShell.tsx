"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildCrmNav, bottomNav, moreNav, isActive } from "./nav";
import { IconLogout, IconMore, IconSettings } from "./icons";
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
  outstandingUpgradeCount: number;
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
  outstandingUpgradeCount,
  children,
}: CrmShellProps) {
  const pathname = usePathname() ?? "";
  const initial = (fullName || email || "?").trim().charAt(0).toUpperCase();
  const navItems = buildCrmNav(
    role,
    pendingReviewCount,
    unclaimedAiLeadsCount,
    customerCount,
    outstandingUpgradeCount,
  );
  const mobileNav = bottomNav(navItems);
  // Settings and Upgrades stay pulled into the bottom identity block on
  // desktop (between the profile row and Sign out) — account-level chrome
  // and a lower-emphasis feedback link, not daily-driver destinations
  // alongside Dashboard/Companies/etc (CRM_MASTER_AUDIT.md §1/§2 P1 #6).
  // Admin Account is the opposite move: promoted BACK into the main
  // scrolling list (with one divider above it) instead of demoted into
  // footer chrome — it's the owner's most powerful surface, not account
  // chrome (§1/§2 P1 #7). Mobile is untouched: all three still surface in
  // the "More" sheet via `moreNav` exactly as before.
  const settingsItem = navItems.find((item) => item.href === "/crm/settings");
  const upgradesItem = navItems.find((item) => item.href === "/crm/upgrades");
  const sidebarNavItems = navItems.filter(
    (item) => item.href !== "/crm/settings" && item.href !== "/crm/upgrades",
  );
  // Everything the bottom bar's 4 fixed slots don't cover (Active
  // Clients, Prospects, Settings, and — owner-only — AI Review) surfaces
  // in the mobile "More" sheet instead, so no destination the desktop
  // sidebar lists is ever unreachable on mobile.
  const moreItems = moreNav(navItems);
  // Only "alert"-tone badges (currently Prospects' unclaimed count) bubble up
  // as the red More-sheet dot — a neutral badge (Active Clients, AI
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

          <nav className="flex flex-1 flex-col overflow-y-auto p-3">
            {sidebarNavItems.map((item, index) => {
              const active = isActive(pathname, item);
              // One coherent color system, not four independent ad-hoc
              // flags (CRM_MASTER_AUDIT.md §1/§2/§13 P1 #5): every item is
              // the shared steel-blue accent unless it's Admin Account (the
              // one dedicated elevated/`--admin` violet token), plus the one
              // documented icon-only exception (Active Clients' gold star).
              const admin = !!item.adminAccent;
              const goldIcon = item.iconTint === "gold";
              // Admin Account is promoted into this same scrolling list
              // (not demoted to footer chrome) but still needs to read as
              // visually set apart from the daily-driver workspace items
              // above it — a section divider does that without inventing a
              // second color.
              const isFirstAdminItem = admin && !sidebarNavItems[index - 1]?.adminAccent;
              return (
                // The divider lives on this wrapper (border-b), never on the
                // Link itself — the Link's own border-l-2/border-{color}
                // utilities set the shorthand `border-color` on ALL sides,
                // which would silently clobber a divider color set on the
                // same element (verified: Tailwind's divide-y utility has
                // exactly this collision and renders invisibly here).
                <div
                  key={item.href}
                  className={[
                    isFirstAdminItem ? "mt-2 border-t border-graphite-line pt-2" : "",
                    index < sidebarNavItems.length - 1 ? "border-b border-graphite-line/70" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Link
                    href={item.href}
                    prefetch={false}
                    className={[
                      "flex items-center gap-3.5 border-l-2 px-3.5 py-3 text-[15px] font-medium transition-colors",
                      active
                        ? admin
                          ? "border-admin bg-graphite-2 text-admin"
                          : "border-accent bg-graphite-2 text-white"
                        : admin
                          ? "border-transparent text-admin/90 hover:bg-graphite-2/60 hover:text-admin"
                          : "border-transparent text-white hover:bg-graphite-2/60",
                    ].join(" ")}
                  >
                    <item.Icon
                      width={22}
                      height={22}
                      className={
                        goldIcon
                          ? "text-[#e3b341]"
                          : admin
                            ? "text-admin"
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
                </div>
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
            {settingsItem && (
              <Link
                href={settingsItem.href}
                prefetch={false}
                className={[
                  "mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors",
                  isActive(pathname, settingsItem)
                    ? "bg-graphite-2 text-white"
                    : "text-on-dark-dim hover:bg-graphite-2/60 hover:text-white",
                ].join(" ")}
              >
                <IconSettings width={18} height={18} />
                Settings
              </Link>
            )}
            {upgradesItem && (
              <Link
                href={upgradesItem.href}
                prefetch={false}
                className={[
                  "mb-1 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors",
                  isActive(pathname, upgradesItem)
                    ? "bg-graphite-2 text-white"
                    : "text-on-dark-dim hover:bg-graphite-2/60 hover:text-white",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <upgradesItem.Icon width={18} height={18} />
                  {upgradesItem.label}
                </span>
                {!!upgradesItem.badge && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center bg-graphite-2 px-1 text-[10.5px] font-bold leading-none tabular-nums text-on-dark-dim">
                    {upgradesItem.badge > 99 ? "99+" : upgradesItem.badge}
                  </span>
                )}
              </Link>
            )}
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
