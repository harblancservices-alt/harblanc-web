"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client for the admin login form. Uses the publishable
 * (anon) key — safe to ship to the browser. RLS gates what can be read or
 * written; Supabase Auth itself runs entirely against this client.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return createBrowserClient(url, key);
}
