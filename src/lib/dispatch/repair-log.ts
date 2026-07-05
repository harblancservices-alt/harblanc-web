/**
 * Repair-log domain logic — pure, no DB. Shared by the Maintenance page, the
 * entry/set detail views, and the dashboard widget so freshness, reminder
 * status, and formatting all agree.
 *
 * The "current odometer" (highest reading across non-deleted loads) is still
 * derived by {@link currentOdoFromLoads} in ./maintenance, which this module
 * re-exports so callers have one import. Reminder status reuses
 * {@link computeMaintenance} from there too — a reminder is just an interval +
 * a last-done odometer.
 */

export {
  currentOdoFromLoads,
  earliestOdoFromLoads,
  computeMaintenance,
  computeCostPerMile,
} from "./maintenance";
export type { MaintStatus, MaintComputed } from "./maintenance";

// ---------------------------------------------------------------------------
// Freshness — the ONE place to tune "how recent counts as NEW". Used by the set
// corners grid and the related-repairs badges.
//
// NEW    = done recently by every KNOWN signal (≤ newMiles ago AND ≤ newDays
//          ago, whichever we have).
// AGING  = has been done, but longer ago than that.
// ORIGINAL = never logged (no odometer and no date on record).
export const FRESHNESS = {
  /** Within this many miles of the current odometer still reads as NEW. */
  newMiles: 10_000,
  /** Within this many days of today still reads as NEW (~6 months). */
  newDays: 183,
} as const;

export type Freshness = "new" | "aging" | "original";

/** Whole days from `dateStr` (YYYY-MM-DD) to `todayStr` (YYYY-MM-DD). */
export function daysBetween(dateStr: string, todayStr: string): number | null {
  const a = Date.parse(dateStr + "T00:00:00Z");
  const b = Date.parse(todayStr + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Freshness of a part from its last-done odometer + date against the truck's
 * current odometer + today. NEW only when all available signals are within
 * threshold; ORIGINAL when there's nothing on record at all.
 */
export function computeFreshness(
  lastOdo: number | null,
  currentOdo: number | null,
  lastDate: string | null,
  todayStr: string,
): Freshness {
  if (lastOdo == null && lastDate == null) return "original";

  const signals: boolean[] = [];
  if (lastOdo != null && currentOdo != null) {
    signals.push(currentOdo - lastOdo <= FRESHNESS.newMiles);
  }
  if (lastDate != null) {
    const d = daysBetween(lastDate, todayStr);
    if (d != null) signals.push(d <= FRESHNESS.newDays);
  }
  if (signals.length === 0) return "aging"; // on record, but nothing measurable
  return signals.every(Boolean) ? "new" : "aging";
}

export const FRESHNESS_META: Record<
  Freshness,
  { label: string; tone: "green" | "amber" | "slate" }
> = {
  new: { label: "New", tone: "green" },
  aging: { label: "Aging", tone: "amber" },
  original: { label: "Original", tone: "slate" },
};

// ---------------------------------------------------------------------------
// Positions — a tiny fixed enum, NOT a taxonomy the user builds.

export const POSITIONS = ["FL", "FR", "RL", "RR", "L", "R"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  FL: "Front-Left",
  FR: "Front-Right",
  RL: "Rear-Left",
  RR: "Rear-Right",
  L: "Left",
  R: "Right",
};

/** The 2×2 corners shown in a set view, in grid order. */
export const CORNER_POSITIONS: Position[] = ["FL", "FR", "RL", "RR"];

export function isPosition(v: string | null | undefined): v is Position {
  return v != null && (POSITIONS as readonly string[]).includes(v);
}

/** Group key for a part_group label — case/space-insensitive. */
export function groupKey(partGroup: string | null | undefined): string | null {
  if (partGroup == null) return null;
  const k = partGroup.trim().toLowerCase();
  return k.length > 0 ? k : null;
}

// ---------------------------------------------------------------------------
// Formatting.

/** "$1,250.00". null/blank → "". */
export function money(n: number | null | undefined): string {
  if (n == null) return "";
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Format a stored date ("2026-06-20") as "06/20/2026" via string-split (no Date
 * parsing) so it can't drift across time zones.
 */
export function formatDate(date: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/** Parse a dollar string ("$1,250.50" → 1250.5). 0 when blank/invalid. */
export function parseMoney(raw: string): number {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
