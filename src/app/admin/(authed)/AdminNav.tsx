"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

const items: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/applications", label: "Applications" },
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
            className={
              "flex items-center gap-2 text-xs font-semibold tracking-[0.12em] uppercase transition-colors " +
              (active ? "text-zinc-900" : "text-zinc-600 hover:text-zinc-900")
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
