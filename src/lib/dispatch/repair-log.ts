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
  currentOdoFromSources,
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

export const POSITIONS = [
  "FL",
  "FR",
  "RL",
  "RR",
  "FRONT",
  "REAR",
  "L",
  "R",
] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  FL: "Front-Left",
  FR: "Front-Right",
  RL: "Rear-Left",
  RR: "Rear-Right",
  FRONT: "Front",
  REAR: "Rear",
  L: "Left",
  R: "Right",
};

/** The 2×2 corners shown in a set view, in grid order. */
export const CORNER_POSITIONS: Position[] = ["FL", "FR", "RL", "RR"];

/** Non-corner positions, appended to a set view only when the set uses them. */
export const NON_CORNER_POSITIONS: Position[] = ["FRONT", "REAR", "L", "R"];

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
// Categories — a fixed enum (this order) the whole log is organized under.
//
// These are the MECHANICAL homes only. "Preventative" is NO LONGER one of them:
// it's a cross-cutting green LENS (see {@link isPreventative}) that aggregates
// recurring/consumable items — which still live under a mechanical home here.

// Display order (home grid + form dropdown).
export const CATEGORIES = [
  "Steering & Suspension",
  "Drivetrain",
  "Engine Bay",
  "Brakes",
  "Tires & Wheels",
  "Trailer",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: string | null | undefined): v is Category {
  return v != null && (CATEGORIES as readonly string[]).includes(v);
}

// The Preventative lens — an aggregate view, not a stored category. It has its
// own card + route but is never written to repair_entries.category.
export const PREVENTATIVE_LABEL = "Preventative";
export const PREVENTATIVE_SLUG = "preventative";

/** URL slug ⟷ category (spaces / ampersands aren't URL-friendly). */
export const CATEGORY_SLUG: Record<Category, string> = {
  "Steering & Suspension": "steering-suspension",
  Drivetrain: "drivetrain",
  "Engine Bay": "engine-bay",
  Brakes: "brakes",
  "Tires & Wheels": "tires-wheels",
  Trailer: "trailer",
  Other: "other",
};
const SLUG_TO_CATEGORY: Record<string, Category> = Object.fromEntries(
  (Object.entries(CATEGORY_SLUG) as [Category, string][]).map(([c, s]) => [
    s,
    c,
  ]),
) as Record<string, Category>;

export function categoryFromSlug(slug: string): Category | null {
  return SLUG_TO_CATEGORY[slug] ?? null;
}

/**
 * Part → MECHANICAL-category keyword map. Ordered by PRECEDENCE (first match
 * wins): the Trailer catch-all, then the part categories, with the shared-word
 * conflicts resolved by ordering — e.g. "wheel bearing" → Steering beats
 * "wheel" → Tires. Consumables now map to their MECHANICAL home (no separate
 * Preventative bucket): fluids → Drivetrain, oil/filters/coolant/def → Engine
 * Bay, grease → Steering, tire rotation → Tires. Matching is case-insensitive,
 * word-boundaried, and plural-tolerant. The backfill migration mirrors this.
 */
const CATEGORY_RULES: { category: Category; keywords: string[] }[] = [
  { category: "Trailer", keywords: ["trailer"] },
  {
    category: "Brakes",
    keywords: [
      "brake pad",
      "brake line",
      "shoe",
      "rotor",
      "drum",
      "caliper",
      "abs",
      "slack adjuster",
      "air brake",
    ],
  },
  {
    category: "Steering & Suspension",
    keywords: [
      "wheel bearing",
      "ball joint",
      "upper control arm",
      "lower control arm",
      "control arm",
      "track bar",
      "sway bar",
      "tie rod",
      "drag link",
      "pitman arm",
      "idler arm",
      "coil spring",
      "leaf spring",
      "kingpin",
      "alignment",
      "bushing",
      "shock",
      "damper",
      "links",
      "suspension",
      // Consumable that lives here.
      "grease",
      "greasing",
    ],
  },
  {
    category: "Drivetrain",
    keywords: [
      "u-joint",
      "u joint",
      "driveshaft",
      "carrier bearing",
      "differential",
      "diff",
      "axle shaft",
      "cv axle",
      "transfer case",
      "transmission",
      "clutch",
    ],
  },
  {
    category: "Engine Bay",
    keywords: [
      // Consumables that live here (fluids, filters, DEF, crankcase vent).
      "engine oil",
      "oil filter",
      "fuel filter",
      "air filter",
      "cabin filter",
      "coolant flush",
      "coolant",
      "ccv",
      "crankcase vent",
      "crankcase",
      "def",
      "radiator",
      "water pump",
      "thermostat",
      "coolant line",
      "intercooler",
      "boost line",
      "fuel line",
      "serpentine belt",
      "tensioner",
      "alternator",
      "starter",
      "battery",
      "fuse",
      "wiring",
      "turbo",
      "injector",
      "valve lash",
      "egr",
      "hose",
    ],
  },
  {
    category: "Tires & Wheels",
    keywords: ["tire", "wheel", "tpms", "rotation", "balance"],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One boundaried, plural-tolerant regex per category, in precedence order.
const COMPILED_RULES = CATEGORY_RULES.map((r) => ({
  category: r.category,
  re: new RegExp(
    "\\b(?:" + r.keywords.map(escapeRegExp).join("|") + ")s?\\b",
    "i",
  ),
}));

/**
 * Best-guess MECHANICAL category for a free-text description/label. Returns
 * 'Other' when nothing matches. Used for the log-form's smart default and the
 * backfill. Never returns 'Preventative' — that's a lens, not a home.
 */
export function categoryForText(text: string | null | undefined): Category {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return "Other";
  for (const rule of COMPILED_RULES) {
    if (rule.re.test(t)) return rule.category;
  }
  return "Other";
}

// ---------------------------------------------------------------------------
// Preventative lens — the cross-cutting "stay-ahead" classifier.
//
// An item is PREVENTATIVE if it's a recurring/consumable maintenance item
// (fluids, filters, oil, coolant, grease, DEF, tire rotation) OR it has an
// active mileage reminder (the reminder half is decided at the data layer, not
// here). This mirrors the persisted `is_preventative` column's text rule and
// the backfill migration's SQL exactly. One-off repairs (track bar, u-joint…)
// are NOT preventative and stay single-category.
const PREVENTATIVE_KEYWORDS = [
  "engine oil",
  "oil filter",
  "fuel filter",
  "air filter",
  "cabin filter",
  "coolant",
  "grease",
  "greasing",
  "def",
  "transmission fluid",
  "transfer case fluid",
  "diff fluid",
  "differential fluid",
  "tire rotation",
  "rotation",
];
const PREVENTATIVE_RE = new RegExp(
  "\\b(?:" + PREVENTATIVE_KEYWORDS.map(escapeRegExp).join("|") + ")s?\\b",
  "i",
);

/**
 * True when a description reads as a recurring/consumable maintenance item.
 * The "has an active reminder" half of the preventative definition is applied
 * separately (persisted on write, queried on read).
 */
export function isPreventative(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return false;
  return PREVENTATIVE_RE.test(t);
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
