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
 * Resets scroll to 0 on every pathname/searchParams change (period,
 * filters, sort, page) so a stale scroll position from a longer list
 * never carries over onto a shorter one after navigating — a real, if
 * secondary, issue in its own right. NOTE: this was originally written as
 * a (mis)diagnosed fix for the Load Board "invisible row" bug; live DOM
 * inspection later proved that bug was actually DataList's sticky
 * `<thead>` landing at the wrong offset even at scrollTop 0 and painting
 * over the body row underneath it — fixed by dropping `sticky` from
 * DataList's header entirely (see DataList.tsx). This scroll-reset stays
 * because it's independently correct, not because it was ever the cause.
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
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
        {children}
      </div>
    </div>
  );
}
