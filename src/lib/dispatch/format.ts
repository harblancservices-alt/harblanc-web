/**
 * Money / ratio formatting for the dispatch surfaces.
 *
 * Lifted out of the Performance page's ./charts so the aggregation lib can
 * write the SAME "$1,240" and "$1.83" the charts draw without importing a
 * React module (performance.ts is pure and runs under Vitest with no DOM).
 * charts.tsx re-exports these, so its existing importers are unaffected.
 */

/** Sign outside the dollar sign — a losing month reads "-$310", not "$-310". */
export function usd(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

/** Axis-tick money: $12.4k / $1.2M, so ticks don't collide on a phone. */
export function usdCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function trim(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

/** Rate per mile, always two decimals — "$1.83". Null renders as an em-dash. */
export function rpm(n: number | null): string {
  if (n == null) return "—";
  return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
}

export function pct(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}
