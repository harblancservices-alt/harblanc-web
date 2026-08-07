"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { moreNav, isNavItemActive } from "@/lib/nav/nav.config";
import { IconX, IconSearch, IconBell, IconPlus } from "@/lib/nav/icons";
import { useShellSearch } from "./ShellSearchProvider";

/**
 * Mobile "More" sheet — every destination NOT pinned to the bottom bar's 3
 * fixed slots, plus Settings, derived from the same nav.config.ts array as
 * the desktop sidebar (v2-design.md: "same data, same order, generated not
 * hand-kept"). Also carries the account-level controls that live in
 * TopBar's borderless cluster on desktop (search, notifications, quick-add,
 * identity, sign out) — mobile has no top-bar chrome, so this sheet is
 * where those stay reachable instead of disappearing. Full-height overlay,
 * closes on Esc-equivalent (X tap), backdrop tap, or selecting a
 * destination.
 */
export function MoreSheet({ open, onClose, email }: { open: boolean; onClose: () => void; email: string | null }) {
  const pathname = usePathname();
  const { setOpen: setSearchOpen } = useShellSearch();
  if (!open) return null;

  const items = moreNav();

  function openSearch() {
    onClose();
    setSearchOpen(true);
  }

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
          <button
            type="button"
            onClick={openSearch}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px] text-fg"
          >
            <IconSearch className="h-5 w-5" />
            Search
          </button>
          <button type="button" disabled className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px] text-fg-muted opacity-60">
            <IconBell className="h-5 w-5" />
            Notifications — coming soon
          </button>
          <button type="button" disabled className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px] text-fg-muted opacity-60">
            <IconPlus className="h-5 w-5" />
            Quick add — coming soon
          </button>
        </div>

        <div className="my-2 border-t border-line" />

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

      <div className="border-t border-line px-4 py-3">
        {email ? <p className="mb-2 text-[13px] text-fg-muted">{email}</p> : null}
        <form action="/admin/logout" method="post">
          <button type="submit" className="text-[13px] font-medium text-fg-muted hover:text-fg">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
