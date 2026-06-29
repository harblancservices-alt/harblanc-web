/**
 * Shared date / time / days-ago formatters for the quote workspace, so the
 * Documents and Activity tabs read identically: "Jun 21 · 18:42 · 1w ago".
 *
 * All three render in the operator's LOCAL time — the workspace is read in the
 * daily flow, not as a forensic timestamp (matches the rest of this page).
 */

/** Clock time, 24-hour, e.g. "18:42". */
export function quoteClock(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Calendar date, e.g. "Jun 21" (adds the year for prior years). */
export function quoteDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Relative "days ago" label, e.g. "now", "12m ago", "1h ago", "3d ago",
 * "1w ago", "1mo ago".
 */
export function quoteAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const deltaMs = Date.now() - t;
  if (deltaMs < 60_000) return "now";
  const mins = Math.round(deltaMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
