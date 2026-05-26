"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

const items: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/previews", label: "Previews" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex items-center gap-5 sm:gap-8">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            // Phase PREFETCH-FIX: prefetch={false} stops Next.js from
            // background-fetching these three RSC payloads on idle. The
            // admin middleware writes Set-Cookie on every request via
            // supabase.auth.getUser() (@supabase/ssr session refresh),
            // and Next's router cache refuses to store responses with
            // mutated cookies — so the auto-prefetcher kept retrying
            // forever, producing a steady stream of admin?_rsc /
            // quotes?_rsc / applications?_rsc GETs in the Network tab
            // while idle. Clicking these links still works exactly as
            // before; navigation just incurs the full RSC fetch on
            // click instead of being pre-warmed. Middleware + Supabase
            // session handling are untouched.
            prefetch={false}
            className={
              "flex items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase transition-colors " +
              (active ? "text-black" : "text-black hover:text-black")
            }
          >
            {active ? (
              <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            ) : null}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
