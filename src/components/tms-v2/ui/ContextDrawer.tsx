import type { ReactNode } from "react";
import Link from "next/link";
import { IconX } from "@/lib/nav/icons";
import { ScrollLock } from "./ScrollLock";

type ContextDrawerProps = {
  title: string;
  subtitle?: ReactNode;
  /** URL to navigate to on close — a plain Link, not client state, so the
   * drawer's open/closed-ness is server-rendered from the page's own
   * searchParams (v2-architecture.md's URL-state-only discipline, same
   * rule LoadBoardFilters follows). */
  closeHref: string;
  children: ReactNode;
};

/**
 * The right-side CONTEXT DRAWER shell anchor (v2-design.md's workspace
 * pattern): a row selection slides this in beside the ~70%-width hero
 * region on desktop, and collapses to a bottom sheet on mobile — Brent
 * works from his phone at fuel islands, so detail can't only work as a
 * cramped side panel. Server-renderable: no client state of its own, the
 * caller decides whether to render it at all based on a `?id=` searchParam.
 * Rendered twice (once per breakpoint) rather than one repositioned node —
 * a fixed-bottom-sheet and a static-inline-panel need different DOM
 * ancestry (portal-style overlay vs. in-flow flex child), not just
 * different classes on the same element.
 *
 * <ScrollLock/> (a tiny client-only leaf, same composition trick as
 * ScrollToHash.tsx) locks document.body scroll for as long as this stays
 * mounted — its mount/unmount IS the open/closed state here, so there's
 * no boolean to hang the effect on directly without giving this whole
 * component a "use client" boundary it doesn't otherwise need. Fixes a
 * scroll-bleed bug: without it, scrolling past the mobile bottom sheet's
 * own content could chain into the page behind it.
 */
export function ContextDrawer({ title, subtitle, closeHref, children }: ContextDrawerProps) {
  return (
    <>
      <ScrollLock />
      {/* Mobile (<lg): bottom sheet overlay. */}
      <div className="fixed inset-0 z-50 flex items-end lg:hidden">
        <Link href={closeHref} prefetch={false} className="absolute inset-0 touch-none bg-black/50 backdrop-blur-[1px]" aria-hidden />
        <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-line bg-card shadow-e3">
          <DrawerHeader title={title} subtitle={subtitle} closeHref={closeHref} />
          <div className="no-scrollbar flex-1 overscroll-contain overflow-y-auto px-4 pb-6">{children}</div>
        </div>
      </div>

      {/* Desktop (>=lg): inline panel beside the hero region, filling the
          fixed-viewport shell's own height rather than a sticky/max-h hack
          — the shell (PortalShell) no longer lets the document scroll, so
          this panel's parent row already has a definite height to fill. */}
      <div className="hidden h-full shrink-0 lg:block lg:w-[400px]">
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-card shadow-e2">
          <DrawerHeader title={title} subtitle={subtitle} closeHref={closeHref} />
          <div className="no-scrollbar flex-1 overscroll-contain overflow-y-auto px-4 pb-4">{children}</div>
        </div>
      </div>
    </>
  );
}

function DrawerHeader({ title, subtitle, closeHref }: { title: string; subtitle?: ReactNode; closeHref: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="truncate text-[16px] font-semibold text-fg">{title}</h2>
        {subtitle ? <div className="text-[13px] text-fg-muted">{subtitle}</div> : null}
      </div>
      <Link href={closeHref} prefetch={false} aria-label="Close" className="shrink-0 text-fg-muted hover:text-fg">
        <IconX className="h-5 w-5" />
      </Link>
    </div>
  );
}
