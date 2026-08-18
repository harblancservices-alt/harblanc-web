import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /auth/callback
 *
 * Entry point for any Supabase Auth flow that emails a link back to the
 * site — password recovery, magic links, OAuth, email confirmations.
 *
 * Steps:
 *   1. Read `code` and `next` from the query string.
 *   2. Exchange the code for a session via @supabase/ssr (writes session
 *      cookies). The same exchange works in dev (localhost) and prod
 *      because it's keyed off the request origin.
 *   3. Redirect the user to `next` (sanitised so it must start with `/`
 *      and can't be a protocol-relative URL); absent a `next`, land on
 *      tms-v2's dashboard rather than admin's, since this route has no way
 *      to tell which app triggered the auth flow.
 *
 * If anything fails, bounce to /login with an error param.
 *
 * Security:
 *   - `code` is signed by Supabase — invalid codes return an error.
 *   - `next` is sanitised to prevent open-redirect attacks. Only same-origin
 *     paths starting with `/` (not `//`) are allowed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/tms-v2";

  // Sanitise next: must be a same-origin path, not //evil.com
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/tms-v2";

  if (code) {
    const supabase = await createServerComponentClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  const fallback = new URL("/login", url.origin);
  fallback.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(fallback);
}
