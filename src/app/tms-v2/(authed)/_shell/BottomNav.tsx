"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { mobilePrimaryNav, isNavItemActive } from "@/lib/nav/nav.config";
import { IconMenu } from "@/lib/nav/icons";
import { MoreSheet } from "./MoreSheet";

/**
 * Mobile bottom nav (<1024px) — the 3 `mobilePrimary` destinations from
 * nav.config.ts (Today, Load Board, Brokers) plus "More", which opens
 * MoreSheet. Same source array as the desktop sidebar, so these can never
 * drift out of sync with it.
 */
export function BottomNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = mobilePrimaryNav();

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-panel lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? "text-accent" : "text-fg-muted"
              }`}
            >
              <item.Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-fg-muted"
        >
          <IconMenu className="h-5 w-5" />
          More
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} email={email} />
    </>
  );
}
