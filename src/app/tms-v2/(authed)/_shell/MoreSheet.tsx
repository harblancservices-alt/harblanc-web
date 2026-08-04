"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { moreNav, isNavItemActive } from "@/lib/nav/nav.config";
import { IconX } from "@/lib/nav/icons";

/**
 * Mobile "More" sheet — every destination NOT pinned to the bottom bar's 3
 * fixed slots, plus Settings, derived from the same nav.config.ts array as
 * the desktop sidebar (v2-design.md: "same data, same order, generated not
 * hand-kept"). Full-height overlay, closes on Esc-equivalent (X tap),
 * backdrop tap, or selecting a destination.
 */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  if (!open) return null;

  const items = moreNav();

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-canvas lg:hidden">
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <span className="text-[15px] font-semibold text-fg">More</span>
        <button type="button" onClick={onClose} aria-label="Close" className="text-fg-muted hover:text-fg">
          <IconX className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] ${
                  active ? "font-medium text-accent" : "text-fg"
                }`}
              >
                <item.Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
