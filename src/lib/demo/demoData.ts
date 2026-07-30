/**
 * DEMO MODE — the single, static, in-memory fake dataset.
 *
 * This module NEVER touches Supabase. Every admin page's data fetcher, when
 * `isDemoMode()` is true, returns one of the derivations below INSTEAD of
 * querying the database — so no real row can ever surface in demo mode.
 *
 * Design goal: one canonical set of fake loads/brokers/trips is the single
 * source of truth, and every screen is derived from it by running the SAME pure
 * helpers the real pages use (loadDiesel, loadNet, the performance aggregators,
 * computeTripFinancials, goalMonthParts). That guarantees the numbers are
 * internally consistent by construction — a load's net on the board equals its
 * net on Performance equals its net on the broker profile, and the monthly
 * totals add up — exactly as they do for real data.
 *
 * The dataset is generated RELATIVE TO "now" so the demo is evergreen: the
 * current month always shows ~85% of goal and the trailing months always show a
 * healthy upward trend, whenever the demo happens to be shown.
 */

import {
  loadDiesel,
  loadNet,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import {
  closeOutDate,
  goalMonthParts,
  currentGoalMonth,
  currentGoalMonthLabel,
  daysLeftInMonth,
  currentBusinessDate,
} from "@/lib/dispatch/goal-month";
import {
  monthlyBuckets,
  brokerStats,
  laneStats,
  deadheadSplit,
  payTiming,
  summarize,
  monthKey,
  monthDeltas,
  takeaways,
  type PerfLoad,
} from "@/lib/dispatch/performance";
import {
  computeTripFinancials,
  type TripRollupLoad,
} from "@/lib/dispatch/trip-rollup";
import { computeMaintenance } from "@/lib/dispatch/maintenance";
import { daysOutstanding } from "@/lib/dispatch/alerts";
import { CATEGORY_SLUG, type Category } from "@/lib/dispatch/repair-log";
import type { CountdownGoal, NetPace } from "@/lib/dispatch/countdown";
import type { AlertGroup } from "@/lib/dispatch/alerts";
import type { PipelineCard } from "@/lib/dispatch/pipeline";

import type {
  DashboardData,
  ActiveLoadItem,
  MaintWidgetItem,
} from "@/app/admin/(authed)/DashboardView";
import type {
  LoadBoardData,
  LoadRow,
} from "@/app/admin/(authed)/dispatch/loads/LoadBoardView";
import type { PerformanceData } from "@/app/admin/(authed)/performance/PerformanceView";
import type {
  ReceivableItem,
  PaidItem,
} from "@/app/admin/(authed)/dispatch/receivables/ReceivablesView";
import type {
  BrokerDetailData,
} from "@/app/admin/(authed)/dispatch/brokers/[id]/BrokerDetail";
import type { BrokerListItem } from "@/app/admin/(authed)/dispatch/brokers/BrokerListSidebar";
import type {
  CategoryCard,
  PreventativeSummary,
  ReminderView,
  RepairEntry,
} from "@/app/admin/(authed)/maintenance/types";

// ---------------------------------------------------------------------------
// Fuel / business settings the demo runs its money math on.
// ---------------------------------------------------------------------------

export const DEMO_FUEL: FuelSettings = { mpg: 6.9, ppg: 4.05, factoringPct: 3 };
export const DEMO_MONTHLY_GOAL = 10000;
export const DEMO_ANNUAL_GOAL = 120000;
export const DEMO_CURRENT_CASH = 18450;
export const DEMO_SETTINGS_ROW = {
  mpg: DEMO_FUEL.mpg,
  diesel_price_per_gallon: DEMO_FUEL.ppg,
  factoring_pct: DEMO_FUEL.factoringPct,
  monthly_net_goal: DEMO_MONTHLY_GOAL,
  annual_net_goal: DEMO_ANNUAL_GOAL,
  current_cash: DEMO_CURRENT_CASH,
};

// ---------------------------------------------------------------------------
// Brokers — fictional names so demo data can never be mistaken for the real
// broker directory.
// ---------------------------------------------------------------------------

type DemoBroker = {
  id: string;
  name: string;
  factoring: boolean;
  mc: string;
  dot: string;
  type: string;
  phone: string;
  email: string;
  office: string;
  timezone: string;
};

const BROKERS: DemoBroker[] = [
  {
    id: "demo-brk-cardinal",
    name: "Cardinal Freight Partners",
    factoring: true,
    mc: "MC-712004",
    dot: "USDOT-2884120",
    type: "Freight broker",
    phone: "(704) 555-0142",
    email: "dispatch@cardinalfreight.example",
    office: "Charlotte, NC",
    timezone: "America/New_York",
  },
  {
    id: "demo-brk-summit",
    name: "Summit Lane Logistics",
    factoring: false,
    mc: "MC-640188",
    dot: "USDOT-2551903",
    type: "Freight broker",
    phone: "(612) 555-0197",
    email: "loads@summitlane.example",
    office: "Minneapolis, MN",
    timezone: "America/Chicago",
  },
  {
    id: "demo-brk-ironwood",
    name: "Ironwood Transport Brokers",
    factoring: false,
    mc: "MC-503771",
    dot: "USDOT-2109884",
    type: "Freight broker",
    phone: "(214) 555-0173",
    email: "ops@ironwoodtb.example",
    office: "Dallas, TX",
    timezone: "America/Chicago",
  },
  {
    id: "demo-brk-blueridge",
    name: "Blue Ridge Dispatch Co.",
    factoring: true,
    mc: "MC-778210",
    dot: "USDOT-3011557",
    type: "Freight broker",
    phone: "(615) 555-0121",
    email: "team@blueridgedispatch.example",
    office: "Nashville, TN",
    timezone: "America/Chicago",
  },
  {
    id: "demo-brk-meridian",
    name: "Meridian Freight Group",
    factoring: false,
    mc: "MC-455092",
    dot: "USDOT-1998231",
    type: "Freight broker",
    phone: "(317) 555-0158",
    email: "book@meridianfg.example",
    office: "Indianapolis, IN",
    timezone: "America/New_York",
  },
  {
    id: "demo-brk-greatplains",
    name: "Great Plains Brokerage",
    factoring: false,
    mc: "MC-388417",
    dot: "USDOT-1774660",
    type: "Freight broker",
    phone: "(402) 555-0184",
    email: "freight@greatplainsbk.example",
    office: "Omaha, NE",
    timezone: "America/Chicago",
  },
];

const BROKER_BY_ID = new Map(BROKERS.map((b) => [b.id, b]));
const FACTORING_IDS = new Set(BROKERS.filter((b) => b.factoring).map((b) => b.id));

// ---------------------------------------------------------------------------
// Trips.
// ---------------------------------------------------------------------------

type DemoTrip = {
  id: string;
  name: string;
  status: "active" | "closed";
  notes: string | null;
  startOdo: number | null;
  endOdo: number | null;
};

const TRIPS: DemoTrip[] = [
  {
    id: "demo-trip-southwest",
    name: "Southwest Reefer Run",
    status: "closed",
    notes: "Out-and-back through the desert. Watch reefer fuel on the PHX leg.",
    startOdo: null, // filled from its loads' odometers below
    endOdo: null,
  },
  {
    id: "demo-trip-midwest",
    name: "Midwest Circuit",
    status: "active",
    notes: "Dry-van loop — KC, St. Louis, Chicago.",
    startOdo: null,
    endOdo: null,
  },
  {
    id: "demo-trip-texas",
    name: "Texas Triangle",
    status: "active",
    notes: null,
    startOdo: null,
    endOdo: null,
  },
];

// ---------------------------------------------------------------------------
// Canonical load specs. `monthsAgo` places the delivery in that goal-month;
// `day` is the day-of-month for the delivery date (clamped to today for the
// current month so nothing is dated in the future).
// ---------------------------------------------------------------------------

type LoadSpec = {
  n: string; // load number
  broker: string; // broker id
  equipment: string;
  origin: string;
  destination: string;
  miles: number; // loaded miles
  deadhead: number;
  rpm: number; // gross rate per loaded mile
  monthsAgo: number;
  day: number;
  status: "delivered" | "pending" | "assigned" | "loaded";
  paidDaysAfter: number | null; // null = still unpaid (or not delivered)
  trip: string | null;
  expenses: number; // manual per-load expenses total
};

const LOAD_SPECS: LoadSpec[] = [
  // --- 5 months ago -------------------------------------------------------
  { n: "4021", broker: "demo-brk-cardinal", equipment: "Reefer", origin: "Houston, TX", destination: "Memphis, TN", miles: 560, deadhead: 70, rpm: 2.72, monthsAgo: 5, day: 9, status: "delivered", paidDaysAfter: 24, trip: null, expenses: 150 },
  { n: "4025", broker: "demo-brk-summit", equipment: "Dry Van", origin: "Kansas City, MO", destination: "Denver, CO", miles: 600, deadhead: 55, rpm: 2.6, monthsAgo: 5, day: 21, status: "delivered", paidDaysAfter: 28, trip: null, expenses: 0 },
  // --- 4 months ago -------------------------------------------------------
  { n: "4038", broker: "demo-brk-ironwood", equipment: "Flatbed", origin: "Dallas, TX", destination: "Atlanta, GA", miles: 780, deadhead: 90, rpm: 2.78, monthsAgo: 4, day: 8, status: "delivered", paidDaysAfter: 21, trip: null, expenses: 0 },
  { n: "4044", broker: "demo-brk-meridian", equipment: "Reefer", origin: "Little Rock, AR", destination: "Dallas, TX", miles: 320, deadhead: 40, rpm: 3.02, monthsAgo: 4, day: 20, status: "delivered", paidDaysAfter: 19, trip: null, expenses: 180 },
  // --- 3 months ago -------------------------------------------------------
  { n: "4057", broker: "demo-brk-blueridge", equipment: "Dry Van", origin: "Nashville, TN", destination: "Charlotte, NC", miles: 410, deadhead: 35, rpm: 2.9, monthsAgo: 3, day: 10, status: "delivered", paidDaysAfter: 26, trip: null, expenses: 0 },
  { n: "4061", broker: "demo-brk-cardinal", equipment: "Reefer", origin: "Oklahoma City, OK", destination: "Phoenix, AZ", miles: 1000, deadhead: 120, rpm: 2.68, monthsAgo: 3, day: 22, status: "delivered", paidDaysAfter: 23, trip: "demo-trip-southwest", expenses: 220 },
  // --- 2 months ago -------------------------------------------------------
  { n: "4073", broker: "demo-brk-greatplains", equipment: "Dry Van", origin: "Omaha, NE", destination: "Denver, CO", miles: 540, deadhead: 60, rpm: 2.84, monthsAgo: 2, day: 11, status: "delivered", paidDaysAfter: 20, trip: null, expenses: 0 },
  { n: "4079", broker: "demo-brk-summit", equipment: "Reefer", origin: "Chicago, IL", destination: "Minneapolis, MN", miles: 410, deadhead: 45, rpm: 3.0, monthsAgo: 2, day: 24, status: "delivered", paidDaysAfter: 31, trip: null, expenses: 90 },
  // Aged, still-unpaid receivable (~45d+ bucket).
  { n: "4085", broker: "demo-brk-ironwood", equipment: "Flatbed", origin: "St. Louis, MO", destination: "Houston, TX", miles: 780, deadhead: 80, rpm: 2.74, monthsAgo: 2, day: 8, status: "delivered", paidDaysAfter: null, trip: null, expenses: 0 },
  // --- 1 month ago (best full month) -------------------------------------
  { n: "4092", broker: "demo-brk-ironwood", equipment: "Dry Van", origin: "St. Louis, MO", destination: "Chicago, IL", miles: 300, deadhead: 30, rpm: 2.95, monthsAgo: 1, day: 9, status: "delivered", paidDaysAfter: 18, trip: "demo-trip-midwest", expenses: 0 },
  { n: "4096", broker: "demo-brk-meridian", equipment: "Flatbed", origin: "Indianapolis, IN", destination: "Columbus, OH", miles: 175, deadhead: 25, rpm: 3.12, monthsAgo: 1, day: 16, status: "delivered", paidDaysAfter: 16, trip: null, expenses: 90 },
  { n: "4101", broker: "demo-brk-blueridge", equipment: "Reefer", origin: "Nashville, TN", destination: "Atlanta, GA", miles: 250, deadhead: 30, rpm: 3.08, monthsAgo: 1, day: 24, status: "delivered", paidDaysAfter: 15, trip: null, expenses: 0 },
  // Aged, still-unpaid receivable (~30d bucket).
  { n: "4104", broker: "demo-brk-cardinal", equipment: "Reefer", origin: "Houston, TX", destination: "Memphis, TN", miles: 560, deadhead: 65, rpm: 2.8, monthsAgo: 1, day: 22, status: "delivered", paidDaysAfter: null, trip: null, expenses: 0 },
  // --- current month (in progress toward the $10k goal) -------------------
  { n: "4118", broker: "demo-brk-greatplains", equipment: "Reefer", origin: "Kansas City, MO", destination: "Denver, CO", miles: 600, deadhead: 50, rpm: 2.92, monthsAgo: 0, day: 4, status: "delivered", paidDaysAfter: 12, trip: "demo-trip-midwest", expenses: 0 },
  { n: "4123", broker: "demo-brk-ironwood", equipment: "Dry Van", origin: "Dallas, TX", destination: "Atlanta, GA", miles: 780, deadhead: 70, rpm: 2.86, monthsAgo: 0, day: 11, status: "delivered", paidDaysAfter: null, trip: "demo-trip-texas", expenses: 0 },
  { n: "4129", broker: "demo-brk-summit", equipment: "Dry Van", origin: "Chicago, IL", destination: "Minneapolis, MN", miles: 410, deadhead: 40, rpm: 3.02, monthsAgo: 0, day: 18, status: "delivered", paidDaysAfter: null, trip: null, expenses: 0 },
  // --- active loads on the truck now (not yet delivered) ------------------
  { n: "4133", broker: "demo-brk-blueridge", equipment: "Reefer", origin: "Atlanta, GA", destination: "Orlando, FL", miles: 440, deadhead: 40, rpm: 2.95, monthsAgo: 0, day: 20, status: "loaded", paidDaysAfter: null, trip: "demo-trip-texas", expenses: 0 },
  { n: "4135", broker: "demo-brk-meridian", equipment: "Flatbed", origin: "Columbus, OH", destination: "Nashville, TN", miles: 380, deadhead: 35, rpm: 3.0, monthsAgo: 0, day: 21, status: "assigned", paidDaysAfter: null, trip: null, expenses: 0 },
  { n: "4137", broker: "demo-brk-cardinal", equipment: "Reefer", origin: "Memphis, TN", destination: "Houston, TX", miles: 560, deadhead: 45, rpm: 2.88, monthsAgo: 0, day: 22, status: "pending", paidDaysAfter: null, trip: null, expenses: 0 },
];

// ---------------------------------------------------------------------------
// The fully-built canonical load row (DB-shaped superset). Every page fetcher's
// row type is a subset of this, so it can stand in for the real query result.
// ---------------------------------------------------------------------------

export type DemoLoadFull = {
  id: string;
  load_number: string;
  broker_id: string;
  broker_name: string;
  equipment: string;
  origin: string;
  destination: string;
  pickup_date: string | null;
  delivery_date: string | null;
  created_at: string;
  trip_id: string | null;
  trip_name: string | null;
  rate: number;
  tonu_amount: number | null;
  loaded_miles: number;
  deadhead_to_miles: number;
  deadhead_from_miles: number;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  fuel_cost: number;
  factoring_fee: number;
  misc_cost: number;
  status: string;
  payment_status: string;
  paid_at: string | null;
  // Demo-only extras the derivations use.
  expensesTotal: number;
  brokerFactoring: boolean;
  net: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftMonth(
  year: number,
  month0: number,
  back: number,
): { year: number; month0: number } {
  let m = month0 - back;
  let y = year;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  return { year: y, month0: m };
}

function roundRate(miles: number, rpm: number): number {
  return Math.round((miles * rpm) / 25) * 25;
}

/**
 * Build the canonical load set relative to `now`. Odometers are threaded in
 * chronological order so the truck's reading only ever climbs, and every load's
 * `net` is computed through the same loadDiesel → loadNet pair the real pages
 * use.
 */
function buildLoads(now: Date): DemoLoadFull[] {
  const cur = currentGoalMonth(now); // { year, month } (month 0-based)
  const todayIso = currentBusinessDate(now);
  const currentDay = Number(todayIso.slice(8, 10)) || 15;

  // Delivered loads first, in chronological order (oldest → newest), so the
  // running odometer is monotonic; active loads are appended (newest).
  const delivered = LOAD_SPECS.filter((s) => s.status === "delivered").sort(
    (a, b) => b.monthsAgo - a.monthsAgo || a.day - b.day,
  );
  const active = LOAD_SPECS.filter((s) => s.status !== "delivered");
  const ordered = [...delivered, ...active];

  let odo = 471_200; // starting truck odometer for the demo history
  const out: DemoLoadFull[] = [];

  for (const s of ordered) {
    const { year, month0 } = shiftMonth(cur.year, cur.month, s.monthsAgo);
    // Clamp the current month's day to today so nothing is future-dated.
    const day =
      s.monthsAgo === 0 ? Math.min(s.day, Math.max(2, currentDay)) : s.day;
    const deliveredDate =
      s.status === "delivered" ? `${year}-${pad2(month0 + 1)}-${pad2(day)}` : null;
    // Pickup is ~2 days before delivery (or before "now" for active loads).
    const anchor = deliveredDate ?? `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
    const anchorMs = Date.parse(anchor + "T12:00:00Z");
    const pickupIso = new Date(anchorMs - 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const createdIso = new Date(anchorMs - 3 * 86_400_000).toISOString();

    // Thread odometers by status.
    let odoAssigned: number | null = null;
    let odoLoaded: number | null = null;
    let odoDelivered: number | null = null;
    if (s.status === "delivered") {
      odoAssigned = odo;
      odoLoaded = odo + s.deadhead;
      odoDelivered = odo + s.deadhead + s.miles;
      odo = odoDelivered + 35; // small personal-conveyance gap before next load
    } else if (s.status === "loaded") {
      odoAssigned = odo;
      odoLoaded = odo + s.deadhead;
      odo = odoLoaded; // still rolling — no delivered reading yet
    } else if (s.status === "assigned") {
      odoAssigned = odo;
      // assigned but not picked up — leave loaded/delivered null
    }
    // pending → no odometer readings yet.

    const rate = roundRate(s.miles, s.rpm);
    const broker = BROKER_BY_ID.get(s.broker)!;
    const md = loadDiesel(
      {
        odoAssigned,
        odoLoaded,
        odoDelivered,
        estimate: s.miles,
      },
      DEMO_FUEL,
    );
    const { factoring, net } = loadNet(
      { rate, diesel: md.diesel, expensesTotal: s.expenses },
      DEMO_FUEL,
      broker.factoring,
    );

    const paidAt =
      s.status === "delivered" && s.paidDaysAfter != null && deliveredDate
        ? new Date(
            Date.parse(deliveredDate + "T12:00:00Z") +
              s.paidDaysAfter * 86_400_000,
          ).toISOString()
        : null;

    const tripName = s.trip
      ? TRIPS.find((t) => t.id === s.trip)?.name ?? null
      : null;

    out.push({
      id: "demo-load-" + s.n,
      load_number: s.n,
      broker_id: broker.id,
      broker_name: broker.name,
      equipment: s.equipment,
      origin: s.origin,
      destination: s.destination,
      pickup_date: pickupIso,
      delivery_date: deliveredDate,
      created_at: createdIso,
      trip_id: s.trip,
      trip_name: tripName,
      rate,
      tonu_amount: null,
      loaded_miles: s.miles,
      deadhead_to_miles: s.deadhead,
      deadhead_from_miles: 0,
      odo_assigned: odoAssigned,
      odo_loaded: odoLoaded,
      odo_delivered: odoDelivered,
      fuel_cost: Math.round(md.diesel),
      factoring_fee: Math.round(factoring),
      misc_cost: s.expenses,
      status: s.status,
      payment_status:
        s.status === "delivered" ? (paidAt ? "paid" : "unpaid") : "unpaid",
      paid_at: paidAt,
      expensesTotal: s.expenses,
      brokerFactoring: broker.factoring,
      net,
    });
  }

  return out;
}

/** Current truck odometer for the demo (highest reading). */
function currentOdo(loads: DemoLoadFull[]): number {
  let max = 0;
  for (const l of loads) {
    max = Math.max(
      max,
      l.odo_assigned ?? 0,
      l.odo_loaded ?? 0,
      l.odo_delivered ?? 0,
    );
  }
  return max;
}

// ---------------------------------------------------------------------------
// PerfLoad projection — the input to every performance aggregator.
// ---------------------------------------------------------------------------

function toPerfLoads(loads: DemoLoadFull[]): PerfLoad[] {
  return loads
    .map((l) => {
      const md = loadDiesel(
        {
          odoAssigned: l.odo_assigned,
          odoLoaded: l.odo_loaded,
          odoDelivered: l.odo_delivered,
          estimate: l.loaded_miles,
        },
        DEMO_FUEL,
      );
      const attributed = goalMonthParts(closeOutDate(l));
      return {
        id: l.id,
        rate: l.rate,
        net: l.net,
        loadedMiles: md.loaded ?? 0,
        deadheadMiles: md.deadhead ?? 0,
        year: attributed?.year ?? -1,
        month: attributed?.month ?? -1,
        broker: l.broker_name,
        origin: l.origin,
        destination: l.destination,
        deliveryDate: l.delivery_date,
        paidAt: l.payment_status === "paid" ? l.paid_at : null,
      };
    });
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ===========================================================================
// PER-SCREEN DERIVATIONS
// ===========================================================================

/** Distinct open (active) trip names — Add Load picker + dashboard. */
export function demoOpenTripNames(): string[] {
  return TRIPS.filter((t) => t.status === "active").map((t) => t.name);
}

function demoBrokerNames(): string[] {
  return BROKERS.map((b) => b.name).sort((a, b) => a.localeCompare(b));
}

// --- Load Board ------------------------------------------------------------

export function demoLoadBoard(now: Date = new Date()): LoadBoardData {
  const loads = buildLoads(now);
  const { month: currentMonth } = currentGoalMonth(now);

  const rows: LoadRow[] = loads.map((l) => {
    const md = loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      DEMO_FUEL,
    );
    const goal = goalMonthParts(closeOutDate(l));
    return {
      id: l.id,
      loadNumber: l.load_number,
      broker: l.broker_name,
      brokerId: l.broker_id,
      equipment: l.equipment,
      origin: l.origin,
      destination: l.destination,
      pickup: fmtShort(l.pickup_date),
      delivery: fmtShort(l.delivery_date),
      trip: l.trip_name ?? "",
      rate: l.rate,
      net: l.net,
      loadedMiles: md.loaded,
      dhMiles: md.deadhead ?? 0,
      month: goal ? goal.month : -1,
      status: l.status,
      paymentStatus: l.payment_status,
    };
  });

  const arTotal = rows
    .filter((r) => r.status === "delivered" && r.paymentStatus !== "paid")
    .reduce((s, r) => s + r.rate, 0);

  const daysInMonth = (() => {
    const today = currentBusinessDate(now);
    const [y, m] = today.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  })();

  return {
    rows,
    brokerNames: demoBrokerNames(),
    activeTrips: demoOpenTripNames(),
    currentMonth,
    arTotal,
    monthlyGoal: DEMO_MONTHLY_GOAL,
    annualGoal: DEMO_ANNUAL_GOAL,
    daysLeftInMonth: daysLeftInMonth(now),
    daysInMonth,
  };
}

// --- Performance -----------------------------------------------------------

export function demoPerformance(now: Date = new Date()): PerformanceData {
  const loads = buildLoads(now);
  const perf = toPerfLoads(loads);
  const { year: curYear, month: curMonth } = currentGoalMonth(now);
  const months = monthlyBuckets(perf, 12);
  const curKey = monthKey(curYear, curMonth);
  const curIndex = months.findIndex((b) => b.key === curKey);

  const arTotal = loads
    .filter(
      (l) =>
        (l.status === "delivered" || l.status === "tonu") &&
        l.payment_status !== "paid",
    )
    .reduce((s, l) => s + (l.status === "tonu" ? (l.tonu_amount ?? 0) : l.rate), 0);

  return {
    monthLabel: currentGoalMonthLabel(now),
    daysLeft: daysLeftInMonth(now),
    takeaways: takeaways(perf, {
      year: curYear,
      month: curMonth,
      monthlyGoal: DEMO_MONTHLY_GOAL,
      daysRemaining: daysLeftInMonth(now),
    }),
    currentMonth: summarize(
      perf.filter((l) => l.year === curYear && l.month === curMonth),
    ),
    allTime: summarize(perf),
    deltas: monthDeltas(months, curIndex),
    pay: payTiming(perf),
    months,
    highlightIndex: curIndex,
    monthlyGoal: DEMO_MONTHLY_GOAL,
    brokers: brokerStats(perf, 50),
    lanes: laneStats(perf, 50),
    deadhead: deadheadSplit(perf),
    arTotal,
  };
}

// --- Receivables -----------------------------------------------------------

export function demoReceivables(now: Date = new Date()): {
  outstanding: ReceivableItem[];
  recentlyPaid: PaidItem[];
  arTotal: number;
} {
  const loads = buildLoads(now);
  const outstanding: ReceivableItem[] = loads
    .filter((l) => l.status === "delivered" && l.payment_status !== "paid")
    .sort((a, b) => (a.delivery_date ?? "").localeCompare(b.delivery_date ?? ""))
    .map((l) => ({
      id: l.id,
      loadNumber: l.load_number,
      brokerId: l.broker_id,
      brokerName: l.broker_name,
      origin: l.origin,
      destination: l.destination,
      deliveredLabel: fmtShort(l.delivery_date),
      rate: l.rate,
      days: daysOutstanding(l.delivery_date, now),
    }));

  const recentlyPaid: PaidItem[] = loads
    .filter((l) => l.status === "delivered" && l.payment_status === "paid")
    .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""))
    .slice(0, 6)
    .map((l) => ({
      id: l.id,
      loadNumber: l.load_number,
      brokerName: l.broker_name,
      rate: l.rate,
    }));

  const arTotal = outstanding.reduce((s, l) => s + l.rate, 0);
  return { outstanding, recentlyPaid, arTotal };
}

// --- Brokers (list + profile) ---------------------------------------------

export function demoBrokerList(now: Date = new Date()): BrokerListItem[] {
  const loads = buildLoads(now);
  return BROKERS.map((b) => {
    const mine = loads.filter((l) => l.broker_id === b.id);
    const gross = mine
      .filter((l) => l.status !== "tonu")
      .reduce((s, l) => s + l.rate, 0);
    return {
      id: b.id,
      name: b.name,
      status: "active",
      mc: b.mc,
      loads: mine.length,
      gross,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const DEMO_CONTACTS: Record<
  string,
  { id: string; name: string; title: string; phone: string; email: string; backhaul: boolean }[]
> = {
  "demo-brk-cardinal": [
    { id: "demo-ct-1", name: "Dana Whitfield", title: "Senior dispatcher", phone: "(704) 555-0142", email: "dana@cardinalfreight.example", backhaul: false },
    { id: "demo-ct-2", name: "Marcus Bell", title: "Reefer desk", phone: "(704) 555-0160", email: "marcus@cardinalfreight.example", backhaul: true },
  ],
  "demo-brk-summit": [
    { id: "demo-ct-3", name: "Priya Nair", title: "Account manager", phone: "(612) 555-0197", email: "priya@summitlane.example", backhaul: false },
  ],
  "demo-brk-ironwood": [
    { id: "demo-ct-4", name: "Colton Reyes", title: "Flatbed dispatcher", phone: "(214) 555-0173", email: "colton@ironwoodtb.example", backhaul: false },
  ],
  "demo-brk-blueridge": [
    { id: "demo-ct-5", name: "Sam Okafor", title: "Dispatcher", phone: "(615) 555-0121", email: "sam@blueridgedispatch.example", backhaul: false },
  ],
  "demo-brk-meridian": [
    { id: "demo-ct-6", name: "Riley Chen", title: "Broker", phone: "(317) 555-0158", email: "riley@meridianfg.example", backhaul: true },
  ],
  "demo-brk-greatplains": [
    { id: "demo-ct-7", name: "Jesse Duran", title: "Freight coordinator", phone: "(402) 555-0184", email: "jesse@greatplainsbk.example", backhaul: false },
  ],
};

export function demoBrokerDetail(
  id: string,
  now: Date = new Date(),
): BrokerDetailData | null {
  const broker = BROKER_BY_ID.get(id);
  if (!broker) return null;
  const loads = buildLoads(now).filter((l) => l.broker_id === id);

  const live = loads.filter((l) => l.status !== "tonu");
  const delivered = loads.filter((l) => l.status === "delivered");
  const activeCount = loads.filter(
    (l) => l.status === "pending" || l.status === "assigned" || l.status === "loaded",
  ).length;

  const gross = live.reduce((s, l) => s + l.rate, 0);
  const net = live.reduce((s, l) => s + l.net, 0);
  const unpaid = delivered.filter((l) => l.payment_status !== "paid");
  const collected = delivered
    .filter((l) => l.payment_status === "paid")
    .reduce((s, l) => s + l.rate, 0);
  const ar = unpaid.reduce((s, l) => s + l.rate, 0);
  const avgRate = live.length ? gross / live.length : 0;
  const avgMiles = live.length
    ? Math.round(live.reduce((s, l) => s + l.loaded_miles, 0) / live.length)
    : 0;

  const aging = { b1: 0, b2: 0, b3: 0, b4: 0, c1: 0, c2: 0, c3: 0, c4: 0 };
  for (const l of unpaid) {
    const d = daysOutstanding(l.delivery_date, now) ?? 0;
    const amt = l.rate;
    if (d <= 7) {
      aging.b1 += amt;
      aging.c1 += 1;
    } else if (d <= 14) {
      aging.b2 += amt;
      aging.c2 += 1;
    } else if (d <= 30) {
      aging.b3 += amt;
      aging.c3 += 1;
    } else {
      aging.b4 += amt;
      aging.c4 += 1;
    }
  }

  const laneMap = new Map<
    string,
    { origin: string; destination: string; count: number; gross: number; miles: number; lastIso: string | null }
  >();
  for (const l of live) {
    const key = `${l.origin} → ${l.destination}`;
    const e =
      laneMap.get(key) ??
      { origin: l.origin, destination: l.destination, count: 0, gross: 0, miles: 0, lastIso: null };
    e.count += 1;
    e.gross += l.rate;
    e.miles += l.loaded_miles;
    if (l.delivery_date && (!e.lastIso || l.delivery_date > e.lastIso)) {
      e.lastIso = l.delivery_date;
    }
    laneMap.set(key, e);
  }
  const lanes = [...laneMap.values()]
    .map((e) => ({
      lane: `${e.origin} → ${e.destination}`,
      origin: e.origin,
      destination: e.destination,
      count: e.count,
      gross: e.gross,
      avgRate: e.count ? e.gross / e.count : 0,
      miles: e.miles,
      avgRpm: e.miles > 0 ? e.gross / e.miles : 0,
      lastDate: fmtShort(e.lastIso),
    }))
    .sort((a, b) => b.count - a.count || b.gross - a.gross);

  const contacts = (DEMO_CONTACTS[id] ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    phones: [{ number: c.phone, ext: null, label: null }],
    emails: [{ address: c.email, label: null }],
    is_backhaul: c.backhaul,
  }));

  return {
    broker: {
      id: broker.id,
      name: broker.name,
      status: "active",
      mc: broker.mc,
      dot: broker.dot,
      type: broker.type,
      phone: broker.phone,
      email: broker.email,
      office: broker.office,
      timezone: broker.timezone,
      authority: "Active — Common & Contract",
      insurance: "$1M auto liability · $100k cargo",
      w9: "On file",
      ten99: "Not required",
      notes: broker.factoring
        ? "Factors through demo — 3% fee applies on their loads."
        : null,
      factoring: broker.factoring,
    },
    kpis: { loads: live.length, gross, net, ar },
    summary: {
      totalLoads: loads.length,
      delivered: delivered.length,
      active: activeCount,
      cancelled: 0,
      gross,
      avgRate,
      avgMiles,
    },
    receivables: { gross, collected, ar, net },
    aging,
    contacts,
    loads: loads
      .slice()
      .sort((a, b) => (b.delivery_date ?? "").localeCompare(a.delivery_date ?? ""))
      .map((l) => ({
        id: l.id,
        lane: `${l.origin} → ${l.destination}`,
        equipment: l.equipment,
        date: fmtShort(l.delivery_date),
        rate: l.rate,
        net: l.net,
        status: l.status,
        paymentStatus: l.payment_status,
        ageDays: daysOutstanding(l.delivery_date, now),
        unpaid: l.status === "delivered" && l.payment_status !== "paid",
      })),
    lanes,
  };
}

// --- Trips (list + detail) -------------------------------------------------

export type DemoTripCard = {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  dateLabel: string;
  loads: number;
  gross: number;
  net: number;
  spent: number;
  profitPct: number | null;
};

function tripRollupLoads(loads: DemoLoadFull[]): (TripRollupLoad & {
  trip_id: string | null;
  delivery_date: string | null;
})[] {
  return loads.map((l) => ({
    id: l.id,
    rate: l.rate,
    loaded_miles: l.loaded_miles,
    odo_assigned: l.odo_assigned,
    odo_loaded: l.odo_loaded,
    odo_delivered: l.odo_delivered,
    broker_id: l.broker_id,
    status: l.status,
    trip_id: l.trip_id,
    delivery_date: l.delivery_date,
  }));
}

function expenseMap(loads: DemoLoadFull[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of loads) if (l.expensesTotal) m.set(l.id, l.expensesTotal);
  return m;
}

function tripDateLabel(deliveries: (string | null)[], createdIso: string): string {
  const days = deliveries.filter((d): d is string => !!d).sort();
  if (days.length === 0) return "Created " + fmtShort(createdIso);
  const first = days[0];
  const last = days[days.length - 1];
  if (first === last) return fmtShort(first);
  return fmtShort(first) + " – " + fmtShort(last);
}

export function demoTripsList(now: Date = new Date()): DemoTripCard[] {
  const loads = buildLoads(now);
  const expByLoad = expenseMap(loads);
  return TRIPS.map((t) => {
    const tripLoads = loads.filter((l) => l.trip_id === t.id);
    const rollup = tripRollupLoads(tripLoads);
    const fin = computeTripFinancials(rollup, DEMO_FUEL, FACTORING_IDS, expByLoad, {
      start: t.startOdo,
      end: t.endOdo,
    });
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      notes: t.notes,
      dateLabel: tripDateLabel(
        tripLoads.map((l) => l.delivery_date),
        tripLoads[0]?.created_at ?? now.toISOString(),
      ),
      loads: fin.loads,
      gross: fin.gross,
      net: fin.net,
      spent: fin.spent,
      profitPct: fin.profitPct,
    };
  });
}

/**
 * Raw rows for the inline-rendered trip detail page. Returns null when the id
 * isn't a demo trip. The page runs its own math on these rows, so no branch of
 * the page's logic has to change.
 */
export function demoTripDetail(
  id: string,
  now: Date = new Date(),
): {
  trip: {
    id: string;
    name: string;
    status: string;
    notes: string | null;
    created_at: string;
    start_odometer: number | null;
    end_odometer: number | null;
  };
  loadRows: {
    id: string;
    load_number: string | null;
    broker_id: string | null;
    origin: string | null;
    destination: string | null;
    delivery_date: string | null;
    rate: number;
    loaded_miles: number | null;
    odo_assigned: number | null;
    odo_loaded: number | null;
    odo_delivered: number | null;
    status: string;
    payment_status: string;
  }[];
  fuelRow: { mpg: number; diesel_price_per_gallon: number; factoring_pct: number };
  tripExp: { load_id: string; amount: number }[];
  brokerRows: { id: string; name: string | null; factoring: boolean | null }[];
} | null {
  const t = TRIPS.find((x) => x.id === id);
  if (!t) return null;
  const loads = buildLoads(now).filter((l) => l.trip_id === id);

  // Trip odometer bookends derived from its loads (start = first assigned).
  const odos = loads
    .flatMap((l) => [l.odo_assigned, l.odo_loaded, l.odo_delivered])
    .filter((n): n is number => n != null);
  const startOdo = t.startOdo ?? (odos.length ? Math.min(...odos) : null);
  const endOdo =
    t.status === "closed"
      ? t.endOdo ?? (odos.length ? Math.max(...odos) : null)
      : t.endOdo;

  return {
    trip: {
      id: t.id,
      name: t.name,
      status: t.status,
      notes: t.notes,
      created_at: loads[0]?.created_at ?? now.toISOString(),
      start_odometer: startOdo,
      end_odometer: endOdo,
    },
    loadRows: loads
      .slice()
      .sort((a, b) => (a.delivery_date ?? "~").localeCompare(b.delivery_date ?? "~"))
      .map((l) => ({
        id: l.id,
        load_number: l.load_number,
        broker_id: l.broker_id,
        origin: l.origin,
        destination: l.destination,
        delivery_date: l.delivery_date,
        rate: l.rate,
        loaded_miles: l.loaded_miles,
        odo_assigned: l.odo_assigned,
        odo_loaded: l.odo_loaded,
        odo_delivered: l.odo_delivered,
        status: l.status,
        payment_status: l.payment_status,
      })),
    fuelRow: {
      mpg: DEMO_FUEL.mpg,
      diesel_price_per_gallon: DEMO_FUEL.ppg,
      factoring_pct: DEMO_FUEL.factoringPct,
    },
    tripExp: loads
      .filter((l) => l.expensesTotal)
      .map((l) => ({ load_id: l.id, amount: l.expensesTotal })),
    brokerRows: BROKERS.map((b) => ({ id: b.id, name: b.name, factoring: b.factoring })),
  };
}

// --- Maintenance -----------------------------------------------------------

type ReminderSpec = {
  id: string;
  label: string;
  partGroup: string;
  category: Category;
  interval: number;
  milesSinceService: number; // how far past the last service we are
  lastDate: string;
};

const REMINDER_SPECS: ReminderSpec[] = [
  { id: "demo-rem-oil", label: "Engine oil & filter", partGroup: "engine-oil", category: "Engine Bay", interval: 25000, milesSinceService: 24300, lastDate: "72 days ago" },
  { id: "demo-rem-fuel", label: "Fuel filters (engine + chassis)", partGroup: "fuel-filters", category: "Engine Bay", interval: 30000, milesSinceService: 31200, lastDate: "96 days ago" },
  { id: "demo-rem-trans", label: "Transmission service", partGroup: "transmission", category: "Drivetrain", interval: 60000, milesSinceService: 58600, lastDate: "6 months ago" },
  { id: "demo-rem-steer", label: "Steer tires", partGroup: "steer-tires", category: "Tires & Wheels", interval: 90000, milesSinceService: 41000, lastDate: "5 months ago" },
  { id: "demo-rem-brakes", label: "Tractor brakes", partGroup: "tractor-brakes", category: "Brakes", interval: 100000, milesSinceService: 62000, lastDate: "8 months ago" },
];

function demoReminderViews(odoNow: number): ReminderView[] {
  return REMINDER_SPECS.map((r) => {
    const lastOdo = odoNow - r.milesSinceService;
    const c = computeMaintenance(r.interval, lastOdo, odoNow);
    return {
      id: r.id,
      label: r.label,
      partGroup: r.partGroup,
      category: r.category,
      interval: r.interval,
      status: c.status,
      milesRemaining: c.milesRemaining,
      nextDue: c.nextDue,
      lastOdo,
      lastDate: r.lastDate,
      neverServiced: c.neverServiced,
      pct: c.pct,
    };
  });
}

const REPAIR_ENTRY_SPECS: {
  id: string;
  description: string;
  category: Category;
  position: string | null;
  partGroup: string | null;
  milesAgo: number;
  freshness: "new" | "aging" | "original";
  preventative: boolean;
  hasReminder: boolean;
}[] = [
  { id: "demo-ent-1", description: "Engine oil & filter change", category: "Engine Bay", position: null, partGroup: "engine-oil", milesAgo: 24300, freshness: "aging", preventative: true, hasReminder: true },
  { id: "demo-ent-2", description: "Fuel filters (engine + chassis)", category: "Engine Bay", position: null, partGroup: "fuel-filters", milesAgo: 31200, freshness: "aging", preventative: true, hasReminder: true },
  { id: "demo-ent-3", description: "Steer tire — replaced pair", category: "Tires & Wheels", position: "Front axle", partGroup: "steer-tires", milesAgo: 41000, freshness: "aging", preventative: true, hasReminder: true },
  { id: "demo-ent-4", description: "Drive tire — recap, inner LR", category: "Tires & Wheels", position: "Left rear", partGroup: "drive-tires", milesAgo: 12000, freshness: "new", preventative: false, hasReminder: false },
  { id: "demo-ent-5", description: "Air dryer cartridge", category: "Brakes", position: null, partGroup: "air-dryer", milesAgo: 18000, freshness: "new", preventative: true, hasReminder: false },
  { id: "demo-ent-6", description: "Alternator — replaced", category: "Engine Bay", position: null, partGroup: null, milesAgo: 34000, freshness: "aging", preventative: false, hasReminder: false },
  { id: "demo-ent-7", description: "Trailer ABS sensor", category: "Trailer", position: "Curb side", partGroup: null, milesAgo: 9000, freshness: "new", preventative: false, hasReminder: false },
  { id: "demo-ent-8", description: "U-joints — driveline", category: "Drivetrain", position: null, partGroup: "u-joints", milesAgo: 47000, freshness: "original", preventative: false, hasReminder: false },
];

export function demoMaintenanceHome(now: Date = new Date()): {
  currentOdo: number;
  categoryCards: CategoryCard[];
  preventative: PreventativeSummary;
  alertReminders: ReminderView[];
  entries: RepairEntry[];
  partGroups: string[];
} {
  const loads = buildLoads(now);
  const odoNow = currentOdo(loads);
  const reminders = demoReminderViews(odoNow);

  const entries: RepairEntry[] = REPAIR_ENTRY_SPECS.map((e) => ({
    id: e.id,
    description: e.description,
    category: e.category,
    position: e.position,
    partGroup: e.partGroup,
    date: null,
    odometer: odoNow - e.milesAgo,
    notes: null,
    freshness: e.freshness,
    receiptCount: e.preventative ? 1 : 0,
    relatedCount: 0,
    hasReminder: e.hasReminder,
    isPreventative: e.preventative,
  }));

  // Category cards: count parts per category, worst reminder badge folded in.
  const worstByCategory = new Map<Category, "overdue" | "soon" | "aging" | null>();
  for (const r of reminders) {
    if (r.status === "overdue") worstByCategory.set(r.category, "overdue");
    else if (r.status === "soon" && worstByCategory.get(r.category) !== "overdue")
      worstByCategory.set(r.category, "soon");
  }
  const countByCategory = new Map<Category, number>();
  for (const e of entries) {
    countByCategory.set(e.category, (countByCategory.get(e.category) ?? 0) + 1);
  }
  const categoryCards: CategoryCard[] = [...countByCategory.entries()].map(
    ([category, count]) => ({
      category,
      slug: CATEGORY_SLUG[category],
      count,
      badge: worstByCategory.get(category) ?? null,
    }),
  );

  // Preventative summary: worst reminder state across all categories.
  const anyOverdue = reminders.some((r) => r.status === "overdue");
  const anySoon = reminders.some((r) => r.status === "soon");
  const preventative: PreventativeSummary = {
    count: entries.filter((e) => e.isPreventative).length,
    badge: anyOverdue ? "overdue" : anySoon ? "soon" : null,
  };

  const alertReminders = reminders.filter(
    (r) => r.status === "overdue" || r.status === "soon",
  );

  const partGroups = Array.from(
    new Set(entries.map((e) => e.partGroup).filter((g): g is string => !!g)),
  );

  return {
    currentOdo: odoNow,
    categoryCards,
    preventative,
    alertReminders,
    entries,
    partGroups,
  };
}

// --- Dashboard -------------------------------------------------------------

const NET_PACE_WINDOW_WEEKS = 12;

function demoNetPace(loads: DemoLoadFull[], now: Date): NetPace {
  const cutoff = now.getTime() - NET_PACE_WINDOW_WEEKS * 7 * 86_400_000;
  let windowNet = 0;
  let count = 0;
  for (const l of loads) {
    if (l.status !== "delivered") continue;
    const effIso = l.delivery_date ?? l.created_at;
    const effMs = new Date(
      effIso.length <= 10 ? effIso + "T12:00:00Z" : effIso,
    ).getTime();
    if (!Number.isFinite(effMs) || effMs < cutoff) continue;
    windowNet += l.net;
    count += 1;
  }
  return {
    avgNetPerLoad: count > 0 ? windowNet / count : 0,
    weeklyNetPace: windowNet > 0 ? windowNet / NET_PACE_WINDOW_WEEKS : 0,
  };
}

function demoCountdownGoals(now: Date): CountdownGoal[] {
  const in90 = new Date(now.getTime() + 92 * 86_400_000).toISOString().slice(0, 10);
  const in300 = new Date(now.getTime() + 300 * 86_400_000).toISOString().slice(0, 10);
  const created = new Date(now.getTime() - 40 * 86_400_000).toISOString();
  const createdOld = new Date(now.getTime() - 120 * 86_400_000).toISOString();
  return [
    {
      id: "demo-goal-truck",
      label: "New truck down payment",
      subtitle: "Trade up to a '24 Cascadia",
      targetAmount: 45000,
      targetDate: in300,
      createdAt: createdOld,
    },
    {
      id: "demo-goal-quarter",
      label: "Quarter net target",
      subtitle: "Stay ahead of the season",
      targetAmount: 28000,
      targetDate: in90,
      createdAt: created,
    },
  ];
}

function demoActiveLoads(loads: DemoLoadFull[]): ActiveLoadItem[] {
  return loads
    .filter((l) => ["pending", "assigned", "loaded"].includes(l.status))
    .map((l) => ({
      id: l.id,
      broker: l.broker_name,
      lane: `${l.origin} → ${l.destination}`,
      status: l.status,
      rateDisplay: "$" + Math.round(l.rate).toLocaleString("en-US"),
      rateConCount: l.status === "pending" ? 0 : 1,
      bolCount: 0,
      podCount: 0,
      odoAssigned: l.odo_assigned,
      odoLoaded: l.odo_loaded,
      odoDelivered: l.odo_delivered,
    }));
}

function demoMaintWidget(now: Date): MaintWidgetItem[] {
  const odoNow = currentOdo(buildLoads(now));
  const reminders = demoReminderViews(odoNow);
  const names = ["Engine oil & filter", "Fuel filters (engine + chassis)"];
  return reminders
    .filter((r) => names.includes(r.label))
    .map((r) => ({
      id: r.id,
      name: r.label,
      status: r.status,
      milesRemaining: r.milesRemaining,
      pct: r.pct,
      neverServiced: r.neverServiced,
    }));
}

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function demoAlertGroups(loads: DemoLoadFull[], now: Date): AlertGroup[] {
  const odoNow = currentOdo(loads);
  const reminders = demoReminderViews(odoNow);

  const maintItems = reminders
    .filter((r) => r.status === "overdue" || r.status === "soon")
    .map((r) => {
      const over = r.status === "overdue";
      const mi = r.milesRemaining;
      return {
        id: r.id,
        dismissKey: `maintenance:${r.id}:${r.lastOdo}:${r.status}`,
        title: r.label,
        value:
          mi == null
            ? "—"
            : mi <= 0
              ? `${Math.abs(mi).toLocaleString()} mi over`
              : `${mi.toLocaleString()} mi left`,
        chips: [
          {
            label: over ? "Overdue" : "Due soon",
            tone: over ? ("red" as const) : ("amber" as const),
          },
        ],
        href: "/admin/maintenance",
        action: {
          label: "Log Service",
          href: `/admin/maintenance?log=${r.id}`,
        },
      };
    });

  // Overdue receivables: delivered + unpaid, aged past 40 days.
  const receivableItems = loads
    .filter((l) => l.status === "delivered" && l.payment_status !== "paid")
    .map((l) => ({ l, days: daysOutstanding(l.delivery_date, now) ?? 0 }))
    .filter((r) => r.days >= 40)
    .sort((a, b) => b.days - a.days)
    .map(({ l, days }) => ({
      id: l.id,
      dismissKey: `receivable:${l.id}`,
      title: l.broker_name,
      subtitle: `#${l.load_number} · ${l.origin} → ${l.destination}`,
      value: usd(l.rate),
      chips: [{ label: `${days}d out`, tone: "red" as const }],
      dateLabel: fmtShort(l.delivery_date),
      href: `/admin/dispatch/loads/${l.id}`,
      action: { label: "Open", href: `/admin/dispatch/loads/${l.id}` },
    }));

  const applicationItems = [
    {
      id: "demo-app-1",
      dismissKey: "application:demo-app-1",
      title: "Travis Nolan",
      subtitle: "Job application · last 24 hours",
      href: "/admin/operations?tab=applications",
      action: { label: "Open", href: "/admin/operations?tab=applications" },
    },
    {
      id: "demo-app-2",
      dismissKey: "application:demo-app-2",
      title: "Renee Ford",
      subtitle: "Job application · last 24 hours",
      href: "/admin/operations?tab=applications",
      action: { label: "Open", href: "/admin/operations?tab=applications" },
    },
  ];

  const quoteItems = [
    {
      id: "demo-q-1",
      dismissKey: "quote:demo-q-1",
      title: "Halvorsen Produce",
      subtitle: "Not yet contacted",
      href: "/admin/operations?tab=quotes",
      action: { label: "Open", href: "/admin/operations?tab=quotes" },
    },
    {
      id: "demo-q-2",
      dismissKey: "quote:demo-q-2",
      title: "Delta Building Supply",
      subtitle: "Not yet contacted",
      href: "/admin/operations?tab=quotes",
      action: { label: "Open", href: "/admin/operations?tab=quotes" },
    },
  ];

  return [
    { key: "maintenance", label: "Maintenance", tone: "red", items: maintItems },
    { key: "receivables", label: "Overdue receivables", tone: "red", items: receivableItems },
    { key: "incomplete", label: "Incomplete loads", tone: "amber", items: [] },
    { key: "applications", label: "New applications", tone: "amber", items: applicationItems },
    { key: "quotes", label: "New quote requests", tone: "amber", items: quoteItems },
  ];
}

export function demoDashboard(now: Date = new Date()): DashboardData {
  const loads = buildLoads(now);
  return {
    expiredQuotes: demoPipelineExpired(now),
    activeLoads: demoActiveLoads(loads),
    maintenance: demoMaintWidget(now),
    brokerNames: demoBrokerNames(),
    activeTrips: demoOpenTripNames(),
    countdownGoals: demoCountdownGoals(now),
    netPace: demoNetPace(loads, now),
    alertGroups: demoAlertGroups(loads, now),
    currentCash: DEMO_CURRENT_CASH,
  };
}

// --- Pipeline cards (dashboard expired-quotes table + Quotes page) ---------

export function demoPipelineCards(now: Date = new Date()): PipelineCard[] {
  const ageDays = (d: number) =>
    new Date(now.getTime() - d * 86_400_000).toISOString();
  const mk = (
    id: string,
    name: string,
    days: number,
    status: PipelineCard["status"],
    stage: PipelineCard["stage"],
    commodity: string,
    weight: string,
    price: string | null,
    originZip: string,
    originPlace: string,
    destZip: string,
    destPlace: string,
    miles: number | null,
  ): PipelineCard => ({
    leadId: id,
    name,
    ageLabel: days >= 1 ? `${days}d` : "today",
    dateLabel: fmtShort(ageDays(days)),
    status,
    stage,
    commodity,
    weight,
    priceDisplay: price,
    originZip,
    originPlace,
    destZip,
    destPlace,
    miles,
  });

  return [
    mk("demo-q-1", "Halvorsen Produce", 0, "unseen", "new", "Reefer — mixed produce", "42,000 lb", null, "78501", "McAllen, TX", "60601", "Chicago, IL", 1360),
    mk("demo-q-2", "Delta Building Supply", 1, "followup", "quote", "Flatbed — lumber", "38,000 lb", "$3,150", "37013", "Nashville, TN", "30301", "Atlanta, GA", 250),
    mk("demo-q-3", "Cedarline Foods", 9, "expired", "quote_sent", "Reefer — frozen", "40,000 lb", "$2,900", "68102", "Omaha, NE", "80202", "Denver, CO", 540),
    mk("demo-q-4", "Kellerman Metals", 12, "expired", "quote_sent", "Flatbed — coil steel", "44,000 lb", "$1,850", "63101", "St. Louis, MO", "46204", "Indianapolis, IN", 245),
  ];
}

function demoPipelineExpired(now: Date): PipelineCard[] {
  return demoPipelineCards(now).filter((c) => c.status === "expired");
}
