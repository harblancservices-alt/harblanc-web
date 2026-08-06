import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Breadcrumb } from "./Breadcrumb";

/**
 * The responsive app shell — desktop sidebar + mobile bottom nav, both
 * driven by the single src/lib/nav/nav.config.ts source of truth
 * (v2-architecture.md §2). `.tms-v2-light` scopes the design-system tokens
 * added to globals.css to this subtree only, exactly like `.admin-light`
 * and `.crm-light` already do for their own route groups.
 *
 * App-style fixed viewport (2026-08 layout fix, "not a Facebook-style
 * hotdog scroll"): the root is capped at `h-dvh` with `overflow-hidden` so
 * the DOCUMENT never grows taller than the screen — dvh (not vh) so mobile
 * browser chrome showing/hiding doesn't clip or double-scroll. This is
 * self-contained to this subtree: the shared root layout (src/app/layout.tsx)
 * still lets the marketing site scroll normally, since only this div caps
 * its own height regardless of its ambient flex container's sizing. TopBar
 * and Sidebar no longer need sticky/position hacks — nothing above them
 * scrolls anymore, so they simply sit in the fixed shell. The content
 * wrapper below Breadcrumb is the ONE scroll container every page mounts
 * into; pages that want their header/KPI-strip/filter-bar pinned above an
 * internally-scrolling list use <PageScroll> inside it (components/tms-v2/
 * ui/PageScroll.tsx) — for a page that doesn't opt into that split, this
 * wrapper is still the safety net that scrolls instead of clipping.
 */
export function PortalShell({ email, children }: { email: string | null; children: ReactNode }) {
  return (
    <div className="tms-v2-light flex h-dvh flex-col overflow-hidden bg-canvas text-fg">
      <TopBar email={email} />
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1">
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-24 pt-6 md:px-8 md:pb-8 lg:pb-8">
          <Breadcrumb />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
