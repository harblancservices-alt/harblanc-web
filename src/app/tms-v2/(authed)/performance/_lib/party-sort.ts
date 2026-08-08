import type { PartyStat } from "@/lib/dispatch/performance";

/** Sortable columns for the broker/lane full-analysis tables (Phase 7) —
 * pure UI-ordering concern, not aggregation math (toStat() in
 * lib/dispatch/performance.ts already computed every one of these fields;
 * this only decides display order). */
export type PartySortKey =
  | "name"
  | "loads"
  | "gross"
  | "net"
  | "avgGrossPerLoad"
  | "avgNetPerLoad"
  | "loadedMiles"
  | "deadheadMiles"
  | "grossRpm"
  | "netRpm";

export const PARTY_SORT_KEYS: PartySortKey[] = [
  "name",
  "loads",
  "gross",
  "net",
  "avgGrossPerLoad",
  "avgNetPerLoad",
  "loadedMiles",
  "deadheadMiles",
  "grossRpm",
  "netRpm",
];

export function isPartySortKey(v: string | undefined): v is PartySortKey {
  return !!v && (PARTY_SORT_KEYS as string[]).includes(v);
}

/** Nulls sort last regardless of direction — an unranked "—" cell never
 * looks like the highest or lowest real value. */
export function sortPartyStats(rows: PartyStat[], key: PartySortKey, dir: "asc" | "desc"): PartyStat[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return mul * a.name.localeCompare(b.name);
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return mul * (av - bv);
  });
}
