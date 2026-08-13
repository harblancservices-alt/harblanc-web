/**
 * The money engine (v2-architecture.md §3a) — the only module in /tms-v2
 * permitted to touch `rate`/`tonu_amount`/`load_expenses`/`factoring_pct`.
 * Every screen imports `computeLoadNet`/`computeTripNet`/`computeCarrierAR`/
 * `formatMoney` from here; none re-derives its own version. This is what
 * closes the audit's #1 finding (TONU net computed 5 different ways) for
 * good: there is exactly one function that knows what a load is worth.
 *
 * The underlying miles/diesel/factoring math is REUSED, not reimplemented,
 * from `src/lib/dispatch/fuel.ts` and `src/lib/dispatch/trip-rollup.ts` —
 * both are pure, framework-free, and already the audited-correct source of
 * truth for /admin. Re-deriving the same formulas a second time for
 * /tms-v2 would recreate the exact "intended canonical function that not
 * everyone routes through" bug this rebuild exists to fix; importing the
 * same tested functions guarantees /admin and /tms-v2 agree on every dollar
 * for as long as both apps run side by side.
 */

import {
  loadDiesel,
  loadNet as computeRawLoadNet,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import {
  computeTripFinancials,
  type TripRollupLoad,
  type TripFinancials,
} from "@/lib/dispatch/trip-rollup";

export type { FuelSettings, TripRollupLoad, TripFinancials };
export { FUEL_DEFAULTS } from "@/lib/dispatch/fuel";

export type MoneyTone = "positive" | "negative" | "neutral";

/** Tabular-nums dollar string, e.g. formatMoney(1850) -> "$1,850". Whole
 * dollars by default (matches every figure in v2-design.md's wireframes);
 * pass `cents: true` for a value that needs sub-dollar precision. */
export function formatMoney(
  value: number | null | undefined,
  opts?: { cents?: boolean },
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  }).format(value);
}

/** Semantic tone for a money figure — green for net-positive/cash-in, red
 * for spend/negative, neutral otherwise. The house rule (v2-design.md):
 * color lives only on the figure, driven by sign, never decoration. */
export function moneyTone(value: number | null | undefined): MoneyTone {
  if (value === null || value === undefined || Number.isNaN(value)) return "neutral";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// 3a. computeLoadNet — the one function permitted to turn a load's raw rate/
// tonu_amount/odometer/expense columns into a P&L figure.
// ---------------------------------------------------------------------------

export type LoadMoneyInput = {
  /** "pending" | "assigned" | "loaded" | "delivered" | "tonu" */
  status: string;
  rate: number | string | null;
  tonuAmount: number | string | null;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  /** ZIP-route mileage estimate, used only when odometer readings can't
   * derive loaded miles (delivery not yet logged). */
  loadedMilesEstimate: number | null;
};

export type LoadFinancials = {
  /** True when this load is TONU'd — gross/net collapse to tonu_amount and
   * no diesel/factoring/expenses are deducted, matching the one TONU rule
   * every screen must agree on. */
  isTonu: boolean;
  gross: number;
  diesel: number;
  factoring: number;
  expenses: number;
  net: number;
  loadedMiles: number;
  deadheadMiles: number;
};

/**
 * A load's full P&L: rate minus diesel, factoring (only when the broker
 * factors), and manually-entered expenses — or, for a TONU'd load, the flat
 * tonu_amount with nothing deducted. The single source of truth for "true
 * net" across Today, the Load Board, Load Detail, Trips, Calendar, and
 * Performance.
 *
 * `brokerFactoring` MUST reflect the load's broker's `factoring` flag —
 * pass false for any non-factoring broker so no factoring fee is deducted.
 */
export function computeLoadNet(
  load: LoadMoneyInput,
  expensesTotal: number,
  settings: FuelSettings,
  brokerFactoring: boolean,
): LoadFinancials {
  const isTonu = load.status === "tonu";
  // Miles for DISPLAY (Total mi / Deadhead mi KPIs, $/mi ratios) — these may
  // legitimately fall back to the load's stored ZIP-route estimate before
  // odometer readings are in.
  const miles = loadDiesel(
    {
      odoAssigned: load.odoAssigned,
      odoLoaded: load.odoLoaded,
      odoDelivered: load.odoDelivered,
      estimate: load.loadedMilesEstimate,
    },
    settings,
  );
  // Miles that actually DEDUCT diesel from gross/net — odometer-only, no
  // estimate fallback (estimate: null short-circuits loadedMiles() to the
  // real odo_delivered-odo_loaded delta or nothing). The ZIP-route estimate
  // is a provisional mileage number, not a real fuel expense; it must never
  // silently reduce a load's shown profit before odometer readings are
  // actually entered.
  const realMiles = loadDiesel(
    {
      odoAssigned: load.odoAssigned,
      odoLoaded: load.odoLoaded,
      odoDelivered: load.odoDelivered,
      estimate: null,
    },
    settings,
  );

  if (isTonu) {
    const gross = num(load.tonuAmount);
    return {
      isTonu: true,
      gross,
      diesel: 0,
      factoring: 0,
      expenses: 0,
      net: gross,
      loadedMiles: miles.loaded ?? 0,
      deadheadMiles: miles.deadhead ?? 0,
    };
  }

  const gross = num(load.rate);
  const { factoring, net } = computeRawLoadNet(
    { rate: gross, diesel: realMiles.diesel, expensesTotal },
    settings,
    brokerFactoring,
  );
  return {
    isTonu: false,
    gross,
    diesel: realMiles.diesel,
    factoring,
    expenses: expensesTotal,
    net,
    loadedMiles: miles.loaded ?? 0,
    deadheadMiles: miles.deadhead ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 3a. computeTripNet — a trip's all-in P&L (loads + personal-conveyance
// diesel between them). Delegates to trip-rollup.ts's computeTripFinancials
// (already the audited-correct, framework-free implementation) rather than
// re-deriving PC-gap math a second time.
// ---------------------------------------------------------------------------

export function computeTripNet(
  loads: TripRollupLoad[],
  settings: FuelSettings,
  factoringBrokerIds: Set<string>,
  expensesByLoadId: Map<string, number>,
  tripOdometer: { start: number | null; end: number | null },
): TripFinancials {
  return computeTripFinancials(loads, settings, factoringBrokerIds, expensesByLoadId, tripOdometer);
}

// ---------------------------------------------------------------------------
// 3a. computeCarrierAR — "owed to me for delivered freight": every
// delivered-or-TONU'd load still marked unpaid, aged from its delivery date.
// The one A/R-aging rule (v2-architecture.md §3a) — Today, Receivables, and
// Broker Detail all read this instead of re-deriving their own unpaid scan.
// ---------------------------------------------------------------------------

/** A load counts as overdue once it's been unpaid this many days since
 * delivery — the same threshold /admin's dashboard alert uses. */
export const RECEIVABLE_OVERDUE_DAYS = 40;

export type CarrierARInput = {
  id: string;
  status: string;
  paymentStatus: string;
  deliveryDate: string | null;
  rate: number | string | null;
  tonuAmount: number | string | null;
};

export type CarrierARItem = {
  loadId: string;
  amount: number;
  daysOutstanding: number;
  overdue: boolean;
};

export type CarrierAR = {
  totalOutstanding: number;
  items: CarrierARItem[];
};

/** Whole calendar days between a YYYY-MM-DD (or timestamp) date and `now`,
 * both compared as UTC calendar days — never negative. */
function daysSince(dateStr: string | null, now: Date): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00Z` : dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const then = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((today - then) / 86_400_000);
  return days >= 0 ? days : 0;
}

/**
 * Carrier A/R: every closed-out load (delivered or TONU'd) still unpaid,
 * with its outstanding amount and days-since-delivery. A load that's
 * neither delivered nor TONU'd hasn't earned anything collectible yet, so
 * it isn't A/R — it's still in progress.
 */
export function computeCarrierAR(loads: CarrierARInput[], now: Date = new Date()): CarrierAR {
  const items: CarrierARItem[] = [];
  for (const l of loads) {
    const closedOut = l.status === "delivered" || l.status === "tonu";
    if (!closedOut || l.paymentStatus === "paid") continue;
    const amount = l.status === "tonu" ? num(l.tonuAmount) : num(l.rate);
    const daysOutstanding = daysSince(l.deliveryDate, now);
    items.push({
      loadId: l.id,
      amount,
      daysOutstanding,
      overdue: daysOutstanding >= RECEIVABLE_OVERDUE_DAYS,
    });
  }
  const totalOutstanding = items.reduce((sum, i) => sum + i.amount, 0);
  return { totalOutstanding, items };
}
