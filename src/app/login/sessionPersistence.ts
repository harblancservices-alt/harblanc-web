"use client";

/**
 * Remember-me support for the cookie-based @supabase/ssr session.
 *
 * @supabase/ssr (0.10.3) ALWAYS writes the sb-*-auth-token cookies with a
 * ~400-day Max-Age — the set path in cookies.js hard-codes
 * DEFAULT_COOKIE_OPTIONS.maxAge and ignores any cookieOptions.maxAge you pass
 * to createBrowserClient. So a genuine "session-only" login can't be had by
 * configuring the client. Instead we:
 *
 *   1. Drop a non-HttpOnly marker cookie (`hb-persist`) that the admin
 *      middleware reads: when it re-writes refreshed auth cookies it strips
 *      Max-Age/Expires while the marker says "0", so refreshes stay
 *      session-scoped too.
 *   2. Immediately downgrade the freshly-written auth cookies to session
 *      cookies (re-set them with no Max-Age) so they clear on browser close
 *      even before the first refresh.
 *
 * When remember-me is ON we simply leave Supabase's persistent cookies as-is
 * (that's the native default) and mark the choice for the middleware.
 */

const MARKER = "hb-persist";
const ONE_YEAR = 400 * 24 * 60 * 60; // seconds — mirror Supabase's default

export function applySessionPersistence(remember: boolean): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";

  // Marker the middleware reads on every refresh. Persistent when remembering,
  // a session cookie itself when not.
  document.cookie = remember
    ? `${MARKER}=1; path=/; max-age=${ONE_YEAR}; SameSite=Lax${secure}`
    : `${MARKER}=0; path=/; SameSite=Lax${secure}`;

  if (remember) return;

  // Remember-me OFF: rewrite the just-set sb-*-auth-token* cookies without a
  // Max-Age so the browser treats them as session cookies and drops them when
  // the window closes. document.cookie only exposes name=value (no attributes),
  // so re-setting the same name+value with path=/ and no Max-Age replaces the
  // persistent cookie with a session-scoped one.
  for (const pair of document.cookie.split("; ")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (name.startsWith("sb-") && name.includes("-auth-token")) {
      document.cookie = `${name}=${value}; path=/; SameSite=Lax${secure}`;
    }
  }
}
