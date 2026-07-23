import { cookies } from "next/headers";

/**
 * DEMO MODE — the two-pipe isolation switch.
 *
 * Demo mode lets the whole admin portal be shown to people with rich, curated
 * FAKE data while the real database is never read or written. The owner's #1
 * requirement: real data and demo data must be two separate pipes that cannot
 * cross. This module is the single seam that guarantees that by construction.
 *
 *   READS  — every page's data fetcher checks `isDemoMode()` and returns the
 *            static in-memory dataset (src/lib/demo/demoData.ts) BEFORE it ever
 *            constructs a Supabase client, so no real row can surface in demo.
 *
 *   WRITES — every mutating server action calls `blockedByDemo()` at its very
 *            TOP, before any Supabase call. When demo is on it returns true and
 *            the action no-ops (returning a benign success-shaped value), so no
 *            demo interaction can ever mutate the real DB or send a real email.
 *
 * The flag lives in a cookie so both server components and server actions can
 * read it with zero client round-trips. Only the Settings page toggles it.
 */

/** Cookie name — `hb-` prefix matches the app's one existing custom cookie. */
export const DEMO_COOKIE = "hb-demo";

/**
 * True when the admin portal is in demo mode. Server-only (reads the cookie
 * store via next/headers). Safe to call from any server component, page
 * fetcher, or server action.
 */
export async function isDemoMode(): Promise<boolean> {
  try {
    const store = await cookies();
    return store.get(DEMO_COOKIE)?.value === "1";
  } catch {
    // cookies() throws outside a request scope (e.g. during some build-time
    // evaluation). Absent a request there is no demo session — treat as off.
    return false;
  }
}

/**
 * The write-side guard. Call this as the FIRST statement of every mutating
 * server action:
 *
 *   export async function updateLoad(id, fd) {
 *     if (await blockedByDemo()) return;   // <- before any Supabase call
 *     ...
 *   }
 *
 * Returning true means "demo mode is on — do nothing, pretend it worked". The
 * action must then return its own benign success-shaped value (or just return
 * for a `Promise<void>` action). Because the check runs before the service-role
 * client is ever created, a guarded action can never reach the DB in demo mode.
 */
export async function blockedByDemo(): Promise<boolean> {
  return isDemoMode();
}
