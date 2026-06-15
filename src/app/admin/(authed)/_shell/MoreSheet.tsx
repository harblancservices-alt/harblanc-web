"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ComponentType } from "react";
import {
  IconBadge,
  IconChevronRight,
  IconMail,
  IconReceipt,
  IconRoute,
  IconSettings,
  IconTruck,
} from "./icons";

/**
 * Level 4 — More sheet (mobile + tablet).
 *
 * Bottom sheet triggered from PortalBottomNav's More button. Lists the
 * two utility routes that didn't earn a top-level nav slot: Previews
 * and Settings. Per Q7, desktop expands these inline in PortalSidebar
 * and never opens a sheet/popup — this component is only used below lg.
 *
 * Closes on:
 *   - Tap on scrim
 *   - Tap on a row (after navigation kicks in)
 *   - Escape key
 *
 * Locks body scroll while open so the page behind doesn't drift under
 * the operator's finger.
 */

type SheetItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const ITEMS: SheetItem[] = [
  { href: "/admin/loads", label: "Quotes", Icon: IconTruck },
  { href: "/admin/applications", label: "Applications", Icon: IconBadge },
  { href: "/admin/dispatch/trips", label: "Trips", Icon: IconRoute },
  { href: "/admin/accounting", label: "Accounting", Icon: IconReceipt },
  { href: "/admin/previews", label: "Previews", Icon: IconMail },
  { href: "/admin/settings", label: "Settings", Icon: IconSettings },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function MoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="More"
      className="fixed inset-0 z-50 lg:hidden"
    >
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/45"
      />
      <div className="absolute inset-x-0 bottom-0 border-t-2 border-line bg-card pb-[max(env(safe-area-inset-bottom),1rem)]">
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-canvas" />
        <p className="mt-3 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-fg">
          More
        </p>
        <ul className="mt-2 border-t border-line">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="border-b border-line">
                <Link
                  href={item.href}
                  prefetch={false}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex items-center gap-3.5 px-5 py-3.5 transition-colors " +
                    (active ? "bg-[#fafaf6]" : "")
                  }
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line text-fg">
                    <item.Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-fg">
                      {item.label}
                    </p>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-fg">
                      {item.href}
                    </p>
                  </div>
                  <IconChevronRight className="h-4 w-4 shrink-0 text-fg" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
