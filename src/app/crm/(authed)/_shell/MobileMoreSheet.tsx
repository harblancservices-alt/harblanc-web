"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type CrmNavItem } from "./nav";
import { IconLogout } from "./icons";

/**
 * The mobile "More" destination — a graphite bottom sheet listing every CRM
 * nav item that doesn't fit the bottom bar's 4 fixed slots, plus Sign out.
 * `items` is already role-filtered by buildCrmNav/moreNav in CrmShell (the
 * same source feeding the desktop sidebar and the bottom bar), so an
 * owner-only destination like AI Review only ever appears here for an
 * owner — this component does no gating of its own. Owner-only items
 * render in the same orange accent as the desktop sidebar (item.ownerOnly).
 */
export function MobileMoreSheet({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CrmNavItem[];
}) {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:hidden"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-lg border-t border-graphite-line bg-graphite pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-e3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="More"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-on-dark-dim">
            More
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[13px] font-medium text-on-dark-dim transition-colors hover:text-white"
          >
            Close
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 pb-2">
          {items.map((item) => {
            const active = isActive(pathname, item);
            const ownerOnly = !!item.ownerOnly;
            const redAccent = !!item.redAccent;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={onClose}
                className={[
                  "flex items-center gap-3 border-l-2 px-3 py-2.5 text-[14px] font-medium transition-colors",
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

        <div className="border-t border-graphite-line p-3">
          <form action="/crm/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-on-dark-dim transition-colors hover:bg-graphite-2/60 hover:text-white"
            >
              <IconLogout width={18} height={18} />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
