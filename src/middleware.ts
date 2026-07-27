import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Auth middleware for /admin/** routes.
 *
 *   /admin/login                  → publicly reachable (sign-in screen)
 *   /admin/reset-password         → publicly reachable (request reset email)
 *   /admin/**  (everything else)  → requires a Supabase Auth session whose
 *                                   email matches ADMIN_EMAIL
 *
 *   /auth/callback                → handled OUTSIDE this middleware via the
 *                                   matcher below. Listed in PUBLIC_PATH_PREFIXES
 *                                   as defense-in-depth: if the matcher is ever
 *                                   widened, the explicit bypass prevents the
 *                                   PKCE code exchange from being intercepted by
 *                                   the auth gate (which would cause a redirect
 *                                   loop because the callback IS the thing that
 *                                   sets the session in the first place).
 *
 * Also refreshes the Supabase session cookies on every matching request so
 * server components can rely on getUser(). Per @supabase/ssr docs, no code
 * may run between createServerClient() and supabase.auth.getUser() or the
 * cookie refresh can land in a broken state.
 */

// Exact admin paths (and their /sub-paths) that bypass the auth gate.
// Centralised so future additions are a one-line edit and there's no risk
// of an inline `if (pathname === ... || pathname.startsWith(...))` chain
// drifting out of sync with the public-paths intent.
const PUBLIC_ADMIN_PATHS = new Set<string>([
  "/admin/login",
  "/admin/reset-password",
]);

// Path prefixes that bypass the middleware entirely. Today the matcher
// already excludes anything outside /admin/**, so this is defensive only —
// if the matcher is ever broadened (e.g. to share session cookie refresh
// across the whole site), the explicit list keeps these routes public.
const PUBLIC_PATH_PREFIXES: readonly string[] = ["/auth/callback"];

function isPublicAdminPath(pathname: string): boolean {
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return true;
  for (const p of PUBLIC_ADMIN_PATHS) {
    if (pathname.startsWith(p + "/")) return true;
  }
  return false;
}

function isPublicPrefix(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// The single public CRM path — the sign-in screen. Everything else under
// /crm requires a Supabase session. Kept separate from the admin allowlist so
// the two auth surfaces never share configuration.
function isPublicCrmPath(pathname: string): boolean {
  return pathname === "/crm/login" || pathname.startsWith("/crm/login/");
}

/**
 * CRM session gate. Refreshes the Supabase session cookies (same @supabase/ssr
 * contract as the admin gate — nothing runs between createServerClient() and
 * getUser()) and redirects to /crm/login when there is no valid session. This
 * shares NO configuration with the admin gate: it never reads ADMIN_EMAIL and
 * never redirects to /admin.
 */
async function crmGate(request: NextRequest, pathname: string) {
  if (isPublicCrmPath(pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/crm/login";
    redirectUrl.searchParams.set("error", "misconfigured");
    return NextResponse.redirect(redirectUrl);
  }

  const cookiesToSet: { name: string; value: string; options?: CookieOptions }[] =
    [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.push(...toSet);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/crm/login";
    return NextResponse.redirect(redirectUrl);
  }

  // Session present. Forward the verified id to the CRM layout (which still
  // resolves crm_profiles for the org check) and re-apply refreshed cookies.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-crm-user-id", user.id);
  if (user.email) requestHeaders.set("x-crm-user-email", user.email);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Defense-in-depth: explicit bypass for callback and other public-prefix
  // routes. Today the matcher already excludes these; this guarantees they
  // stay public even if the matcher is widened later.
  if (isPublicPrefix(pathname)) {
    return NextResponse.next();
  }

  // ── CRM (Hello Hotshot) gate ────────────────────────────────────────────
  // Entirely INDEPENDENT of the /admin allowlist below: no ADMIN_EMAIL, no
  // shared allowlist, no shared state. The only question here is "does the
  // request carry a valid Supabase Auth session?" — if not, bounce to the
  // CRM's own login. Org membership (crm_profiles) is enforced separately in
  // the CRM layout so a signed-in dispatch admin still can't see CRM data.
  if (pathname.startsWith("/crm")) {
    return crmGate(request, pathname);
  }

  // Belt-and-suspenders for the matcher: only enforce under /admin/**.
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Public admin sub-paths (login, reset-password) bypass the session gate
  // so locked-out admins can sign in or request a recovery email.
  if (isPublicAdminPath(pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    redirectUrl.searchParams.set("error", "misconfigured");
    return NextResponse.redirect(redirectUrl);
  }

  // Collect any session cookies the refresh wants to set; they are applied to
  // the final response below so cookie refresh keeps working.
  const cookiesToSet: { name: string; value: string; options?: CookieOptions }[] =
    [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.push(...toSet);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    return NextResponse.redirect(redirectUrl);
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    await supabase.auth.signOut();
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    redirectUrl.searchParams.set("error", "not_authorized");
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated and on the allowlist. Forward the verified identity to
  // server components as request headers (overwriting any client-supplied
  // values) so the admin layout can skip a second getUser() round-trip.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-admin-user-id", user.id);
  requestHeaders.set("x-admin-user-email", user.email);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Remember-me: if the login set hb-persist=0 (session-only), strip the
  // Max-Age/Expires that @supabase/ssr hard-codes onto refreshed auth cookies
  // so they stay session-scoped and clear on browser close. Any other value
  // (or absence) keeps Supabase's default persistent cookies.
  const sessionOnly = request.cookies.get("hb-persist")?.value === "0";
  for (const { name, value, options } of cookiesToSet) {
    // Only downgrade real writes; leave deletions (empty value / maxAge 0)
    // alone so old cookie chunks still get cleared.
    const opts =
      sessionOnly && value !== ""
        ? { ...options, maxAge: undefined, expires: undefined }
        : options;
    response.cookies.set(name, value, opts);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/crm/:path*"],
};
