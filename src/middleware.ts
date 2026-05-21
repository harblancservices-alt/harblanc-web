import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Defense-in-depth: explicit bypass for callback and other public-prefix
  // routes. Today the matcher already excludes these; this guarantees they
  // stay public even if the matcher is widened later.
  if (isPublicPrefix(pathname)) {
    return NextResponse.next();
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

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin/login";
    redirectUrl.searchParams.set("error", "misconfigured");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
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

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
