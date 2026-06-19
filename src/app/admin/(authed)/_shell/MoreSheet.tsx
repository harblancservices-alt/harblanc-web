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
  IconWrench,
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
  desc: string;
  chip: string;
  Icon: ComponentType<{ className?: string }>;
};

const GROUPS: { title: string; items: SheetItem[] }[] = [
  {
    title: "Dispatch",
    items: [
      {
        href: "/admin/dispatch/trips",
        label: "Trips",
        desc: "Group loads & track profit",
        chip: "bg-emerald-50 text-emerald-700",
        Icon: IconRoute,
      },
      {
        href: "/admin/dispatch/backhaul",
        label: "Backhaul",
        desc: "Find return loads",
        chip: "bg-sky-50 text-sky-700",
        Icon: IconMail,
      },
    ],
  },
  {
    title: "Customers",
    items: [
      {
        href: "/admin/loads",
        label: "Quotes",
        desc: "Customer quote requests",
        chip: "bg-blue-50 text-blue-700",
        Icon: IconTruck,
      },
      {
        href: "/admin/applications",
        label: "Applications",
        desc: "Driver applications",
        chip: "bg-violet-50 text-violet-700",
        Icon: IconBadge,
      },
    ],
  },
  {
    title: "Truck",
    items: [
      {
        href: "/admin/maintenance",
        label: "Maintenance",
        desc: "Preventative service schedule",
        chip: "bg-orange-50 text-orange-700",
        Icon: IconWrench,
      },
    ],
  },
  {
    title: "Business",
    items: [
      {
        href: "/admin/accounting",
        label: "Accounting",
        desc: "Payments, fees & A/R",
        chip: "bg-green-50 text-green-700",
        Icon: IconReceipt,
      },
      {
        href: "/admin/previews",
        label: "Previews",
        desc: "Email previews",
        chip: "bg-amber-50 text-amber-700",
        Icon: IconMail,
      },
      {
        href: "/admin/settings",
        label: "Settings",
        desc: "Fuel defaults & account",
        chip: "bg-elevated text-fg-muted",
        Icon: IconSettings,
      },
    ],
  },
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
        <div className="mt-2 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-5 pt-3 pb-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-fg-subtle">
                {group.title}
              </p>
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
                      "flex items-center gap-3 px-4 py-2.5 transition-colors " +
                      (active ? "bg-elevated" : "active:bg-elevated")
                    }
                  >
                    <span
                      className={
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
                        item.chip
                      }
                    >
                      <item.Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold leading-tight text-fg">
                        {item.label}
                      </p>
                      <p className="text-[11.5px] text-fg-muted">{item.desc}</p>
                    </div>
                    <IconChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
