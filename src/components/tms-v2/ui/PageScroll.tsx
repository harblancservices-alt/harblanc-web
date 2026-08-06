import type { ReactNode } from "react";

/**
 * Per-page half of the app-style fixed-viewport layout (PortalShell.tsx
 * carries the shell half). `header` — PageHeader, KPI strip, filter bar —
 * stays pinned (shrink-0); `children` — the DataList/table and its
 * pagination footer — gets the ONE scroll container that actually moves.
 * This is what makes a long Load Board or Expenses ledger read as an app
 * panel instead of Brent's "Facebook hotdog scroll": the chrome around the
 * list never moves, only the list itself does.
 *
 * `header` is optional — a page with nothing worth pinning (a detail page,
 * Settings, a Previews lab) can pass just `children` and still gets the
 * h-full/overflow-y-auto safety net so its content scrolls internally
 * instead of being clipped by the shell's own overflow-hidden.
 */
export function PageScroll({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {header ? <div className="flex shrink-0 flex-col gap-6">{header}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
