import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LoadBoardView, type LoadBoardData } from "./LoadBoardView";
import {
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";

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
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

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
      "id, load_number, broker_name, equipment, origin, destination, pickup_date, delivery_date, trip_name, rate, tonu_amount, loaded_miles, deadhead_to_miles, deadhead_from_miles, odo_assigned, odo_loaded, odo_delivered, fuel_cost, factoring_fee, misc_cost, status, payment_status",
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
        ).net;
    const dhMiles = md.deadhead ?? 0;
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
      deadheadTo: md.deadhead ?? 0,
      deadheadFrom: 0,
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

  const live = rows.filter((r) => r.status !== "cancelled");
  const delivered = rows.filter((r) => r.status === "delivered");
  const inTransit = rows.filter(
    (r) => r.status === "assigned" || r.status === "loaded",
  ).length;
  const openAssigned = rows.filter((r) => r.status === "pending").length;

  // Gross / net span every row: cancelled loads contribute only their TONU
  // (0 if none), live loads contribute their rate / net.
  const gross = rows.reduce((s, r) => s + r.rate, 0);
  const net = rows.reduce((s, r) => s + r.net, 0);
  const ar = delivered
    .filter((r) => r.paymentStatus !== "paid")
    .reduce((s, r) => s + r.rate, 0);
  const totalLoadedMiles = live.reduce((s, r) => s + (r.loadedMiles ?? 0), 0);
  const avgNetPerMile = totalLoadedMiles > 0 ? net / totalLoadedMiles : 0;
  const avgGrossPerMile = totalLoadedMiles > 0 ? gross / totalLoadedMiles : 0;

  const toPickup = rows.reduce((s, r) => s + r.deadheadTo, 0);
  const fromDelivery = rows.reduce((s, r) => s + r.deadheadFrom, 0);
  const totalDh = toPickup + fromDelivery;

  return {
    rows,
    brokerNames,
    activeTrips,
    kpis: {
      totalLoads: rows.length,
      inTransit,
      openAssigned,
      delivered: delivered.length,
      completionPct:
        rows.length > 0 ? Math.round((delivered.length / rows.length) * 100) : 0,
      gross,
      net,
      ar,
      arCount: delivered.filter((r) => r.paymentStatus !== "paid").length,
      avgNetPerMile,
      avgGrossPerMile,
    },
    deadhead: {
      toPickup,
      fromDelivery,
      totalDh,
      dhFuelCost: Math.round((totalDh / fuel.mpg) * fuel.ppg),
    },
  };
}

export default async function LoadBoardPage() {
  const data = await loadBoard();
  return <LoadBoardView data={data} />;
}
