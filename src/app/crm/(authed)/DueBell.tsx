"use client";

import { useCallback } from "react";

/**
 * The "What's next" due-work bell — a single glance-level cue that rides in the
 * header of the dashboard's "What's next" card, beside the heading. It renders
 * the caller's total due count (overdue tasks + due-today + call-backs +
 * contact follow-ups, already tallied on that page, so there is NO second
 * fetch) as a red badge on a bell icon.
 *
 * When anything is due the bell periodically rings and the badge pulses — the
 * same mostly-idle attention cadence the admin alert bell uses (`.alert-bell` /
 * `.alert-badge` in globals.css, ~6s cycle, ~85% still), which already stops
 * under prefers-reduced-motion. When nothing is due it is a calm, badge-less,
 * un-animated icon.
 *
 * Clicking (only when something is due) smooth-scrolls to the work queue below,
 * since the queue cards themselves already list every item — the bell is the
 * summary, not a second copy of the list.
 *
 * Dashboard-only by design: it is not wired into the CRM shell or nav.
 */
export function DueBell({
  count,
  targetId,
}: {
  count: number;
  targetId?: string;
}) {
  const onClick = useCallback(() => {
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [targetId]);

  // Calm state — nothing due. No badge, no animation, muted white-on-dark
  // since this rides on the CardHead's graphite bar, not a white card.
  if (count <= 0) {
    return (
      <span
        aria-hidden
        title="You're all caught up"
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-bar-fg/50"
      >
        <BellGlyph />
      </span>
    );
  }

  const display = count > 99 ? "99+" : String(count);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${count} item${count === 1 ? "" : "s"} due — jump to your queue`}
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-bar-fg transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bar-fg"
    >
      {/* The ring animation rides on the icon only, not the whole button, so it
          reads as a bell ringing rather than the control thrashing. */}
      <span className="alert-bell inline-flex" aria-hidden>
        <BellGlyph />
      </span>

      {/* Count badge — the ring-2 in the bar colour cuts it cleanly out of the
          bell so the number stays legible even where it overlaps. */}
      <span
        aria-hidden
        className="alert-badge absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[11px] font-bold leading-none tabular-nums text-white shadow-e1 ring-2 ring-bar"
      >
        {display}
      </span>
    </button>
  );
}

/** The bell outline itself. Inlined (rather than pulled from the shell icon set)
 *  so this component is fully self-contained. currentColor-driven, 24px grid. */
function BellGlyph() {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
