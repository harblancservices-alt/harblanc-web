import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { Breadcrumb } from "./Breadcrumb";
import { ShellSearchProvider } from "./ShellSearchProvider";
import { CommandPalette } from "./CommandPalette";

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
 * its own height regardless of its ambient flex container's sizing. The
 * content wrapper below Breadcrumb is the ONE scroll container every page
 * mounts into; pages that want their header/KPI-strip/filter-bar pinned
 * above an internally-scrolling list use <PageScroll> inside it
 * (components/tms-v2/ui/PageScroll.tsx) — for a page that doesn't opt into
 * that split, this wrapper is still the safety net that scrolls instead of
 * clipping.
 *
 * NO top bar, on any viewport (2026-08, Brent's explicit ask): there is no
 * TopBar component here at all, not a borderless/collapsed one — its
 * vertical space is gone too, not just its border/background. Everything
 * it used to hold (brand mark, search, notifications, account identity,
 * sign out) moved into Sidebar (desktop) and MoreSheet (mobile, already
 * carrying these since the borderless-TopBar pass) — see Sidebar.tsx's
 * header comment. Content starts flush under Breadcrumb.
 */
export function PortalShell({ email, children }: { email: string | null; children: ReactNode }) {
  return (
    <ShellSearchProvider>
      <div className="tms-v2-light flex h-dvh flex-col overflow-hidden bg-canvas text-fg">
        {/* max-w-[1400px] is a mobile/tablet no-op (real widths there never
            get near it) but was ALSO capping desktop, leaving a huge empty
            gutter on wide monitors (Brent's report, 2026-08-08) — lg:
            removes the cap so the sidebar+content row fills the real
            viewport width instead. <main>'s own px-4/md:px-8/xl:px-12
            padding below is what keeps a "sensible gutter" instead of
            content running edge-to-edge on very wide screens. */}
        <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 lg:max-w-none">
          <Sidebar email={email} />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-24 pt-6 md:px-8 md:pb-8 lg:pb-8 xl:px-12">
            <Breadcrumb />
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
          </main>
        </div>
        <BottomNav email={email} />
      </div>
      <CommandPalette />
    </ShellSearchProvider>
  );
}
