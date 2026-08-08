/**
 * Context-aware "back" for /tms-v2 detail pages (Brent's bug report,
 * 2026-08-08): a page reachable from more than one parent — Load Detail
 * from the Load Board, Receivables, Performance, or a Trip's load list;
 * a Broker/Trip profile from its own list OR from a Load Detail jump
 * button — can't have one hardcoded back target and be right every time.
 * That was the root cause: every BackButton pointed at a fixed static
 * parent regardless of where the visit actually started.
 *
 * The fix is a `from` query param, not client-side history: `router.back()`
 * can't distinguish "came from another /tms-v2 screen" from "opened this
 * as a fresh tab/deep link" (both leave an unpredictable browser history
 * state), so it can't reliably satisfy Brent's "don't break the deep-link
 * case" requirement. A `from` param is deterministic and server-renderable
 * — no client JS needed on the reading end.
 *
 * withReturnTo() — called by a LINK that knows exactly where the user is
 * navigating FROM (a specific list, a specific parent detail page) —
 * appends `?from=<encoded current path>` to its href.
 *
 * resolveBackHref() — called by the DETAIL PAGE's own BackButton — reads
 * that param back and uses it verbatim; falls back to the page's normal
 * static parent when the param is absent (a bookmark, a deep link, or a
 * caller that was never taught to pass it — never a broken back button,
 * just a less-specific one).
 */

/** Appends (or merges into an existing query string) a `from` param
 * carrying `fromPath` — normally the current screen's own pathname +
 * search, so the detail page can return to the exact view (period,
 * filters, page) the user left, not just its base route. */
export function withReturnTo(href: string, fromPath: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}from=${encodeURIComponent(fromPath)}`;
}

/** Only trusts an in-app relative path (starts with exactly one "/" —
 * never "//", which a browser resolves as protocol-relative to another
 * host) — a safety floor against a crafted `from` value navigating
 * off-site. Anything else (absent, malformed, external) falls back to the
 * caller's normal static parent. */
export function resolveBackHref(from: string | string[] | undefined, fallback: string): string {
  const v = Array.isArray(from) ? from[0] : from;
  if (v && v.startsWith("/") && !v.startsWith("//")) return v;
  return fallback;
}
