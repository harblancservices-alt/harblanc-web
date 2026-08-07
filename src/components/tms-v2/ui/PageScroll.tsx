"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
 *
 * Bottom padding (mobile only) reserves room below the last row so the
 * fixed Fab (bottom-20, lg:hidden) and BottomNav never sit visually on top
 * of it once the list is scrolled all the way down — a `position: fixed`
 * element draws over scrolled content regardless of the scroll container's
 * own box, so the scroll container needs its own clearance, not just the
 * shell's.
 *
 * ROOT CAUSE FIX (the Load Board "invisible row"): this is a nested
 * overflow-y-auto container, not the window — Next.js resets window
 * scroll on navigation but has no idea this div exists, so a scrollTop
 * picked up on a longer list (e.g. a fuller month) survives a client-side
 * navigation to a shorter one (e.g. this period's single row). DataList's
 * sticky <thead> computes its "stuck" position from that SAME stale
 * scrollTop and immediately paints its opaque bg-panel band over wherever
 * that offset lands — which, on a one-row page, is exactly on top of the
 * only row there is. The row's text was never actually invisible (DOM/
 * get_page_text always had it); it was rendered normally and then covered
 * by the sticky header's own background, which reads as a blank white gap
 * since both are near-white cards. Resetting scroll to 0 on every
 * pathname/searchParams change (period, filters, sort, page — anything
 * that changes the row set) means the sticky header can never start
 * "stuck" over content that was never actually scrolled to.
 */
export function PageScroll({ header, children }: { header?: ReactNode; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname, searchParams]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {header ? <div className="flex shrink-0 flex-col gap-6">{header}</div> : null}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
        {children}
      </div>
    </div>
  );
}
