"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { moreNav, isNavItemActive } from "@/lib/nav/nav.config";

/**
 * Mobile "More" popover — pops up from the bottom-nav's More button,
 * mirroring legacy /admin's mobile MoreSheet interaction (a compact,
 * bottom-anchored panel over a dimmed backdrop) rather than the previous
 * full-screen inset-0 takeover. Per Brent's mobile review: the Search /
 * "Notifications — coming soon" / "Quick add — coming soon" rows and
 * their divider are gone entirely — the panel is just the nav items
 * (moreNav(), the same array the desktop sidebar reads) plus the account
 * email + Sign out at the bottom. Dismisses on backdrop tap, Escape, or
 * selecting a destination. Desktop is untouched (this component only
 * ever renders `lg:hidden`, via BottomNav).
 */
export function MoreSheet({ open, onClose, email }: { open: boolean; onClose: () => void; email: string | null }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const items = moreNav();

  return (
    <div role="dialog" aria-modal="true" aria-label="More" className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 touch-none bg-black/40" />
      <div
        className="absolute inset-x-3 bottom-20 flex max-h-[65vh] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-e3"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav className="no-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto p-2">
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

        <div className="shrink-0 border-t border-line px-4 py-3">
          {email ? <p className="mb-2 truncate text-[13px] text-fg-muted">{email}</p> : null}
          <form action="/admin/logout" method="post">
            <button type="submit" className="text-[13px] font-medium text-fg-muted hover:text-fg">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
