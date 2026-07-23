import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import {
  closeOutDate,
  goalMonthParts,
  currentGoalMonth,
  currentGoalMonthLabel,
  daysLeftInMonth,
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
import { PerformanceView, type PerformanceData } from "./PerformanceView";

export const metadata: Metadata = {
  title: "Performance",
  robots: { index: false, follow: false },
};

// Always render fresh. This page is a live read off the loads table (net/gross,
// month buckets, A/R), so it must reflect the current DB on every visit — never
// a build-time or ISR snapshot. Without this the numbers only moved on a hard
// refresh, because the route sat in the Full Route Cache between navigations.
// Load mutations also revalidatePath("/admin/performance") (see the load
// actions) — belt and suspenders, so a change shows even mid-cache-window.
export const dynamic = "force-dynamic";

/**
 * Insights → Performance.
 *
 * Derived entirely from data that already exists — loads, their expenses, the
 * brokers' factoring flag, and the dispatch settings. NO new tables, no
 * materialized rollup: this page is a read.
 *
 * The costing below is a deliberate mirror of the load board's server page:
 * same loadDiesel → loadNet pipeline, same factoring-broker gate, same
 * goal-month attribution. That's the point — if this page's July net didn't
 * equal the load board's July net, the page would be worse than useless.
 */

const MONTH_WINDOW = 12;

type LoadRowDB = {
  id: string;
  broker_name: string | null;
  broker_id: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  loaded_miles: number | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  status: string;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function performanceData(): Promise<PerformanceData> {
  const sb = createServiceRoleClient();

  const [{ data: rows }, { data: fuelRow }, { data: factoringBrokers }] =
    await Promise.all([
      sb
        .from("loads")
        .select(
          "id, broker_name, broker_id, origin, destination, pickup_date, delivery_date, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, payment_status, paid_at, created_at",
        )
        .is("deleted_at", null)
        .eq("status", "delivered")
        .returns<LoadRowDB[]>(),
      sb
        .from("dispatch_settings")
        .select("mpg, diesel_price_per_gallon, factoring_pct, monthly_net_goal")
        .eq("id", true)
        .maybeSingle<{
          mpg: number | string;
          diesel_price_per_gallon: number | string;
          factoring_pct: number | string;
          monthly_net_goal: number | string | null;
        }>(),
      sb
        .from("brokers")
        .select("id")
        .eq("factoring", true)
        .is("deleted_at", null)
        .returns<{ id: string }[]>(),
    ]);

  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct:
      fuelRow?.factoring_pct != null
        ? num(fuelRow.factoring_pct)
        : FUEL_DEFAULTS.factoringPct,
  };
  const monthlyGoal = num(fuelRow?.monthly_net_goal ?? null) || 10000;
  const factoringIds = new Set((factoringBrokers ?? []).map((b) => b.id));

  // Manually-entered per-load expenses — the third term in loadNet.
  const loadIds = (rows ?? []).map((l) => l.id);
  const { data: expRows } = await sb
    .from("load_expenses")
    .select("load_id, amount")
    .in(
      "load_id",
      loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"],
    )
    .is("deleted_at", null)
    .returns<{ load_id: string; amount: number | string }[]>();
  const expByLoad = new Map<string, number>();
  for (const e of expRows ?? []) {
    expByLoad.set(e.load_id, (expByLoad.get(e.load_id) ?? 0) + num(e.amount));
  }

  const loads: PerfLoad[] = (rows ?? []).map((l) => {
    const rate = num(l.rate);
    const md = loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      fuel,
    );
    const { net } = loadNet(
      { rate, diesel: md.diesel, expensesTotal: expByLoad.get(l.id) ?? 0 },
      fuel,
      l.broker_id != null && factoringIds.has(l.broker_id),
    );
    const attributed = goalMonthParts(closeOutDate(l));
    return {
      id: l.id,
      rate,
      net,
      loadedMiles: md.loaded ?? 0,
      deadheadMiles: md.deadhead ?? 0,
      year: attributed?.year ?? -1,
      month: attributed?.month ?? -1,
      broker: l.broker_name?.trim() || "Unknown broker",
      origin: l.origin?.trim() || "",
      destination: l.destination?.trim() || "",
      deliveryDate: l.delivery_date,
      // Only a load that is actually marked paid contributes a pay date —
      // a stray paid_at on an unpaid row would otherwise shorten days-to-pay.
      paidAt: l.payment_status === "paid" ? l.paid_at : null,
    };
  });

  const now = new Date();
  const { year: curYear, month: curMonth } = currentGoalMonth(now);
  const months = monthlyBuckets(loads, MONTH_WINDOW);
  const curKey = monthKey(curYear, curMonth);
  const curIndex = months.findIndex((b) => b.key === curKey);

  return {
    monthLabel: currentGoalMonthLabel(now),
    // Days left in the current month (incl. today), business-tz — the
    // denominator for the goal card's "avg needed per week" pace figure.
    // Only meaningful while the current month is the one being viewed.
    daysLeft: daysLeftInMonth(now),
    // Read off the SAME loads array every figure below is built from — the
    // takeaways quote the aggregations, they don't re-derive them.
    takeaways: takeaways(loads, {
      year: curYear,
      month: curMonth,
      monthlyGoal,
      daysRemaining: daysLeftInMonth(now),
    }),
    currentMonth: summarize(
      loads.filter((l) => l.year === curYear && l.month === curMonth),
    ),
    allTime: summarize(loads),
    // Read off the same contiguous buckets the ledger and charts draw, so the
    // "▲ +12%" on a tile is exactly the move between the ledger's top two rows.
    deltas: monthDeltas(months, curIndex),
    pay: payTiming(loads),
    months,
    highlightIndex: curIndex,
    monthlyGoal,
    // The leaderboards are tables now, not eight-bar charts — they can carry
    // real depth, and the operator sorts rather than scrolls to find a row.
    brokers: brokerStats(loads, 50),
    lanes: laneStats(loads, 50),
    deadhead: deadheadSplit(loads),
    // A/R is the RATE still owed on delivered-but-unpaid loads — the same
    // definition the load board and the receivables page use.
    arTotal: (rows ?? [])
      .filter((l) => l.payment_status !== "paid")
      .reduce((s, l) => s + num(l.rate), 0),
  };
}

export default async function PerformancePage() {
  const data = await performanceData();
  return <PerformanceView data={data} />;
}
