import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { dateOnly } from "@/lib/dispatch/calendar";
import { currentBusinessDate } from "@/lib/dispatch/goal-month";
import {
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import { CalendarView, type LoadBar, type RepairChip } from "./CalendarView";

export const metadata: Metadata = {
  title: "Calendar",
  robots: { index: false, follow: false },
};

/**
 * Admin → Calendar.
 *
 * An activity logbook: a month grid (Sun–Sat) showing where Brent's been and
 * what he did. Load bars span pickup → delivery, repair services drop a chip on
 * their day, and real US federal holidays are marked. Read-only — every figure
 * comes from existing tables (loads, repair_services + repair_entries); no
 * writes. Month navigation + the desktop-grid / mobile-agenda switch all happen
 * client-side in CalendarView, so this component just shapes the data once.
 */

type LoadRow = {
  id: string;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  status: string | null;
  created_at: string;
  broker_id: string | null;
  rate: number | string | null;
  loaded_miles: number | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

type PartRow = {
  id: string;
  description: string;
  service_id: string;
  created_at: string;
};

type ServiceRow = {
  id: string;
  service_date: string | null;
  created_at: string;
  shop: string | null;
};

function place(s: string | null): string {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : "—";
}

/**
 * Resolve a load's calendar span. Primary = pickup_date → delivery_date. When
 * an older load is missing those, FALL BACK so it still appears somewhere:
 *   - only one of pickup/delivery present → single-day bar on that date
 *   - neither present → single-day bar on created_at (flagged approximate)
 * The delivered-stage odometer carries no timestamp on the loads table, so
 * created_at is the last-resort anchor. `end` is never before `start`.
 */
function resolveSpan(l: LoadRow): { start: string; end: string; approx: boolean } {
  const pickup = dateOnly(l.pickup_date);
  const delivery = dateOnly(l.delivery_date);
  if (pickup && delivery) {
    return { start: pickup, end: delivery < pickup ? pickup : delivery, approx: false };
  }
  if (pickup) return { start: pickup, end: pickup, approx: false };
  if (delivery) return { start: delivery, end: delivery, approx: false };
  const created = dateOnly(l.created_at) ?? l.created_at.slice(0, 10);
  return { start: created, end: created, approx: true };
}

async function loadCalendar(): Promise<{ loads: LoadBar[]; repairs: RepairChip[]; today: string }> {
  const sb = createServiceRoleClient();

  const [
    { data: loadRows },
    { data: partRows },
    { data: serviceRows },
    { data: fuelRow },
    { data: expRows },
    { data: factoringBrokers },
  ] = await Promise.all([
    sb
      .from("loads")
      .select(
        "id, origin, destination, pickup_date, delivery_date, status, created_at, broker_id, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered",
      )
      .is("deleted_at", null)
      .returns<LoadRow[]>(),
    sb
      .from("repair_entries")
      .select("id, description, service_id, created_at")
      .is("deleted_at", null)
      .returns<PartRow[]>(),
    sb
      .from("repair_services")
      .select("id, service_date, created_at, shop")
      .returns<ServiceRow[]>(),
    sb
      .from("dispatch_settings")
      .select("mpg, diesel_price_per_gallon, factoring_pct")
      .eq("id", true)
      .maybeSingle<{
        mpg: number | string;
        diesel_price_per_gallon: number | string;
        factoring_pct: number | string;
      }>(),
    sb
      .from("load_expenses")
      .select("load_id, amount")
      .is("deleted_at", null)
      .returns<{ load_id: string; amount: number | string }[]>(),
    sb
      .from("brokers")
      .select("id")
      .eq("factoring", true)
      .is("deleted_at", null)
      .returns<{ id: string }[]>(),
  ]);

  // Same fuel/factoring inputs the Load Board feeds into loadNet, so the
  // per-load net here is the canonical one (not a recomputation).
  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct:
      fuelRow?.factoring_pct != null
        ? num(fuelRow.factoring_pct)
        : FUEL_DEFAULTS.factoringPct,
  };
  const expByLoad = new Map<string, number>();
  for (const e of expRows ?? []) {
    expByLoad.set(e.load_id, (expByLoad.get(e.load_id) ?? 0) + num(e.amount));
  }
  const factoringIds = new Set((factoringBrokers ?? []).map((b) => b.id));

  const loads: LoadBar[] = (loadRows ?? []).map((l) => {
    const span = resolveSpan(l);
    // Canonical per-load net via the shared loadDiesel/loadNet helpers — the
    // exact same call the Load Board makes. Cancelled loads are excluded from
    // the weekly total, so their net is left at 0.
    const md = loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      fuel,
    );
    const net =
      l.status === "cancelled"
        ? 0
        : loadNet(
            {
              rate: num(l.rate),
              diesel: md.diesel,
              expensesTotal: expByLoad.get(l.id) ?? 0,
            },
            fuel,
            l.broker_id != null && factoringIds.has(l.broker_id),
          ).net;
    return {
      id: l.id,
      label: `${place(l.origin)} → ${place(l.destination)}`,
      start: span.start,
      end: span.end,
      approx: span.approx,
      cancelled: l.status === "cancelled",
      net,
    };
  });

  // Group parts by service (earliest-created part leads the chip label + is the
  // link target — the maintenance detail route is keyed on a part id).
  const partsByService = new Map<string, PartRow[]>();
  for (const p of partRows ?? []) {
    const arr = partsByService.get(p.service_id);
    if (arr) arr.push(p);
    else partsByService.set(p.service_id, [p]);
  }

  const repairs: RepairChip[] = [];
  for (const s of serviceRows ?? []) {
    const parts = (partsByService.get(s.id) ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    if (parts.length === 0) continue; // a service with no parts has nothing to show
    const date = dateOnly(s.service_date) ?? dateOnly(s.created_at);
    if (!date) continue;
    const first = parts[0];
    const label =
      parts.length === 1
        ? first.description
        : `${first.description} +${parts.length - 1}`;
    repairs.push({
      id: s.id,
      date,
      label,
      partCount: parts.length,
      href: `/admin/maintenance/${first.id}`,
    });
  }

  // Resolved in America/Chicago, not the server's UTC clock — CalendarView both
  // draws the today marker on this date and opens on its month, so a UTC "today"
  // put the circle a day ahead every evening from 7pm Central on.
  const today = currentBusinessDate(new Date());
  return { loads, repairs, today };
}

export default async function CalendarPage() {
  const { loads, repairs, today } = await loadCalendar();
  return <CalendarView loads={loads} repairs={repairs} today={today} />;
}
