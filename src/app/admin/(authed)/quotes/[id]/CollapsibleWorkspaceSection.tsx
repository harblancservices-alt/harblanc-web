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
 * The body uses `bg-white text-black` so the legacy V3 tab content
 * has the light surface it expects. Phase B will port the inner
 * components to dark and this default body bg can flip then.
 */

export function CollapsibleWorkspaceSection({
  title,
  defaultOpen = false,
  summary,
  meta,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** Right-side at-a-glance text shown in the collapsed header. */
  summary?: ReactNode;
  /** Optional sub-line under the title — e.g. "Auto-saves on edit". */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left transition-colors hover:bg-zinc-900/80"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Chevron open={open} />
          <div className="min-w-0">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-200">
              {title}
            </h2>
            {meta ? (
              <p className="mt-[2px] truncate font-mono text-[9px] text-zinc-500">
                {meta}
              </p>
            ) : null}
          </div>
        </div>
        {summary ? (
          <div className="shrink-0 truncate text-right">
            <span className="font-mono text-[10.5px] tabular-nums text-zinc-300">
              {summary}
            </span>
          </div>
        ) : null}
      </button>
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className={open ? "bg-zinc-950 text-zinc-100" : "hidden"}
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
        "shrink-0 text-zinc-500 transition-transform " +
        (open ? "rotate-90" : "")
      }
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
