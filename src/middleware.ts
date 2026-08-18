import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Auth middleware for /admin/**, /tms-v2/**, and the shared neutral auth
 * routes.
 *
 *   /login             → publicly reachable (sign-in screen)
 *   /reset-password    → publicly reachable (request reset email)
 *   /logout            → requires a session (same as before the carve-out)
 *   /update-password   → requires a session (the Supabase recovery session
 *                        created by /auth/callback after a reset-link click)
 *   /admin/**, /tms-v2/** (everything else) → requires a Supabase Auth
 *                        session whose email matches ADMIN_EMAIL
 *
 *   /auth/callback      → handled OUTSIDE this middleware via the matcher
 *                        below. Listed in PUBLIC_PATH_PREFIXES as
 *                        defense-in-depth: if the matcher is ever widened,
 *                        the explicit bypass prevents the PKCE code exchange
 *                        from being intercepted by the auth gate (which
 *                        would cause a redirect loop because the callback IS
 *                        the thing that sets the session in the first
 *                        place).
 *
 * Retirement-readiness — shared authentication carve-out: /login, /logout,
 * /reset-password, and /update-password used to live under
 * src/app/admin/**, which was the last piece of REQUIRED auth
 * functionality inside the admin app's route tree — deleting src/app/admin
 * would have broken login for /tms-v2 too, since there is no /tms-v2/login
 * and both apps share one Supabase session/allowlist. They now live at
 * neutral top-level paths (src/app/{login,logout,reset-password,
 * update-password}/**, outside src/app/admin/**), with a temporary
 * compat redirect below for old /admin/{login,logout,reset-password,
 * update-password} bookmarks — implemented here in middleware.ts (not as
 * pages under src/app/admin/**) so the redirect itself also survives a
 * complete deletion of src/app/admin/**.
 *
 * Also refreshes the Supabase session cookies on every matching request so
 * server components can rely on getUser(). Per @supabase/ssr docs, no code
 * may run between createServerClient() and supabase.auth.getUser() or the
 * cookie refresh can land in a broken state.
 */

// Temporary compat redirects for the old /admin/* auth paths, so existing
// bookmarks/links/saved-password-manager entries keep working after the
// carve-out. Checked first, before any gating — an unauthenticated visitor
// with an old /admin/login bookmark must reach /login, not get redirected
// back to the now-nonexistent /admin/login by the gate below.
const LEGACY_ADMIN_AUTH_REDIRECTS: Readonly<Record<string, string>> = {
  "/admin/login": "/login",
  "/admin/logout": "/logout",
  "/admin/reset-password": "/reset-password",
  "/admin/update-password": "/update-password",
};

// Exact neutral auth paths that bypass the session gate (sign-in screen,
// request-reset-email screen). Centralised so future additions are a
// one-line edit and there's no risk of an inline
// `if (pathname === ... || pathname.startsWith(...))` chain drifting out of
// sync with the public-paths intent.
const PUBLIC_AUTH_PATHS = new Set<string>(["/login", "/reset-password"]);

// Path prefixes that bypass the middleware entirely. Today the matcher
// already excludes anything outside the paths below, so this is defensive
// only — if the matcher is ever broadened (e.g. to share session cookie
// refresh across the whole site), the explicit list keeps these routes
// public.
const PUBLIC_PATH_PREFIXES: readonly string[] = ["/auth/callback"];

function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.has(pathname);
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

/**
 * Shared admin-session gate — the SAME gate for /admin, /tms-v2, and the
 * neutral auth routes (/logout, /update-password — /login and
 * /reset-password bypass this gate entirely, see isPublicAuthPath).
 *
 * /tms-v2 is a clean-room app-layer rebuild that must sit behind the
 * identical login/session/cookie as /admin (see docs/portal/v2-architecture.md
 * §7): one Supabase Auth session, one ADMIN_EMAIL allowlist, one login
 * screen. There is no /tms-v2/login — an unauthenticated or non-admin
 * visitor is always bounced to /login, exactly like /admin itself, so a
 * signed-in admin never sees a second login and an unauthenticated visitor
 * never finds a second door in.
 *
 * This is a refactor of the pre-existing /admin gate logic (previously
 * inlined directly in middleware()), not new auth logic — extracted so
 * /tms-v2 reuses it by call, not by copy.
 */
async function adminSessionGate(request: NextRequest, pathname: string) {
  // Public auth paths (login, reset-password) bypass the session gate so
  // locked-out admins can sign in or request a recovery email.
  if (isPublicAuthPath(pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
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
    // Preserve where the visitor was headed so LoginForm.tsx can send them
    // back there after a successful sign-in, instead of always landing on
    // /admin regardless of whether this was an /admin or /tms-v2 visitor —
    // there is no other way to tell which app a given login belongs to,
    // since both share the one login screen.
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    if (pathname && pathname !== "/login") {
      redirectUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    await supabase.auth.signOut();
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("error", "not_authorized");
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated and on the allowlist. Forward the verified identity to
  // server components as request headers (overwriting any client-supplied
  // values) so the admin/tms-v2 layouts can skip a second getUser() round-trip.
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Legacy /admin/{login,logout,reset-password,update-password} compat
  // redirect for old bookmarks/links — checked FIRST, before any gating, so
  // an old link never gets caught by the (now-inapplicable) admin gate
  // below or hits a 404 for a page that no longer exists at that path.
  const legacyAuthTarget = LEGACY_ADMIN_AUTH_REDIRECTS[pathname];
  if (legacyAuthTarget) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = legacyAuthTarget;
    return NextResponse.redirect(redirectUrl);
  }

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

  // /admin, /tms-v2, and the neutral shared auth routes all share the exact
  // same session gate (see adminSessionGate's doc comment) — same cookie,
  // same allowlist, same login screen, no second implementation.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/tms-v2") ||
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname === "/reset-password" ||
    pathname === "/update-password"
  ) {
    return adminSessionGate(request, pathname);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/crm/:path*",
    "/tms-v2/:path*",
    "/login",
    "/logout",
    "/reset-password",
    "/update-password",
  ],
};
