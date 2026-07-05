"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  IconBadge,
  IconChevronRight,
  IconCoins,
  IconMail,
  IconReceipt,
  IconRoute,
  IconSettings,
  IconTruck,
  IconWrench,
  IconX,
} from "./icons";

/**
 * Level 4 — More sheet (mobile + tablet).
 *
 * Bottom sheet triggered from PortalBottomNav's More button — the mobile/tablet
 * home for every admin destination that didn't earn a top-level nav slot.
 * Desktop expands these inline in PortalSidebar and never opens this sheet
 * (lg:hidden).
 *
 * A designed menu, not a black slab: an elevated rounded panel over the dark
 * backdrop with a brand-red top accent strip, a header (title + close), and
 * section-grouped rows — each a tappable icon-left row with a red-tinted icon,
 * white label, and chevron. The active destination carries a red left bar,
 * red-filled icon, and accent tint.
 *
 * Dismisses on:
 *   - Swipe / drag the sheet down past a threshold (follow-the-finger)
 *   - Tap on the backdrop
 *   - Tap on a tile (after navigation kicks in)
 *   - Escape key
 *
 * Locks body scroll while open so the page behind can't drift under the
 * operator's finger; the tile grid scrolls internally if it's taller than
 * the sheet's max height.
 */

type SheetItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const GROUPS: { title: string; items: SheetItem[] }[] = [
  {
    title: "Dispatch",
    items: [
      { href: "/admin/dispatch/trips", label: "Trips", Icon: IconRoute },
      { href: "/admin/dispatch/reach", label: "Reach", Icon: IconMail },
      {
        href: "/admin/dispatch/receivables",
        label: "Receivables",
        Icon: IconCoins,
      },
    ],
  },
  {
    title: "Customers",
    items: [
      { href: "/admin/quotes", label: "Quotes", Icon: IconTruck },
      { href: "/admin/applications", label: "Applications", Icon: IconBadge },
    ],
  },
  {
    title: "Truck",
    items: [
      { href: "/admin/maintenance", label: "Maintenance", Icon: IconWrench },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/admin/accounting", label: "Accounting", Icon: IconReceipt },
      { href: "/admin/previews", label: "Email Previews", Icon: IconMail },
      { href: "/admin/settings", label: "Settings", Icon: IconSettings },
    ],
  },
];

// Drag further than this (px) and releasing dismisses the sheet.
const CLOSE_THRESHOLD = 110;

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

  // Follow-the-finger drag state. dragY is how far the sheet is pulled down;
  // `dragging` drives the transition (none while the finger is down, a smooth
  // snap-back on release). draggingRef mirrors it for the touch handlers so a
  // move event is never dropped waiting on a state flush.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Begin a dismiss-drag. From the handle/header it always starts; from the
  // scrollable grid it only starts when already scrolled to the top, so a
  // downward pull there dismisses rather than fighting the scroll.
  function beginDrag(clientY: number, fromHandle: boolean) {
    if (!fromHandle && (scrollRef.current?.scrollTop ?? 0) > 0) return;
    startYRef.current = clientY;
    draggingRef.current = true;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!draggingRef.current) return;
    const dy = e.touches[0].clientY - startYRef.current;
    // Only track downward movement; an upward pull rests at 0.
    setDragY(dy > 0 ? dy : 0);
  }

  function endDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    // Always settle back to 0 (snaps back if under threshold; harmless before
    // the close unmounts if over it) so the next open starts flush.
    setDragY(0);
    if (dragY > CLOSE_THRESHOLD) onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="More"
      data-shell="moresheet"
      className="fixed inset-0 z-50 lg:hidden"
    >
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-2xl bg-graphite-2 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-12px_40px_rgba(0,0,0,0.6)]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.22s ease-out",
        }}
        onTouchMove={onTouchMove}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
      >
        {/* Brand-red accent strip along the sheet's top edge. */}
        <div
          aria-hidden
          className="h-1 w-full bg-gradient-to-r from-accent via-[#e0434a] to-accent"
        />

        {/* Drag handle + header — the primary grab zone. touch-none stops the
            browser from scrolling while the handle is being dragged. */}
        <div
          className="touch-none"
          onTouchStart={(e) => beginDrag(e.touches[0].clientY, true)}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-white/25" />
          <div className="mt-2 flex items-center justify-between gap-3 px-5 pb-1">
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight text-white">
                More
              </p>
              <p className="text-[11px] leading-tight text-on-dark-dim">
                Jump anywhere in the portal
              </p>
            </div>
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-on-dark-dim transition-colors hover:bg-white/15 hover:text-white active:scale-95"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="mt-1 max-h-[66vh] space-y-4 overflow-y-auto px-4 pb-3 pt-1"
          onTouchStart={(e) => beginDrag(e.touches[0].clientY, false)}
        >
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#e0434a]">
                {group.title}
              </p>
              {/* Grouped as a single elevated card with hairline row dividers —
                  clear structure over the flat graphite backdrop. */}
              <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={
                        "relative flex items-center gap-3 px-3.5 py-3 transition-colors active:bg-white/[0.07] " +
                        (active ? "bg-accent/[0.14]" : "hover:bg-white/[0.04]")
                      }
                    >
                      {/* Active row: brand-red left indicator. */}
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent"
                        />
                      ) : null}
                      <span
                        className={
                          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg " +
                          (active
                            ? "bg-accent text-white"
                            : "bg-accent/15 text-[#e0434a]")
                        }
                      >
                        <item.Icon className="h-[19px] w-[19px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold leading-tight text-white">
                        {item.label}
                      </span>
                      <IconChevronRight
                        className={
                          "h-4 w-4 shrink-0 " +
                          (active ? "text-[#e0434a]" : "text-white/25")
                        }
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
