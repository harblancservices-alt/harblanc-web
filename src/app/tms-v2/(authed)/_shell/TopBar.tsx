"use client";

import Link from "next/link";
import { IconBell, IconPlus, IconSearch } from "@/lib/nav/icons";
import { useShellSearch } from "./ShellSearchProvider";

/**
 * Top strip — brand mark + a minimal, BORDERLESS top-right icon cluster
 * (search, notifications, quick-add, identity, sign out). No bar: no
 * border, no background — Brent's explicit ask was no "header" look
 * anywhere in /tms-v2 (nav.config.ts's registry drives the sidebar/bottom
 * nav, which already say what page you're on; this strip is just where
 * the account-level controls live, not a page header).
 *
 * Desktop-only (`hidden lg:flex` on the cluster) — on mobile these same
 * controls live in MoreSheet instead, so nothing is lost, it's just not
 * competing for space with the content on a small screen.
 *
 * Sign out posts to the EXISTING /admin/logout route handler
 * (src/app/admin/logout/route.ts) rather than a second copy — it signs
 * out the one shared Supabase Auth session (v2-architecture.md §7).
 */
export function TopBar({ email }: { email: string | null }) {
  const { setOpen } = useShellSearch();

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-4 md:px-8">
      <Link href="/tms-v2" prefetch={false} className="flex items-center gap-2 font-semibold text-fg">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[13px] font-bold text-white">
          H
        </span>
        <span className="hidden sm:inline">Harblanc</span>
      </Link>

      <div className="ml-auto hidden items-center gap-4 lg:flex">
        <button type="button" onClick={() => setOpen(true)} title="Search — ⌘K" aria-label="Search" className="text-fg-muted hover:text-fg">
          <IconSearch className="h-5 w-5" />
        </button>
        <button type="button" disabled title="Notifications — coming soon" aria-label="Notifications" className="text-fg-muted opacity-60">
          <IconBell className="h-5 w-5" />
        </button>
        <button type="button" disabled title="Quick add — coming soon" aria-label="Quick add" className="text-fg-muted opacity-60">
          <IconPlus className="h-5 w-5" />
        </button>
        {email ? <span className="text-[13px] text-fg-muted">{email}</span> : null}
        <form action="/admin/logout" method="post">
          <button type="submit" className="text-[13px] text-fg-muted hover:text-fg">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
