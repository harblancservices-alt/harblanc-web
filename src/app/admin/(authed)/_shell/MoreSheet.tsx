"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  IconClipboard,
  IconCoins,
  IconMail,
  IconRoute,
  IconSettings,
  IconWrench,
} from "./icons";

/**
 * Level 4 — More sheet (mobile + tablet).
 *
 * Bottom sheet triggered from PortalBottomNav's More button — the mobile/tablet
 * home for every admin destination that didn't earn a top-level nav slot.
 * Desktop expands these inline in PortalSidebar and never opens this sheet
 * (lg:hidden).
 *
 * Buttons, not a menu: items are a 2-column grid of icon tiles with a short
 * label and no prose description — tidier and more tappable than the old
 * icon+title+subtitle+chevron rows.
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
      { href: "/admin/operations", label: "Operations", Icon: IconClipboard },
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
        className="absolute inset-x-0 bottom-0 border-t border-graphite-line bg-graphite pb-[max(env(safe-area-inset-bottom),1rem)]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.22s ease-out",
        }}
        onTouchMove={onTouchMove}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
      >
        {/* Drag handle + title — the primary grab zone. touch-none stops the
            browser from scrolling while the handle is being dragged. */}
        <div
          className="touch-none pb-1"
          onTouchStart={(e) => beginDrag(e.touches[0].clientY, true)}
        >
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-white/25" />
          <p className="mt-3 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-on-dark-dim">
            More
          </p>
        </div>

        <div
          ref={scrollRef}
          className="mt-1 max-h-[70vh] overflow-y-auto px-4 pb-2"
          onTouchStart={(e) => beginDrag(e.touches[0].clientY, false)}
        >
          {GROUPS.map((group) => (
            <div key={group.title} className="mt-2">
              <p className="px-1 pt-2 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-on-dark-dim">
                {group.title}
              </p>
              <div className="grid grid-cols-2 gap-2">
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
                        // Tiles sit on a clearly lighter surface than the dark
                        // sheet behind them so each button stands out. A soft
                        // resting shadow gives depth; on tap the tile sinks and
                        // darkens (scale down + brightness drop + shadow drops)
                        // so it feels pressed. Active tile keeps the accent ring.
                        "flex items-center gap-2.5 rounded-xl border px-3 py-3 shadow-md transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.97] active:brightness-90 active:shadow-sm " +
                        (active
                          ? "border-accent bg-white/[0.14] ring-1 ring-accent"
                          : "border-white/10 bg-white/[0.09] hover:bg-white/[0.12]")
                      }
                    >
                      <span
                        className={
                          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] " +
                          (active ? "text-accent" : "text-on-dark-dim")
                        }
                      >
                        <item.Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-tight text-white">
                        {item.label}
                      </span>
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
