import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
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
  currentGoalMonthLabel,
} from "@/lib/dispatch/goal-month";

export const metadata: Metadata = {
  title: "Load Board",
  robots: { index: false, follow: false },
};

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
    .select("mpg, diesel_price_per_gallon, factoring_pct")
    .eq("id", true)
    .maybeSingle<{
      mpg: number | string;
      diesel_price_per_gallon: number | string;
      factoring_pct: number | string;
    }>();
  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct: fuelRow?.factoring_pct != null ? num(fuelRow.factoring_pct) : FUEL_DEFAULTS.factoringPct,
  };

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

  // The Net-profit-goal gauge is MONTHLY and resets at the start of each
  // month: it sums the net of ALL loads — delivered AND in-progress
  // (pending/assigned/loaded/…) — whose goal-month (close-out date − 1 day) is
  // the current calendar month. Including in-progress loads keeps it a LIVE
  // figure: the current load's running net counts and drops in real time as
  // expenses are added. A load closed out on the 1st lands in the previous
  // month, so on the 1st the new month's gauge starts fresh.
  //
  // "Current month" is resolved in the BUSINESS timezone, not the server's UTC
  // clock — otherwise on the last evening of a month (already next-month in UTC)
  // the gauge would zero the still-current month for a Central-time operator.
  const now = new Date();
  const { year: curYear, month: curMonth } = currentGoalMonth(now);
  let monthGoalNet = 0;

  const rows = (data ?? []).map((l) => {
    const cancelled = l.status === "cancelled";
    // A cancelled load earns only a TONU fee (if any); otherwise its rate.
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
    if (goal && goal.year === curYear && goal.month === curMonth) {
      monthGoalNet += net;
    }
    return {
      id: l.id,
      loadNumber: l.load_number?.trim() || "—",
      broker: l.broker_name?.trim() || "—",
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
  const goalMonthLabel = currentGoalMonthLabel(now);

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
  const { data: tripRows } = await sb
    .from("trips")
    .select("name")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<{ name: string | null }[]>();
  const activeTrips = (tripRows ?? [])
    .map((t) => t.name?.trim() ?? "")
    .filter((n) => n.length > 0);

  // Summary stats (Net profit goal, Total loads, A/R, Delivered, Gross, Net,
  // Avg/mi) are computed client-side in LoadBoardView so they react to the
  // month filter. The page-level mileage/deadhead summary aggregates were
  // removed with their cards.
  return { rows, brokerNames, activeTrips, monthGoalNet, goalMonthLabel };
}

export default async function LoadBoardPage() {
  const data = await loadBoard();
  return <LoadBoardView data={data} />;
}
