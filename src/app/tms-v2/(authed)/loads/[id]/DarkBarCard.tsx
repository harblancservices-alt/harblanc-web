"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * The dark-bar collapsible card — mirrors legacy /admin's dispatch/loads/
 * [id] panel header (LoadDetailsCard/OdometerStatusCard/FinancialsPanel all
 * use the identical chevron + title + right-aligned actions bar, so the
 * three panels visually line up). Reuses the same --bar/--bar-fg tokens
 * KpiTile's `emphasis="dark"` already established, not a new color.
 * Auto-expands when the page loads at its own #id (a deep-linked alert),
 * same behavior CollapsibleSection already had.
 */
export function DarkBarCard({
  id,
  title,
  defaultOpen = false,
  headerAction,
  children,
}: {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (id && typeof window !== "undefined" && window.location.hash === `#${id}`) {
      setOpen(true);
    }
  }, [id]);

  return (
    <section id={id} className="scroll-mt-16 overflow-hidden rounded-xl border border-line shadow-e1">
      <div className="flex items-center justify-between gap-2 bg-bar px-4 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[14px] font-semibold text-bar-fg">
          <span className={`inline-block text-bar-fg/60 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            ›
          </span>
          {title}
        </button>
        {headerAction ? <div className="flex items-center gap-1.5">{headerAction}</div> : null}
      </div>
      {open ? <div className="bg-card p-4">{children}</div> : null}
    </section>
  );
}
