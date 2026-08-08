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

import { usd, rpm } from "./format";

/**
 * One load, pre-costed by the server — every non-deleted load, not just
 * delivered ones (a pending/booked load counts its rate too).
 *
 * `loadedMiles` / `deadheadMiles` are the segments `loadDiesel` derived from
 * odometer readings (falling back to the stored ZIP-route estimate for the
 * loaded leg), already coerced to 0 when a reading was missing. Both are 0 for
 * a TONU load — it never rolled.
 */
export type PerfLoad = {
  id: string;
  /** Gross revenue: the load's rate, or its TONU fee for a 'tonu'-status load. */
  rate: number;
  /** Fuel-adjusted take-home from `loadNet` — rate − diesel − factoring − expenses. */
  net: number;
  loadedMiles: number;
  deadheadMiles: number;
  /** Calendar year the load's attribution date falls in. */
  year: number;
  /** Calendar month 0–11 the load attributes to (matches Date.getMonth). */
  month: number;
  /**
   * The raw YYYY-MM-DD attribution date (pickup_date → delivery_date →
   * created_at — same fallback chain `year`/`month` were derived from), or
   * null. Carried alongside `year`/`month` so a custom day-range filter can
   * clip on the exact date instead of only whole calendar months.
   */
  date: string | null;
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
  /** net ÷ gross × 100 — the ledger's margin column. */
  marginPct: number | null;
  /** Empty miles as a share of the month's total miles. */
  deadheadPct: number | null;
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
    marginPct: null,
    deadheadPct: null,
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
    // Same two definitions the KPI row and PartyStat use, so a month reads the
    // same in the ledger as it does anywhere else on the page.
    b.marginPct = b.gross > 0 ? (b.net / b.gross) * 100 : null;
    const totalMiles = b.loadedMiles + b.deadheadMiles;
    b.deadheadPct = totalMiles > 0 ? (b.deadheadMiles / totalMiles) * 100 : null;
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
  deadheadMiles: number;
  netRpm: number | null;
  grossRpm: number | null;
  /** net ÷ gross × 100 — how much of the revenue actually survived the run. */
  marginPct: number | null;
  /** gross ÷ loads — what an average load with this party billed. */
  avgGrossPerLoad: number | null;
  /** net ÷ loads — what an average load with this party actually kept. */
  avgNetPerLoad: number | null;
  /**
   * Mean days from delivery to paid across THIS party's paid loads — the
   * leaderboard's "who actually pays on time" column. Null when none of its
   * loads have been paid, which is not the same as "pays instantly".
   */
  payDays: number | null;
  /** How many of this party's loads the payDays mean is built from. */
  paySample: number;
};

function toStat(name: string, rows: PerfLoad[]): PartyStat {
  const gross = rows.reduce((s, r) => s + r.rate, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const loadedMiles = rows.reduce((s, r) => s + r.loadedMiles, 0);
  const deadheadMiles = rows.reduce((s, r) => s + r.deadheadMiles, 0);
  const pay = payTiming(rows);
  return {
    name,
    loads: rows.length,
    gross,
    net,
    loadedMiles,
    deadheadMiles,
    netRpm: loadedMiles > 0 ? net / loadedMiles : null,
    grossRpm: loadedMiles > 0 ? gross / loadedMiles : null,
    marginPct: gross > 0 ? (net / gross) * 100 : null,
    avgGrossPerLoad: rows.length > 0 ? gross / rows.length : null,
    avgNetPerLoad: rows.length > 0 ? net / rows.length : null,
    payDays: pay.avgDays,
    paySample: pay.sample,
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

// -------------------------------------------------------- month-over-month

/**
 * How a KPI moved against the previous month.
 *
 * `kind` decides how the view spells it, because a percent change is not always
 * the honest form. Net going from -$200 to $300 is not "+250%" — a percentage
 * off a negative or zero base is arithmetic noise, so those fall back to the
 * absolute dollar move. Rates and ratios never use percent-of-percent either:
 * $/mi moves in cents, and margin moves in POINTS ("38% → 41%" is +3 pts, not
 * +7.9%).
 */
export type DeltaKind = "pct" | "usd" | "rpm" | "pts";

export type Delta = {
  kind: DeltaKind;
  /** Signed change, in the unit `kind` names. */
  value: number;
  /** True when the move is the direction the operator wants. */
  good: boolean;
};

export type MonthDeltas = {
  net: Delta | null;
  gross: Delta | null;
  netRpm: Delta | null;
  margin: Delta | null;
  deadhead: Delta | null;
};

const NO_DELTAS: MonthDeltas = {
  net: null,
  gross: null,
  netRpm: null,
  margin: null,
  deadhead: null,
};

/**
 * Below these, the move rounds to nothing and a "▲ +0%" chip is worse than no
 * chip — it implies a change the number doesn't show.
 */
const DELTA_FLOOR: Record<DeltaKind, number> = {
  pct: 0.5,
  usd: 1,
  rpm: 0.01,
  pts: 0.5,
};

function delta(kind: DeltaKind, value: number, good: boolean): Delta | null {
  if (!Number.isFinite(value) || Math.abs(value) < DELTA_FLOOR[kind]) return null;
  return { kind, value, good };
}

/** A total's move: percent when the base is positive, dollars when it isn't. */
function totalDelta(cur: number, prev: number): Delta | null {
  return prev > 0
    ? delta("pct", ((cur - prev) / prev) * 100, cur >= prev)
    : delta("usd", cur - prev, cur >= prev);
}

function pointDelta(
  cur: number | null,
  prev: number | null,
  kind: "rpm" | "pts",
  upIsGood: boolean,
): Delta | null {
  if (cur == null || prev == null) return null;
  const v = cur - prev;
  return delta(kind, v, upIsGood ? v > 0 : v < 0);
}

/** The subset of a bucket/summary that a MoM-style comparison needs. */
type DeltaInputs = {
  net: number;
  gross: number;
  netRpm: number | null;
  grossRpm: number | null;
  marginPct: number | null;
  deadheadPct: number | null;
};

/**
 * Compare two arbitrary periods (a month bucket, a custom range summary —
 * anything shaped like `DeltaInputs`). Generalizes `monthDeltas` so the
 * Performance page can diff a custom date range against the equal-length
 * range before it, not just adjacent calendar months.
 */
export function deltasBetween(cur: DeltaInputs, prev: DeltaInputs): MonthDeltas {
  return {
    net: totalDelta(cur.net, prev.net),
    gross: totalDelta(cur.gross, prev.gross),
    netRpm: pointDelta(cur.netRpm, prev.netRpm, "rpm", true),
    margin: pointDelta(cur.marginPct, prev.marginPct, "pts", true),
    // Less empty running is the win, so a NEGATIVE move is the good one.
    deadhead: pointDelta(cur.deadheadPct, prev.deadheadPct, "pts", false),
  };
}

/**
 * Compare `months[index]` to the month immediately before it.
 *
 * Deliberately the ADJACENT bucket, not "the last month that had loads":
 * monthlyBuckets is contiguous and zero-fills dead months, so index-1 is
 * always literally last month. Comparing against the last ACTIVE month would
 * label a June-vs-March jump "vs last month", which is a lie.
 *
 * Returns all-null when there is no prior month — the tiles then render bare,
 * which is the correct answer to "how does this compare" in month one.
 */
export function monthDeltas(months: MonthBucket[], index: number): MonthDeltas {
  if (index <= 0 || index >= months.length) return NO_DELTAS;
  return deltasBetween(months[index], months[index - 1]);
}

// ----------------------------------------------------------------- takeaways

/**
 * Plain-English, actionable readings of the aggregations above.
 *
 * The rest of this module answers "what are the numbers"; this section answers
 * "so what do I do". It introduces NO new arithmetic on money — every figure a
 * sentence quotes comes back out of summarize / brokerStats / laneStats /
 * deadheadSplit / payTiming, which in turn only ever add up the `net` that
 * loadNet already produced.
 *
 * The hard rule is SILENCE OVER FILLER. Each candidate below carries a minimum
 * sample and a minimum effect size, and returns null when either is unmet — a
 * "best lane" drawn from one 40-mile run, or a broker "12% under average" on a
 * single load, is noise dressed as advice. If every candidate declines, the
 * caller gets one honest line saying the page needs more loads.
 */

/** green = strength or opportunity, amber/red = watch-out, neutral = nothing to say yet. */
export type TakeawayTone = "good" | "warn" | "bad" | "neutral";

/** A sentence fragment. `bold` marks the figure the eye should land on. */
export type TakeawaySeg = { text: string; bold?: boolean };

export type Takeaway = {
  /** Stable React key / test handle: "best-lane", "goal-pace", … */
  id: string;
  tone: TakeawayTone;
  segs: TakeawaySeg[];
};

export type TakeawayContext = {
  /** The goal month the KPI row is scoped to (month 0–11). */
  year: number;
  month: number;
  /** Monthly net-profit goal from dispatch_settings. */
  monthlyGoal: number;
  /** Days left in the current month including today (America/Chicago). */
  daysRemaining: number;
};

/** Below this, nothing on the page is a trend — it's a couple of loads. */
const MIN_LOADS = 3;
/** A lane needs real distance behind it before its $/mi means anything. */
const LANE_MIN_MILES = 100;
/** "Clearly below average" — 25% under, not a rounding difference. */
const WEAK_RPM_RATIO = 0.75;
const BROKER_MIN_LOADS = 2;
/** Under-payment worth renegotiating over. */
const UNDERPAY_MIN_PCT = 15;
const PAY_MIN_SAMPLE_BROKER = 2;
const PAY_MIN_SAMPLE_ALL = 3;
/** Slow = both well past your own norm AND slow in absolute terms. */
const SLOW_PAY_OVER_MEDIAN = 10;
const SLOW_PAY_FLOOR_DAYS = 35;
const DEADHEAD_MIN_MILES = 500;
const DEADHEAD_LEAN_PCT = 15;
const DEADHEAD_HIGH_PCT = 25;
/** A penny of RPM drift month to month is not a trend. */
const RPM_MIN_DELTA = 0.05;
const MAX_TAKEAWAYS = 6;
/** Matches the page's chart window, so the trend reads the same months. */
const MAX_MONTH_WINDOW = 12;

const b = (text: string): TakeawaySeg => ({ text, bold: true });
const t = (text: string): TakeawaySeg => ({ text });

type Candidate = { takeaway: Takeaway; priority: number };

/**
 * Build the strip. Candidates are gathered with a priority, sorted, and the top
 * MAX_TAKEAWAYS kept — so on a data-rich account the owner reads the six most
 * decision-changing lines rather than every true one.
 */
export function takeaways(loads: PerfLoad[], ctx: TakeawayContext): Takeaway[] {
  const out: Candidate[] = [];
  const push = (
    priority: number,
    id: string,
    tone: TakeawayTone,
    segs: TakeawaySeg[],
  ) => out.push({ takeaway: { id, tone, segs }, priority });

  if (loads.length >= MIN_LOADS) {
    const all = summarize(loads);
    const avgRpm = all.netRpm;
    const lanes = laneStats(loads, 200);
    const brokers = brokerStats(loads, 200);

    // --- GOAL PACE ------------------------------------------------------
    const monthNet = summarize(
      loads.filter((l) => l.year === ctx.year && l.month === ctx.month),
    ).net;
    if (ctx.monthlyGoal > 0) {
      if (monthNet >= ctx.monthlyGoal) {
        push(100, "goal-pace", "good", [
          t("You've cleared your "),
          b(usd(ctx.monthlyGoal)),
          t(" goal this month — "),
          b(usd(monthNet - ctx.monthlyGoal)),
          t(" over."),
        ]);
      } else {
        const days = Math.max(1, ctx.daysRemaining);
        const perDay = Math.max(0, ctx.monthlyGoal - monthNet) / days;
        push(100, "goal-pace", "warn", [
          t("You're at "),
          b(usd(monthNet)),
          t(" of your "),
          b(usd(ctx.monthlyGoal)),
          t(" goal this month — that's about "),
          b(`${usd(perDay)}/day`),
          t(" for the remaining "),
          b(`${days} day${days === 1 ? "" : "s"}`),
          t("."),
        ]);
      }
    }

    // --- BEST LANE ------------------------------------------------------
    const best = lanes.find(
      (l) => l.loadedMiles >= LANE_MIN_MILES && (l.netRpm ?? 0) > 0,
    );
    if (best) {
      push(90, "best-lane", "good", [
        t("Your best lane is "),
        b(best.name),
        t(" at "),
        b(`${rpm(best.netRpm)}/mi`),
        t(" net — book more like it."),
      ]);
    }

    // --- WEAK FREIGHT ---------------------------------------------------
    // Needs a meaningful average to be "under", and enough lanes that being
    // the worst of them is a real ranking rather than an arithmetic accident.
    if (avgRpm != null && avgRpm > 0 && lanes.length >= 3) {
      const floor = avgRpm * WEAK_RPM_RATIO;
      const weak = [...lanes]
        .filter((l) => l.loadedMiles >= LANE_MIN_MILES && (l.netRpm ?? 0) < floor)
        .sort((x, y) => (x.netRpm ?? 0) - (y.netRpm ?? 0))[0];
      if (weak && weak.name !== best?.name) {
        push(80, "weak-lane", (weak.netRpm ?? 0) < 0 ? "bad" : "warn", [
          b(weak.name),
          t(" ran "),
          b(`${rpm(weak.netRpm)}/mi`),
          t(", under your "),
          b(`${rpm(avgRpm)}/mi`),
          t(" average — hold out for better."),
        ]);
      }
    }

    // --- UNDERPAYING BROKER ---------------------------------------------
    if (avgRpm != null && avgRpm > 0) {
      let worst: { name: string; under: number } | null = null;
      for (const br of brokers) {
        if (br.loads < BROKER_MIN_LOADS || br.netRpm == null) continue;
        const under = ((avgRpm - br.netRpm) / avgRpm) * 100;
        if (under >= UNDERPAY_MIN_PCT && (!worst || under > worst.under)) {
          worst = { name: br.name, under };
        }
      }
      if (worst) {
        push(75, "underpaying-broker", "bad", [
          b(worst.name),
          t(" pays about "),
          b(`${worst.under.toFixed(0)}%`),
          t(" under your average — renegotiate or lean elsewhere."),
        ]);
      }
    }

    // --- SLOW PAYER -----------------------------------------------------
    const allPay = payTiming(loads);
    if (allPay.medianDays != null && allPay.sample >= PAY_MIN_SAMPLE_ALL) {
      const bar = Math.max(
        allPay.medianDays + SLOW_PAY_OVER_MEDIAN,
        SLOW_PAY_FLOOR_DAYS,
      );
      let slow: { name: string; days: number } | null = null;
      for (const [name, rows] of groupBy(loads, (l) => l.broker.trim())) {
        const p = payTiming(rows);
        if (p.sample < PAY_MIN_SAMPLE_BROKER || p.medianDays == null) continue;
        if (p.medianDays >= bar && (!slow || p.medianDays > slow.days)) {
          slow = { name, days: p.medianDays };
        }
      }
      if (slow) {
        push(70, "slow-payer", "warn", [
          b(slow.name),
          t(" takes about "),
          b(`${slow.days.toFixed(0)} days`),
          t(" to pay — consider factoring or shorter terms."),
        ]);
      }
    }

    // --- TOP BROKER -----------------------------------------------------
    const top = brokers[0];
    if (top && top.net > 0) {
      push(60, "top-broker", "good", [
        b(top.name),
        t(" is your top earner — "),
        b(usd(top.net)),
        t(" net across "),
        b(`${top.loads} load${top.loads === 1 ? "" : "s"}`),
        t("."),
      ]);
    }

    // --- DEADHEAD -------------------------------------------------------
    // Only speaks at the ends of the range. A 19% deadhead is neither a win to
    // keep up nor a problem to chase, and saying so out loud is filler.
    const dh = deadheadSplit(loads);
    if (dh.pct != null && dh.total >= DEADHEAD_MIN_MILES) {
      if (dh.pct < DEADHEAD_LEAN_PCT) {
        push(50, "deadhead", "good", [
          t("You're running "),
          b(`${dh.pct.toFixed(0)}%`),
          t(" empty miles — that's lean, keep it up."),
        ]);
      } else if (dh.pct >= DEADHEAD_HIGH_PCT) {
        push(85, "deadhead", "warn", [
          t("You're running "),
          b(`${dh.pct.toFixed(0)}%`),
          t(" empty miles — worth chasing backhauls."),
        ]);
      }
    }

    // --- RPM TREND ------------------------------------------------------
    // The last two buckets only. monthlyBuckets is contiguous, so these are
    // genuinely consecutive calendar months and "vs last month" is literal.
    const months = monthlyBuckets(loads, MAX_MONTH_WINDOW);
    if (months.length >= 2) {
      const cur = months[months.length - 1];
      const prev = months[months.length - 2];
      if (cur.netRpm != null && prev.netRpm != null) {
        const delta = cur.netRpm - prev.netRpm;
        if (Math.abs(delta) >= RPM_MIN_DELTA) {
          push(55, "rpm-trend", delta > 0 ? "good" : "warn", [
            t("Your rate is "),
            b(`${delta > 0 ? "up" : "down"} ${rpm(Math.abs(delta))}/mi`),
            t(" vs last month."),
          ]);
        }
      }
    }
  }

  if (out.length === 0) {
    return [
      {
        id: "seed",
        tone: "neutral",
        segs: [
          t(
            "Log a few more loads and this fills in with what's working and what's not.",
          ),
        ],
      },
    ];
  }

  return out
    .sort((x, y) => y.priority - x.priority)
    .slice(0, MAX_TAKEAWAYS)
    .map((c) => c.takeaway);
}
