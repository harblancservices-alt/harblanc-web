"use client";

import { useState } from "react";
import { Card, ZEBRA_ROWS } from "./_shell/ui";
import { IconBell, IconChevronDown } from "./_shell/icons";
import { NeedsAttentionRow, type NeedsAttentionCompany } from "./NeedsAttentionRow";

/**
 * NEEDS ATTENTION — collapsible, closed by default, same header-as-toggle
 * shape as RecentActivityCard. Unlike Recent Activity this one is urgent, so
 * while it's collapsed AND there's something waiting, the bell icon rings
 * and the count badge pulses on a slow periodic cycle (`.alert-bell` /
 * `.alert-badge`, defined once in globals.css) — a glance-level cue, not a
 * constant flash: ~85% of each 6s cycle is perfectly still. Both stop the
 * moment the panel is open (you're already looking at it) and globals.css
 * disables them entirely under prefers-reduced-motion, falling back to a
 * plain static red badge. Zero companies swaps the whole header calm — no
 * red, no bell fill, no animation, just "All clear".
 */
export function NeedsAttentionSection({ companies }: { companies: NeedsAttentionCompany[] }) {
  const [open, setOpen] = useState(false);
  const count = companies.length;
  const hasAlerts = count > 0;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 border-b border-graphite-line bg-bar px-4 py-2.5 text-left transition-colors hover:bg-graphite-line/60"
      >
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center ${
            hasAlerts ? "bg-bad text-white" : "bg-bar-fg/10 text-bar-fg/70"
          } ${hasAlerts && !open ? "alert-bell" : ""}`}
        >
          <IconBell width={15} height={15} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13.5px] font-bold tracking-tight text-bar-fg">Needs attention</h2>
          <p className="truncate text-[11px] font-medium text-bar-fg/70">
            {hasAlerts ? `${count} gone quiet` : "All clear"}
          </p>
        </div>

        {hasAlerts && (
          <span
            className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center bg-bad px-1.5 text-[12px] font-bold tabular-nums text-white shadow-e1 ${
              !open ? "alert-badge" : ""
            }`}
          >
            {count}
          </span>
        )}

        <IconChevronDown
          width={18}
          height={18}
          className={`shrink-0 text-bar-fg transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        (count === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
            Nothing needs attention. Every account is being worked.
          </p>
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {companies.map((c) => (
              <NeedsAttentionRow key={c.id} company={c} />
            ))}
          </ul>
        ))}
    </Card>
  );
}
