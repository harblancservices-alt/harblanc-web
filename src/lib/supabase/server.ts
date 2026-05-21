import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for server-side route handlers using the publishable
 * (anon) key. RLS policies on the table determine what is allowed.
 *
 * For the /api/quote route, the `anon can insert quote requests` policy
 * grants the insert; nothing else is permitted.
 */
export function createAnonServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "harblanc-web/quote-api" } },
  });
}

/**
 * Service-role Supabase client — bypasses RLS. Server-side only.
 * NEVER expose this client or the SUPABASE_SECRET_KEY to the browser.
 *
 * Used by the /api/quote route so that .insert(...).select().single()
 * returns the freshly written row (id + created_at) without needing a
 * separate anon SELECT policy on the table.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "harblanc-web/quote-api-service" } },
  });
}

/**
 * Supabase client for server components, server actions, and route handlers
 * that need to read the authenticated admin user. Reads/writes Supabase Auth
 * cookies via the Next.js cookies() store, so it integrates with the
 * @supabase/ssr session model used by the admin middleware.
 *
 * NOTE: writing cookies from a server component is a no-op (silenced via
 * try/catch). Cookie REFRESH happens in middleware, so getUser() still
 * returns the correct session on every request as long as middleware
 * runs on the path.
 */
export async function createServerComponentClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server components cannot set cookies. Middleware handles refresh.
        }
      },
    },
  }) as unknown as SupabaseClient;
}
