import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoLoadBoard } from "@/lib/demo/demoData";
import { fetchOpenTripNames } from "@/lib/dispatch/active-trips";
import { LoadBoardView, type LoadBoardData } from "./LoadBoardView";
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
  currentBusinessDate,
  daysLeftInMonth as daysLeftInBusinessMonth,
} from "@/lib/dispatch/goal-month";

export const metadata: Metadata = {
  title: "Load Board",
  robots: { index: false, follow: false },
};

// Live read off the loads table (KPI strip, monthly net/gross, A/R). Render
// fresh every visit so an added/edited load shows without a hard refresh,
// instead of serving a cached route snapshot.
export const dynamic = "force-dynamic";

/**
 * Dispatch → Load Board.
 *
 * Carrier-side view of every load hauled for brokers: rate, miles,
 * deadhead, fuel/factoring/misc costs, and the resulting net profit, with
 * a KPI strip and an A/R figure for delivered-but-unpaid loads.
 */

type LoadRowDB = {
  id: string;
  load_number: string | null;
  broker_name: string | null;
  broker_id: string | null;
  equipment: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  trip_name: string | null;
  rate: number | string | null;
  tonu_amount: number | string | null;
  loaded_miles: number | null;
  deadhead_to_miles: number | null;
  deadhead_from_miles: number | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  fuel_cost: number | string | null;
  factoring_fee: number | string | null;
  misc_cost: number | string | null;
  status: string;
  payment_status: string;
  created_at: string;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// closeOutDate + goalMonthParts moved to @/lib/dispatch/goal-month (shared with
// the Vitest spec so the boundary rule has one implementation).

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function loadBoard(): Promise<LoadBoardData> {
  // DEMO MODE: return the static fake dataset and never touch Supabase.
  if (await isDemoMode()) return demoLoadBoard();

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("loads")
    .select(
      "id, load_number, broker_name, broker_id, equipment, origin, destination, pickup_date, delivery_date, trip_name, rate, tonu_amount, loaded_miles, deadhead_to_miles, deadhead_from_miles, odo_assigned, odo_loaded, odo_delivered, fuel_cost, factoring_fee, misc_cost, status, payment_status, created_at",
    )
    .is("deleted_at", null)
    .order("delivery_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<LoadRowDB[]>();

  const { data: fuelRow } = await sb
    .from("dispatch_settings")
    .select(
      "mpg, diesel_price_per_gallon, factoring_pct, monthly_net_goal, annual_net_goal",
    )
    .eq("id", true)
    .maybeSingle<{
      mpg: number | string;
      diesel_price_per_gallon: number | string;
      factoring_pct: number | string;
      monthly_net_goal: number | string | null;
      annual_net_goal: number | string | null;
    }>();
  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct: fuelRow?.factoring_pct != null ? num(fuelRow.factoring_pct) : FUEL_DEFAULTS.factoringPct,
  };
  // Editable goal-bar targets (fall back to the prior defaults pre-migration).
  const monthlyGoal = num(fuelRow?.monthly_net_goal ?? null) || 10000;
  const annualGoal = num(fuelRow?.annual_net_goal ?? null) || 120000;

  // Sum manual expenses per load.
  const { data: expRows } = await sb
    .from("load_expenses")
    .select("load_id, amount")
    .is("deleted_at", null)
    .returns<{ load_id: string; amount: number | string }[]>();
  const expByLoad = new Map<string, number>();
  for (const e of expRows ?? []) {
    expByLoad.set(e.load_id, (expByLoad.get(e.load_id) ?? 0) + num(e.amount));
  }

  // Brokers that factor — only their loads incur a factoring fee.
  const { data: factoringBrokers } = await sb
    .from("brokers")
    .select("id")
    .eq("factoring", true)
    .is("deleted_at", null)
    .returns<{ id: string }[]>();
  const factoringIds = new Set((factoringBrokers ?? []).map((b) => b.id));

  // The month dropdown defaults to the CURRENT month, resolved in the business
  // timezone (America/Chicago) — not the server's UTC clock, which on the last
  // evening of a month is already next-month and would default the board wrong.
  // Per-month net (the goal bar + KPIs) is computed client-side in
  // LoadBoardView from each load's attributed month, so every month is its own
  // self-contained bucket that the dropdown slices.
  const now = new Date();
  const { month: currentMonth } = currentGoalMonth(now);
  // Calendar context for the performance card's pace figures (Avg Needed Per
  // Week, Projected Goal Completion). Resolved HERE, in the business timezone,
  // for the same reason currentMonth is: a client-side `new Date()` would put
  // the operator's browser clock against the server's and let the two disagree
  // across a hydration boundary. daysLeft includes today.
  const daysLeftInMonth = daysLeftInBusinessMonth(now);
  const today = currentBusinessDate(now);
  const [tYear, tMonth] = today.split("-").map(Number);
  // Day 0 of the NEXT month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(tYear, tMonth, 0)).getUTCDate();

  const rows = (data ?? []).map((l) => {
    const cancelled = l.status === "tonu";
    // A cancelled/TONU load earns only its TONU fee (if any); otherwise its rate.
    const rate = cancelled ? num(l.tonu_amount) : num(l.rate);
    const md = loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      fuel,
    );
    const net = cancelled
      ? rate
      : loadNet(
          { rate, diesel: md.diesel, expensesTotal: expByLoad.get(l.id) ?? 0 },
          fuel,
          l.broker_id != null && factoringIds.has(l.broker_id),
        ).net;
    const dhMiles = md.deadhead ?? 0;
    const goal = goalMonthParts(closeOutDate(l));
    return {
      id: l.id,
      loadNumber: l.load_number?.trim() || "—",
      broker: l.broker_name?.trim() || "—",
      // Already selected for the factoring lookup above — carried onto the row
      // so a load card's "Call Broker" can reach the broker's profile.
      brokerId: l.broker_id,
      equipment: l.equipment?.trim() || "",
      origin: l.origin?.trim() || "—",
      destination: l.destination?.trim() || "—",
      pickup: fmtDate(l.pickup_date),
      delivery: fmtDate(l.delivery_date),
      trip: l.trip_name?.trim() || "",
      rate,
      net,
      loadedMiles: md.loaded,
      dhMiles,
      month: goal ? goal.month : -1,
      status: l.status,
      paymentStatus: l.payment_status,
    };
  });
  // Existing brokers for the Add-load autocomplete.
  const { data: brokerRows } = await sb
    .from("brokers")
    .select("name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<{ name: string | null }[]>();
  const brokerNames = (brokerRows ?? [])
    .map((b) => b.name?.trim() ?? "")
    .filter((n) => n.length > 0);

  // Active trips come from the trips table (so brand-new, still-empty trips
  // show up in the Add Load picker too). The form defaults when there's one.
  const activeTrips = await fetchOpenTripNames(sb);

  // Accounts receivable is ALL-TIME, not month-scoped: an unpaid load stays
  // owed no matter which month it was delivered, so the A/R figure is the SAME
  // on every month view (unlike the profit-goal bar). Sum the RATE of every
  // delivered-but-unpaid load across all months. Computed on the server from
  // the full row set so the month dropdown can never change it.
  const arTotal = rows
    .filter((r) => r.status === "delivered" && r.paymentStatus !== "paid")
    .reduce((s, r) => s + r.rate, 0);

  // Summary stats (the per-month profit-goal bar, Total loads, Delivered,
  // Gross, Net, Avg/mi) are computed client-side in LoadBoardView from the
  // selected month's rows, so every figure on screen agrees for that month.
  // A/R is the one exception — it's all-time and passed in from here.
  return {
    rows,
    brokerNames,
    activeTrips,
    currentMonth,
    arTotal,
    monthlyGoal,
    annualGoal,
    daysLeftInMonth,
    daysInMonth,
  };
}

export default async function LoadBoardPage() {
  const data = await loadBoard();
  return <LoadBoardView data={data} />;
}
