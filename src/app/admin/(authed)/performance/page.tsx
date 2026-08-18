import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoPerformance } from "@/lib/demo/demoData";
import {
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import {
  closeOutDate,
  goalMonthParts,
  currentBusinessDate,
} from "@/lib/dispatch/goal-month";
import type { PerfLoad } from "@/lib/dispatch/performance";
import { PerformanceView } from "./PerformanceView";
import type { PerformanceData } from "@/lib/dispatch/view-types";

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
 * SCOPE: every non-deleted load, not just delivered ones — pending/assigned/
 * loaded loads count toward the numbers with their booked rate, and a TONU
 * ('tonu' status) load counts its tonu_amount instead. See the loads.map
 * below for the TONU branch.
 *
 * The costing below is a deliberate mirror of the load board's server page:
 * same loadDiesel → loadNet pipeline, same factoring-broker gate, same
 * goal-month attribution (pickup date, matching the Calendar). That's the
 * point — if this page's July net didn't equal the load board's or the
 * Calendar's July net, the page would be worse than useless.
 *
 * This server component ships the full, uncosted-into-buckets `PerfLoad[]`
 * array — every aggregation (month buckets, broker/lane leaderboards,
 * deadhead split, KPI totals) happens CLIENT-SIDE in PerformanceView, because
 * the month/range picker has to re-slice the data interactively with no
 * refetch. Same pattern the Calendar already uses (loadCalendar ships every
 * load once; month navigation happens in CalendarView).
 */

type LoadRowDB = {
  id: string;
  broker_name: string | null;
  broker_id: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  tonu_amount: number | string | null;
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
  // DEMO MODE: return the static fake dataset and never touch Supabase.
  if (await isDemoMode()) return demoPerformance();

  const sb = createServiceRoleClient();

  const [{ data: rows }, { data: fuelRow }, { data: factoringBrokers }] =
    await Promise.all([
      sb
        .from("loads")
        .select(
          "id, broker_name, broker_id, origin, destination, pickup_date, delivery_date, rate, tonu_amount, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, payment_status, paid_at, created_at",
        )
        .is("deleted_at", null)
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
    // Pickup-primary, falling back to delivery then created_at — identical to
    // the Calendar's resolveSpan, so a load lands in the same month here as it
    // does on the Calendar (a Jul 26–Aug 1 straddle counts in July on both).
    const attrDate = closeOutDate(l);
    const attributed = goalMonthParts(attrDate);
    const base = {
      id: l.id,
      year: attributed?.year ?? -1,
      month: attributed?.month ?? -1,
      date: attrDate,
      broker: l.broker_name?.trim() || "Unknown broker",
      origin: l.origin?.trim() || "",
      destination: l.destination?.trim() || "",
      deliveryDate: l.delivery_date,
      // Only a load that is actually marked paid contributes a pay date —
      // a stray paid_at on an unpaid row would otherwise shorten days-to-pay.
      paidAt: l.payment_status === "paid" ? l.paid_at : null,
    };

    if (l.status === "tonu") {
      // TONU: the truck never rolled, so no diesel and no miles — revenue is
      // the flat fee, and it takes the same factoring cut every load can, run
      // through the SAME factoringFee/loadNet path (not a hardcoded rate).
      // Applied regardless of the broker's factoring flag — the owner's call
      // ("tonu fee -3% of course"), unlike the normal factoring-broker gate.
      const rate = num(l.tonu_amount);
      const { net } = loadNet({ rate, diesel: 0, expensesTotal: 0 }, fuel, true);
      return { ...base, rate, net, loadedMiles: 0, deadheadMiles: 0 };
    }

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
    return {
      ...base,
      rate,
      net,
      loadedMiles: md.loaded ?? 0,
      deadheadMiles: md.deadhead ?? 0,
    };
  });

  return {
    loads,
    monthlyGoal,
    // A/R is money owed on WORK THAT HAPPENED — delivered loads (rate) and
    // unpaid TONU loads (tonu_amount) — never a pending/booked-not-yet-run
    // load, which hasn't been invoiced. Same definition the load board and
    // the receivables page use for delivered loads. Always all-time — it's a
    // snapshot of money currently owed, not a period-scoped figure.
    arTotal: (rows ?? [])
      .filter(
        (l) =>
          (l.status === "delivered" || l.status === "tonu") &&
          l.payment_status !== "paid",
      )
      .reduce(
        (s, l) => s + (l.status === "tonu" ? num(l.tonu_amount) : num(l.rate)),
        0,
      ),
    // "Today" in the business timezone (America/Chicago) — the client uses
    // this (never its own clock) to default the month/range pickers and to
    // compute days-remaining-in-month, so a server-rendered page and a
    // client re-render never disagree across the hydration boundary.
    today: currentBusinessDate(new Date()),
  };
}

export default async function PerformancePage() {
  const data = await performanceData();
  return <PerformanceView data={data} />;
}
