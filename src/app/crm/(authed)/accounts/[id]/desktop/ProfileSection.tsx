"use client";

import type { ReactNode } from "react";

/**
 * One section of the rebuilt company profile.
 *
 * THE PAGE IS NOW ONE SCROLL, NOT TABS (Brent, 2026-08-26). Five tabs meant
 * five panels mounted at once — including Shipments, empty on 98 of 99
 * companies — and hid the two things every company has (history, people)
 * behind a click. Sections replace them, and each one is in exactly one of
 * three states:
 *
 *   OPEN      always rendered, always expanded. The eleven things worth
 *             seeing without asking.
 *   COLLAPSED rendered, closed, one click to open. Things that matter when
 *             you want them and are noise when you don't.
 *   ABSENT    not rendered at all when there is nothing in it. Not an empty
 *             card, not a "nothing here yet" — gone.
 *
 * That third state is the one that does the work. The old page hid empty
 * cards individually but still reserved the structure around them, so a
 * typical profile read as a scattering of small boxes separated by gaps
 * where other boxes would have been.
 *
 * `count` shows in the header when given. On a collapsed section it is the
 * whole point: "Details · 2 of 16" tells you whether opening it is worth
 * the click, which a bare chevron does not.
 *
 * Built on <details>, so it works without JavaScript, is keyboard-operable
 * for free, and Ctrl-F finds text inside a closed section in most browsers.
 *
 * A CLIENT component only because the header action needs stopPropagation.
 * Its children are still Server Components — they arrive already rendered,
 * as slots, which is the pattern this route already relies on and the reason
 * no function prop ever crosses the boundary here.
 */
export function ProfileSection({
  title,
  count,
  action,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Shown next to the title. A string so callers can say "2 of 16" as
   * easily as "4". */
  count?: string | null;
  /** A button that belongs to this section — "+ Add location", "Log a
   * call". Rendered in the header, OUTSIDE the summary, so clicking it
   * never toggles the section open or shut. */
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-line-strong bg-card shadow-e1 [&[open]>summary]:border-b [&[open]>summary]:border-line"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 hover:bg-accent-bg">
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="h-3 w-3 shrink-0 text-fg-subtle transition-transform group-open:rotate-90"
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[13px] font-bold tracking-tight text-fg">{title}</span>
        {count && <span className="text-[12px] font-semibold text-fg-subtle">{count}</span>}
        {action && (
          // Inside the <summary> a click would toggle the section, so the
          // action sits in its own span that stops the event. It still
          // reads as part of the header row.
          <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        )}
      </summary>
      <div className="px-4 py-3">{children}</div>
    </details>
  );
}

/**
 * An always-open section — same chrome, no disclosure, no toggle.
 *
 * A separate component rather than `<ProfileSection defaultOpen>` because
 * these are not collapsible at all: rendering a chevron the user can close
 * on the eleven things Brent said must always be visible would quietly let
 * the page become the old one again.
 */
export function ProfileBlock({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: string | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line-strong bg-card shadow-e1">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[13px] font-bold tracking-tight text-fg">{title}</span>
        {count && <span className="text-[12px] font-semibold text-fg-subtle">{count}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
