/**
 * Performance / insights aggregation.
 *
 * Pure + framework-free (no DB, no React) so the Performance page and its
 * Vitest spec share ONE implementation, exactly like trip-rollup and
 * goal-month.
 *
 * IMPORTANT — this module does NO money math. Every `rate` and `net` handed to
 * it has ALREADY been computed by the canonical `loadDiesel` + `loadNet` pair
 * in ./fuel on the server, the same way the Load Board and the trip rollup do
 * it. Recomputing net here with a different formula is exactly the drift this
 * split exists to prevent: aggregate what fuel.ts produced, never re-derive it.
 *
 * Month attribution is likewise NOT reinvented — the caller passes the
 * {year, month} that `goalMonthParts(closeOutDate(load))` returned, so a load
 * lands in the same month here as it does in the load board's goal bar.
 */

/**
 * One delivered load, pre-costed by the server.
 *
 * `loadedMiles` / `deadheadMiles` are the segments `loadDiesel` derived from
 * odometer readings (falling back to the stored ZIP-route estimate for the
 * loaded leg), already coerced to 0 when a reading was missing.
 */
export type PerfLoad = {
  id: string;
  /** Gross revenue: the load's rate (TONU for a cancelled load). */
  rate: number;
  /** Fuel-adjusted take-home from `loadNet` — rate − diesel − factoring − expenses. */
  net: number;
  loadedMiles: number;
  deadheadMiles: number;
  /** Calendar year the load's close-out date attributes to. */
  year: number;
  /** Calendar month 0–11 the load attributes to (matches Date.getMonth). */
  month: number;
  broker: string;
  origin: string;
  destination: string;
  /** Date-only YYYY-MM-DD, or null. */
  deliveryDate: string | null;
  /** Timestamp the load was marked paid, or null if still owed. */
  paidAt: string | null;
};

export type MonthBucket = {
  /** Sortable "YYYY-MM" identity. */
  key: string;
  year: number;
  /** 0–11. */
  month: number;
  /** "Jul" — the axis tick. */
  label: string;
  /** "Jul ’26" — used when the span crosses a year boundary. */
  longLabel: string;
  loads: number;
  gross: number;
  net: number;
  loadedMiles: number;
  deadheadMiles: number;
  /**
   * $/mi over LOADED miles — the same denominator the load board's Avg/mi tile
   * uses. Null when the month moved no measurable loaded miles (a rate ÷ 0 is
   * not "$0.00 a mile", it's unknown).
   */
  netRpm: number | null;
  grossRpm: number | null;
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Absolute month ordinal, so gaps between months are arithmetic. */
function ordinal(year: number, month: number): number {
  return year * 12 + month;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function emptyBucket(year: number, month: number): MonthBucket {
  return {
    key: monthKey(year, month),
    year,
    month,
    label: MONTH_LABELS[month],
    longLabel: `${MONTH_LABELS[month]} ’${String(year).slice(2)}`,
    loads: 0,
    gross: 0,
    net: 0,
    loadedMiles: 0,
    deadheadMiles: 0,
    netRpm: null,
    grossRpm: null,
  };
}

/**
 * Roll loads up into a contiguous month timeline, most recent `limit` months.
 *
 * Months with no loads are FILLED with zero buckets rather than skipped: a bar
 * chart that silently omits a dead month draws the two months either side of it
 * adjacent, which reads as continuous work and flatters a gap in the year. An
 * empty month is real information — it gets a real (zero) bar.
 */
export function monthlyBuckets(loads: PerfLoad[], limit = 12): MonthBucket[] {
  if (loads.length === 0) return [];

  const byKey = new Map<string, MonthBucket>();
  let min = Infinity;
  let max = -Infinity;

  for (const l of loads) {
    if (!Number.isFinite(l.year) || l.month < 0 || l.month > 11) continue;
    const ord = ordinal(l.year, l.month);
    if (ord < min) min = ord;
    if (ord > max) max = ord;
    const key = monthKey(l.year, l.month);
    const b = byKey.get(key) ?? emptyBucket(l.year, l.month);
    b.loads += 1;
    b.gross += l.rate;
    b.net += l.net;
    b.loadedMiles += l.loadedMiles;
    b.deadheadMiles += l.deadheadMiles;
    byKey.set(key, b);
  }

  if (!Number.isFinite(min)) return [];

  // Only ever materialize the window we're about to draw — a stray load dated
  // years back would otherwise expand the fill loop to hundreds of buckets.
  const from = Math.max(min, max - (limit - 1));
  const out: MonthBucket[] = [];
  for (let ord = from; ord <= max; ord++) {
    const year = Math.floor(ord / 12);
    const month = ord - year * 12;
    const b = byKey.get(monthKey(year, month)) ?? emptyBucket(year, month);
    b.netRpm = b.loadedMiles > 0 ? b.net / b.loadedMiles : null;
    b.grossRpm = b.loadedMiles > 0 ? b.gross / b.loadedMiles : null;
    out.push(b);
  }
  return out;
}

export type PartyStat = {
  /** Broker name, or "Origin → Destination" for a lane. */
  name: string;
  loads: number;
  gross: number;
  net: number;
  loadedMiles: number;
  netRpm: number | null;
  grossRpm: number | null;
  /** net ÷ gross × 100 — how much of the revenue actually survived the run. */
  marginPct: number | null;
};

function toStat(name: string, rows: PerfLoad[]): PartyStat {
  const gross = rows.reduce((s, r) => s + r.rate, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const loadedMiles = rows.reduce((s, r) => s + r.loadedMiles, 0);
  return {
    name,
    loads: rows.length,
    gross,
    net,
    loadedMiles,
    netRpm: loadedMiles > 0 ? net / loadedMiles : null,
    grossRpm: loadedMiles > 0 ? gross / loadedMiles : null,
    marginPct: gross > 0 ? (net / gross) * 100 : null,
  };
}

function groupBy(
  loads: PerfLoad[],
  keyOf: (l: PerfLoad) => string,
): Map<string, PerfLoad[]> {
  const m = new Map<string, PerfLoad[]>();
  for (const l of loads) {
    const k = keyOf(l);
    if (!k) continue;
    const arr = m.get(k);
    if (arr) arr.push(l);
    else m.set(k, [l]);
  }
  return m;
}

/** Brokers ranked by total NET — who actually pays, not who books the most. */
export function brokerStats(loads: PerfLoad[], limit = 8): PartyStat[] {
  return [...groupBy(loads, (l) => l.broker.trim())]
    .map(([name, rows]) => toStat(name, rows))
    .sort((a, b) => b.net - a.net)
    .slice(0, limit);
}

/** A lane's identity: where it started → where it ended. */
export function laneKey(origin: string, destination: string): string {
  const o = origin.trim();
  const d = destination.trim();
  if (!o && !d) return "";
  return `${o || "—"} → ${d || "—"}`;
}

/**
 * Lanes ranked by average NET $/mi — the rate-quality question ("is this lane
 * worth running?"), which is not the same as the volume question.
 *
 * Lanes with no measurable loaded miles can't be ranked on $/mi at all, so they
 * are dropped rather than sorted as zero. Ties on RPM break on total net, so a
 * lane he's run five times outranks a one-off at the same rate.
 */
export function laneStats(loads: PerfLoad[], limit = 8): PartyStat[] {
  return [...groupBy(loads, (l) => laneKey(l.origin, l.destination))]
    .map(([name, rows]) => toStat(name, rows))
    .filter((s) => s.netRpm != null)
    .sort((a, b) => (b.netRpm ?? 0) - (a.netRpm ?? 0) || b.net - a.net)
    .slice(0, limit);
}

export type DeadheadSplit = {
  loaded: number;
  deadhead: number;
  total: number;
  /** Empty miles as a share of every mile turned. Null when nothing moved. */
  pct: number | null;
};

/**
 * Loaded vs empty miles. Deadhead is the share of TOTAL miles (loaded +
 * deadhead), not a ratio against loaded miles — "30% of my miles were empty" is
 * the number that maps onto margin, and it's bounded 0–100 so it can drive a
 * bar directly.
 */
export function deadheadSplit(loads: PerfLoad[]): DeadheadSplit {
  const loaded = loads.reduce((s, l) => s + l.loadedMiles, 0);
  const deadhead = loads.reduce((s, l) => s + l.deadheadMiles, 0);
  const total = loaded + deadhead;
  return { loaded, deadhead, total, pct: total > 0 ? (deadhead / total) * 100 : null };
}

/** Whole days between two YYYY-MM-DD(THH:…) instants, or null if unparseable. */
export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = parseDayUtc(from);
  const b = parseDayUtc(to);
  if (a == null || b == null) return null;
  const d = Math.round((b - a) / 86_400_000);
  return d >= 0 ? d : null;
}

/**
 * Parse the YYYY-MM-DD prefix as a UTC midnight. Both date-only columns
 * (delivery_date) and full timestamps (paid_at) reduce to the same calendar
 * day this way, so "delivered the 3rd, paid the 24th" is 21 days regardless of
 * the wall-clock time the paid flag happened to be flipped.
 */
function parseDayUtc(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export type PayTiming = {
  /** Mean days from delivery to paid, over loads that actually got paid. */
  avgDays: number | null;
  /** Middle of the distribution — one 90-day straggler can't drag it. */
  medianDays: number | null;
  /** How many paid loads the average is built from. */
  sample: number;
};

export function payTiming(loads: PerfLoad[]): PayTiming {
  const days = loads
    .map((l) => daysBetween(l.deliveryDate, l.paidAt))
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b);
  if (days.length === 0) return { avgDays: null, medianDays: null, sample: 0 };
  const avg = days.reduce((s, d) => s + d, 0) / days.length;
  const mid = Math.floor(days.length / 2);
  const median =
    days.length % 2 === 0 ? (days[mid - 1] + days[mid]) / 2 : days[mid];
  return { avgDays: avg, medianDays: median, sample: days.length };
}

export type PeriodSummary = {
  loads: number;
  gross: number;
  net: number;
  loadedMiles: number;
  deadheadMiles: number;
  netRpm: number | null;
  grossRpm: number | null;
  /** net ÷ gross × 100. */
  marginPct: number | null;
  /** net ÷ loads — what an average load is worth after costs. */
  netPerLoad: number | null;
  deadheadPct: number | null;
};

/** The headline roll-up for an arbitrary slice (this month, all time, …). */
export function summarize(loads: PerfLoad[]): PeriodSummary {
  const gross = loads.reduce((s, l) => s + l.rate, 0);
  const net = loads.reduce((s, l) => s + l.net, 0);
  const dh = deadheadSplit(loads);
  return {
    loads: loads.length,
    gross,
    net,
    loadedMiles: dh.loaded,
    deadheadMiles: dh.deadhead,
    netRpm: dh.loaded > 0 ? net / dh.loaded : null,
    grossRpm: dh.loaded > 0 ? gross / dh.loaded : null,
    marginPct: gross > 0 ? (net / gross) * 100 : null,
    netPerLoad: loads.length > 0 ? net / loads.length : null,
    deadheadPct: dh.pct,
  };
}
