import Link from "next/link";
import { IconSearch, IconBell, IconPlus } from "@/lib/nav/icons";

/**
 * Top bar — brand, search placeholder (command palette lands in a later
 * phase), notification bell placeholder, quick-add placeholder, identity +
 * sign out. Sign out posts to the EXISTING /admin/logout route handler
 * (src/app/admin/logout/route.ts) rather than a second copy — it signs out
 * the one shared Supabase Auth session and redirects to /admin/login,
 * which is correct for /tms-v2 too (v2-architecture.md §7: one session,
 * one login screen for the whole authed surface).
 */
export function TopBar({ email }: { email: string | null }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-panel px-4 md:px-8">
      <Link href="/tms-v2" prefetch={false} className="flex items-center gap-2 font-semibold text-fg">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[13px] font-bold text-white">
          H
        </span>
        <span className="hidden sm:inline">Harblanc</span>
      </Link>

      <div className="ml-2 hidden max-w-sm flex-1 items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5 text-[13px] text-fg-muted md:flex">
        <IconSearch className="h-4 w-4" />
        <span>Search or jump to…</span>
        <kbd className="ml-auto rounded border border-line-strong px-1.5 py-0.5 text-[11px]">⌘K</kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          disabled
          title="Notifications — coming soon"
          className="text-fg-muted opacity-60"
          aria-label="Notifications"
        >
          <IconBell className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled
          title="Quick add — coming soon"
          className="hidden items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white opacity-60 sm:inline-flex"
        >
          <IconPlus className="h-4 w-4" />
          New
        </button>
        {email ? <span className="hidden text-[13px] text-fg-muted md:inline">{email}</span> : null}
        <form action="/admin/logout" method="post">
          <button type="submit" className="text-[13px] text-fg-muted hover:text-fg">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
