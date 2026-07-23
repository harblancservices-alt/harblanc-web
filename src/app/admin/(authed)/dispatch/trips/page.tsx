import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoTripsList } from "@/lib/demo/demoData";
import { FUEL_DEFAULTS, type FuelSettings } from "@/lib/dispatch/fuel";
import {
  computeTripFinancials,
  type TripRollupLoad,
} from "@/lib/dispatch/trip-rollup";
import { NewTripButton } from "./NewTripButton";
import { TripsListView } from "./TripsListView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Trips",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Trips. Group loads into trips (an OTR run, out & back) and
 * track profitability. Active trips up top, closed trips below.
 *
 * Gross / net / spent use the shared computeTripFinancials rollup — the SAME
 * math the trip detail page uses — so the cards and the detail page always
 * agree. (Net is rate − diesel − factoring − expenses, NOT the unpopulated
 * fuel_cost/factoring_fee/misc_cost columns, which made net read as gross.)
 */

type TripRow = {
  id: string;
  name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  start_odometer: number | null;
  end_odometer: number | null;
};
type LoadAgg = TripRollupLoad & {
  trip_id: string | null;
  delivery_date: string | null;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Trip dates are formatted on the SERVER so the card can't hydrate to a
 * different string in a browser whose timezone differs from the server's.
 * delivery_date is a date-only column, so it's read as UTC to keep "Jun 3"
 * from sliding to "Jun 2" west of Greenwich.
 */
function fmtDay(iso: string, withYear: boolean): string {
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  });
}

/**
 * The span a trip's loads actually ran, from their delivery dates. Falls back
 * to the trip's created date when no load on it has a delivery date yet, so
 * the card always has a date line rather than an empty gap.
 */
function tripDateLabel(loads: LoadAgg[], createdAt: string): string {
  const days = loads
    .filter((l) => l.status !== "cancelled" && l.delivery_date)
    .map((l) => l.delivery_date as string)
    .sort();
  if (days.length === 0) return "Created " + fmtDay(createdAt, true);
  const first = days[0];
  const last = days[days.length - 1];
  if (first === last) return fmtDay(first, true);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return fmtDay(first, !sameYear) + " – " + fmtDay(last, true);
}
type TripCard = {
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

async function realTripsData(): Promise<TripCard[]> {
  const sb = createServiceRoleClient();
  const [{ data: tripRows }, { data: loadRows }, { data: fuelRow }, { data: factoringBrokers }] =
    await Promise.all([
      sb
        .from("trips")
        .select("id, name, status, notes, created_at, start_odometer, end_odometer")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .returns<TripRow[]>(),
      sb
        .from("loads")
        .select(
          "id, trip_id, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, broker_id, status, delivery_date",
        )
        .is("deleted_at", null)
        .not("trip_id", "is", null)
        .returns<LoadAgg[]>(),
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
      fuelRow?.factoring_pct != null ? num(fuelRow.factoring_pct) : FUEL_DEFAULTS.factoringPct,
  };
  const factoringIds = new Set((factoringBrokers ?? []).map((b) => b.id));

  // Manual expenses per load (across all trip loads), keyed by load id.
  const loadIds = (loadRows ?? []).map((l) => l.id);
  const { data: expRows } = await sb
    .from("load_expenses")
    .select("load_id, amount")
    .in("load_id", loadIds.length ? loadIds : ["00000000-0000-0000-0000-000000000000"])
    .is("deleted_at", null)
    .returns<{ load_id: string; amount: number | string }[]>();
  const expByLoad = new Map<string, number>();
  for (const e of expRows ?? []) {
    expByLoad.set(e.load_id, (expByLoad.get(e.load_id) ?? 0) + num(e.amount));
  }

  // Group the trip loads by trip, then roll up each trip with the shared math.
  const loadsByTrip = new Map<string, LoadAgg[]>();
  for (const l of loadRows ?? []) {
    if (!l.trip_id) continue;
    const arr = loadsByTrip.get(l.trip_id) ?? [];
    arr.push(l);
    loadsByTrip.set(l.trip_id, arr);
  }

  return (tripRows ?? []).map((t) => {
    const tripLoads = loadsByTrip.get(t.id) ?? [];
    const fin = computeTripFinancials(
      tripLoads,
      fuel,
      factoringIds,
      expByLoad,
      { start: t.start_odometer, end: t.end_odometer },
    );
    return {
      id: t.id,
      name: t.name?.trim() || "Untitled trip",
      status: t.status,
      notes: t.notes?.trim() || null,
      dateLabel: tripDateLabel(tripLoads, t.created_at),
      loads: fin.loads,
      gross: fin.gross,
      net: fin.net,
      spent: fin.spent,
      profitPct: fin.profitPct,
    };
  });
}

export default async function TripsPage() {
  // DEMO MODE: build the trip cards from the static fake dataset — never
  // touch Supabase.
  const trips: TripCard[] = (await isDemoMode())
    ? demoTripsList()
    : await realTripsData();

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Dispatch"
          title="Trips"
          className="mb-1.5"
          actions={<NewTripButton />}
        />
        <p className="mb-3 text-[13px] text-fg-muted">
          Group loads into trips and track performance.
        </p>

        {trips.length === 0 ? (
          <div className="mx-auto w-full max-w-2xl rounded-lg border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            No trips yet — hit “New Trip”, or just type a trip name when adding a
            load and it’ll appear here.
          </div>
        ) : (
          <TripsListView trips={trips} />
        )}
      </div>
    </div>
  );
}
