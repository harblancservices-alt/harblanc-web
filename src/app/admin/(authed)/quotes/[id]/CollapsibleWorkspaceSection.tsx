"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * CollapsibleWorkspaceSection — dark section panel with a header bar
 * that toggles the body open/closed.
 *
 * KEEP-MOUNTED via `display:none` rather than unmount, for two reasons:
 *
 *   1. PricingTab maintains internal Range/Finalized segmented-control
 *      state and PreviewModal instances. Unmounting would discard
 *      in-progress draft edits.
 *   2. DetailsTab's debounced auto-save (`scheduleSave`) lives in a
 *      useState hook. Unmounting cancels the in-flight debounce and
 *      drops the SaveStatusPill state across collapse cycles.
 *
 * The header bar always renders. When collapsed, an optional
 * `summary` slot fills the right side of the header — used to show
 * compact at-a-glance info like "$3,200 finalized" or "3 sent · BOL
 * pending" so the operator can scan the section without expanding it.
 *
 * The body uses `bg-card text-fg` so the legacy V3 tab content
 * has the light surface it expects. Phase B will port the inner
 * components to dark and this default body bg can flip then.
 */

export function CollapsibleWorkspaceSection({
  title,
  defaultOpen = false,
  summary,
  meta,
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** Right-side at-a-glance text shown in the collapsed header. */
  summary?: ReactNode;
  /** Optional sub-line under the title — e.g. "Auto-saves on edit". */
  meta?: ReactNode;
  /** Right-side interactive controls (e.g. links) rendered OUTSIDE the
   *  collapse toggle so they don't nest interactives inside a <button>. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-e2">
      {/* min-h-[48px] pins the header bar to the same height as the load page's
          custom panel headers (Financials / Odometer, both 48px) so a section
          with action buttons in the bar (e.g. Load details' Trip / Broker / Edit)
          lines up with them across columns instead of reading a few px off. Safe
          for quotes: it only grows a sub-48px header, never clips a taller one
          (the title + optional meta line still expand the bar past the floor). */}
      <div className="flex min-h-[48px] items-stretch bg-bar">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#2e313a]"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Chevron open={open} />
            <div className="min-w-0">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
                {title}
              </h2>
              {meta ? (
                <p className="mt-[2px] truncate font-mono text-[10px] text-bar-fg/60">
                  {meta}
                </p>
              ) : null}
            </div>
          </div>
          {summary ? (
            <div className="min-w-0 flex-1 truncate text-center">
              <span className="font-mono text-[15px] leading-none tabular-nums text-bar-fg/85">
                {summary}
              </span>
            </div>
          ) : null}
        </button>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2 pl-2 pr-3">
            {actions}
          </div>
        ) : null}
      </div>
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className={open ? "bg-card text-fg" : "hidden"}
      >
        {children}
      </div>
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={
        "shrink-0 text-bar-fg/70 transition-transform " +
        (open ? "rotate-90" : "")
      }
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
