"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import {
  IconBuilding,
  IconDashboard,
  IconDots,
  IconStack,
} from "./icons";
import { MoreSheet } from "./MoreSheet";

/**
 * Level 4 — portal bottom navigation.
 *
 * Mobile + tablet only (`lg:hidden`). Fixed at viewport bottom. Four
 * items: Dashboard / Quotes / Apps / More. Active state per Q3 (V3
 * baseline): red bottom border + red icon + red label. No background
 * swap (the black bar stays solid).
 *
 * The More button is the one non-link in the bar — it opens a bottom
 * sheet that lists Previews + Settings. Per Q7 desktop has no popup
 * (sidebar shows the nested items inline); the mobile sheet is the
 * mobile/tablet equivalent.
 *
 * PortalShell adds pb-20 to <main> so page content clears this fixed
 * bar plus the iOS safe-area inset.
 */

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", Icon: IconDashboard },
  { href: "/admin/dispatch/loads", label: "Loads", Icon: IconStack },
  { href: "/admin/dispatch/brokers", label: "Brokers", Icon: IconBuilding },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

// Routes that live in the More sheet — keep More highlighted when on them.
const MORE_ROUTES = [
  "/admin/quotes",
  "/admin/applications",
  "/admin/accounting",
  "/admin/dispatch/trips",
  "/admin/dispatch/reach",
  "/admin/dispatch/receivables",
  "/admin/previews",
  "/admin/settings",
];

function isMoreActive(pathname: string): boolean {
  return MORE_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function PortalBottomNav() {
  const pathname = usePathname() ?? "";
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreActive = isMoreActive(pathname);

  return (
    <>
      <nav
        aria-label="Portal navigation"
        data-shell="bottomnav"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-graphite-line bg-graphite pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className="flex transition-colors active:bg-white/15"
            >
              <NavItemBody item={item} active={active} />
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          aria-haspopup="dialog"
          className={
            "flex flex-col items-center justify-center gap-1 border-b-[2px] px-2 pt-2 pb-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] transition-colors active:bg-white/15 " +
            (moreActive || sheetOpen
              ? "border-accent text-accent"
              : "border-transparent text-white")
          }
        >
          <IconDots className="h-[18px] w-[18px]" />
          <span>More</span>
        </button>
      </nav>

      <MoreSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

/**
 * Inner content of a nav Link. Lives inside <Link> so it can read
 * useLinkStatus() — the tapped item lights up red and pulses the INSTANT the
 * tap registers (while the destination loads), instead of only after the page
 * arrives. Combined with the loading.tsx skeleton + prefetch, taps feel
 * immediate. While pending it also shows a slim red progress bar at the very
 * top of the screen.
 */
function NavItemBody({ item, active }: { item: NavItem; active: boolean }) {
  const { pending } = useLinkStatus();
  const lit = active || pending;
  return (
    <span
      className={
        "flex w-full flex-col items-center justify-center gap-1 border-b-[2px] px-2 pt-2 pb-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] transition-colors " +
        (lit ? "border-accent text-accent" : "border-transparent text-white") +
        (pending ? " animate-pulse" : "")
      }
    >
      <item.Icon className="h-[18px] w-[18px]" />
      <span>{item.label}</span>
      {pending ? <TopProgressBar /> : null}
    </span>
  );
}

/** Slim global progress bar shown while a nav tap is navigating. */
function TopProgressBar() {
  return (
    <span
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-[3px] animate-pulse bg-accent"
    />
  );
}
