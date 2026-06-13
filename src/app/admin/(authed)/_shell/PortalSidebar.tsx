"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconBadge,
  IconDashboard,
  IconDots,
  IconLogout,
  IconMail,
  IconSettings,
  IconTruck,
} from "./icons";

/**
 * Level 4 — desktop sidebar.
 *
 * Hidden below lg (`hidden lg:flex`). Sticky at the top-bar's lower edge
 * (top-14), full remaining viewport height. The bottom nav handles the
 * mobile/tablet equivalent.
 *
 * Structure per Q7 approval:
 *
 *   Dashboard
 *   Quotes
 *   Applications
 *
 *   More
 *    └ Previews
 *    └ Settings
 *
 * No popup. No dropdown. Previews and Settings are nested rows always
 * visible inside the sidebar. One click to navigate. The "More" row
 * itself isn't a destination — it's a label for the nested group.
 *
 * Foot block carries the operator email + sign-out form. Sign-out posts
 * to the existing /admin/logout route (unchanged from prior layout).
 *
 * prefetch={false} on every Link: the admin middleware re-issues
 * Supabase session cookies on every request, which the Next.js router
 * cache won't store — auto-prefetch would loop forever.
 */

type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const PRIMARY: NavItem[] = [
  { href: "/admin", label: "Dashboard", Icon: IconDashboard },
  { href: "/admin/loads", label: "Loads", Icon: IconTruck },
  { href: "/admin/applications", label: "Applications", Icon: IconBadge },
];

const MORE: NavItem[] = [
  { href: "/admin/previews", label: "Previews", Icon: IconMail },
  { href: "/admin/settings", label: "Settings", Icon: IconSettings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function PortalSidebar({ email }: { email: string | null }) {
  const pathname = usePathname() ?? "";

  return (
    <aside
      aria-label="Portal navigation"
      className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[200px] shrink-0 flex-col border-r border-black bg-black text-white lg:flex"
    >
      <nav className="flex flex-1 flex-col py-2">
        {PRIMARY.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.Icon}
            active={isActive(pathname, item.href)}
          />
        ))}

        <div className="mt-4 flex items-center gap-2.5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white opacity-70">
          <IconDots className="h-4 w-4" />
          <span>More</span>
        </div>
        {MORE.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.Icon}
            active={isActive(pathname, item.href)}
            nested
          />
        ))}
      </nav>

      <div className="border-t border-white/15 px-4 pt-3 pb-4">
        {email ? (
          <p
            className="break-all font-mono text-[10px] font-medium tracking-[0.04em] text-white opacity-80"
            title={email}
          >
            {email}
          </p>
        ) : null}
        <form action="/admin/logout" method="post" className="mt-3">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white transition-colors hover:text-black"
          >
            <IconLogout className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  Icon,
  active,
  nested = false,
}: {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={
        "flex items-center gap-2.5 border-l-[3px] py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] transition-colors " +
        (nested ? "pl-9 pr-4 text-[10.5px] " : "pl-4 pr-4 ") +
        (active
          ? "border-black bg-white/[0.06] text-black"
          : "border-transparent text-white hover:bg-white/[0.04]")
      }
    >
      <Icon className={nested ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{label}</span>
    </Link>
  );
}
