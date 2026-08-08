import type { AnalyticsLoad } from "@/lib/data/analytics";

/** Row shape for the analytical Load Board (Phase 8) — AnalyticsLoad plus
 * the per-load derived figures Brent's column list needs (total miles,
 * gross/net per loaded mile) that aren't already fields on it. Pure
 * derivation from already-costed AnalyticsLoad values, not a new money
 * calculation. */
export type LoadTableRow = AnalyticsLoad & {
  totalMiles: number;
  grossRpm: number | null;
  netRpm: number | null;
};

export function toLoadTableRows(loads: AnalyticsLoad[]): LoadTableRow[] {
  return loads.map((l) => ({
    ...l,
    totalMiles: l.loadedMiles + l.deadheadMiles,
    grossRpm: l.loadedMiles > 0 ? l.rate / l.loadedMiles : null,
    netRpm: l.loadedMiles > 0 ? l.net / l.loadedMiles : null,
  }));
}

export type LoadSortKey =
  | "loadNumber"
  | "date"
  | "origin"
  | "destination"
  | "broker"
  | "rate"
  | "net"
  | "loadedMiles"
  | "deadheadMiles"
  | "totalMiles"
  | "grossRpm"
  | "netRpm"
  | "tripName";

export const LOAD_SORT_KEYS: LoadSortKey[] = [
  "loadNumber",
  "date",
  "origin",
  "destination",
  "broker",
  "rate",
  "net",
  "loadedMiles",
  "deadheadMiles",
  "totalMiles",
  "grossRpm",
  "netRpm",
  "tripName",
];

export function isLoadSortKey(v: string | undefined): v is LoadSortKey {
  return !!v && (LOAD_SORT_KEYS as string[]).includes(v);
}

const STRING_KEYS = new Set<LoadSortKey>(["loadNumber", "date", "origin", "destination", "broker", "tripName"]);

export function sortLoadRows(rows: LoadTableRow[], key: LoadSortKey, dir: "asc" | "desc"): LoadTableRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (STRING_KEYS.has(key)) {
      return mul * (String(a[key] ?? "").localeCompare(String(b[key] ?? "")));
    }
    const av = a[key] as number | null;
    const bv = b[key] as number | null;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return mul * (av - bv);
  });
}

/** Substring match across the fields the search box filters on — a load
 * number, either end of the lane, or the broker name. */
export function filterLoadRows(rows: LoadTableRow[], query: string): LoadTableRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      (r.loadNumber ?? "").toLowerCase().includes(q) ||
      r.origin.toLowerCase().includes(q) ||
      r.destination.toLowerCase().includes(q) ||
      r.broker.toLowerCase().includes(q),
  );
}
