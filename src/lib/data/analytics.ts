/**
 * Analytics-specific data module for Calendar (v2-design.md §8) and
 * Performance (§23) — deliberately NOT one of the `lib/data/*` entity
 * modules (loads.ts, trips.ts, expenses.ts, brokers.ts). Phase 3c builds
 * these two screens while other concurrent work is touching the shared
 * loads/trips/expenses/brokers modules and the `DataSource` seam
 * (lib/demo/data-source.ts, live-data-source.ts, demo-data-source.ts); to
 * avoid colliding with that work, this file is new and self-contained — it
 * queries Supabase directly (mirroring live-data-source.ts's own pattern)
 * instead of routing through `DataSource`.
 *
 * It still respects demo-mode isolation (checks `isDemoMode()` itself and
 * reads the same in-memory demo dataset when on — never touches Supabase in
 * that case) and reuses, rather than re-derives, the same domain engine
 * (`lib/domain/money.ts`, `lib/domain/attribution.ts`) and the same pure,
 * already-audited-correct aggregation functions Performance needs
 * (`lib/dispatch/performance.ts`) — Calendar and Performance both read
 * loads through this one module, attributed the one way
 * (`attributionDate` = pickup date), so the two screens cannot disagree.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { buildDemoData } from "@/lib/demo/demo-dataset";
import { computeLoadNet, computeTripNet, FUEL_DEFAULTS, type FuelSettings, type TripFinancials, type TripRollupLoad } from "@/lib/domain/money";
import { attributionDate, periodOf, loadsPeriodFilter } from "@/lib/domain/attribution";
import type { PerfLoad } from "@/lib/dispatch/performance";

export type DateRange = { start: string; end: string }; // pickup_date in [start, end)

export type AnalyticsLoad = PerfLoad & {
  loadNumber: string | null;
  status: string;
  tripId: string | null;
  tripName: string | null;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `end`-exclusive helper: the YYYY-MM-DD one day after `dateStr` (UTC), so
 * a caller can turn an inclusive "to" date into a `[start, end)` range. */
export function dayAfter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_MONTHLY_GOAL = 10000;
const DEFAULT_ANNUAL_GOAL = 120000;

/** Both net-profit goals from `dispatch_settings` in one round trip — the
 * same figures Today's goal widget, the Load Board goal bar, and
 * Performance's monthly AND annual goal cards must all agree on (every
 * consumer feeds these into the one shared lib/domain/goal-pace.ts's
 * computeGoalPace(), never a page-local goal number). */
export async function getNetGoals(): Promise<{ monthly: number; annual: number }> {
  if (await isDemoMode()) return { monthly: DEFAULT_MONTHLY_GOAL, annual: DEFAULT_ANNUAL_GOAL };
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("dispatch_settings")
    .select("monthly_net_goal, annual_net_goal")
    .eq("id", true)
    .maybeSingle<{ monthly_net_goal: number | string | null; annual_net_goal: number | string | null }>();
  return {
    monthly: data?.monthly_net_goal != null ? num(data.monthly_net_goal) : DEFAULT_MONTHLY_GOAL,
    annual: data?.annual_net_goal != null ? num(data.annual_net_goal) : DEFAULT_ANNUAL_GOAL,
  };
}

/** The monthly net-profit goal alone — thin wrapper over getNetGoals() kept
 * for existing single-value callers (Today's dashboard, the Load Board goal
 * bar); Performance itself calls getNetGoals() directly to avoid firing the
 * same settings query twice now that it also needs the annual figure. */
export async function getMonthlyNetGoal(): Promise<number> {
  return (await getNetGoals()).monthly;
}

type LoadInput = {
  id: string;
  loadNumber: string | null;
  brokerId: string | null;
  brokerName: string | null;
  origin: string | null;
  destination: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  rate: number | string | null;
  tonuAmount: number | string | null;
  loadedMilesEstimate: number | null;
  odoAssigned: number | null;
  odoLoaded: number | null;
  odoDelivered: number | null;
  status: string;
  paidAt: string | null;
  createdAt: string | null;
  tripId: string | null;
};

/** Runs a raw load through the one money engine + the one attribution rule,
 * shaped into `lib/dispatch/performance.ts`'s pure-aggregation input type. */
function toAnalyticsLoad(
  row: LoadInput,
  expensesTotal: number,
  fuel: FuelSettings,
  brokerFactoring: boolean,
  tripName: string | null,
): AnalyticsLoad {
  const financials = computeLoadNet(
    {
      status: row.status,
      rate: row.rate,
      tonuAmount: row.tonuAmount,
      odoAssigned: row.odoAssigned,
      odoLoaded: row.odoLoaded,
      odoDelivered: row.odoDelivered,
      loadedMilesEstimate: row.loadedMilesEstimate,
    },
    expensesTotal,
    fuel,
    brokerFactoring,
  );
  const attrDate = attributionDate({
    pickup_date: row.pickupDate,
    delivery_date: row.deliveryDate,
    created_at: row.createdAt,
  });
  const p = periodOf(attrDate);
  return {
    id: row.id,
    loadNumber: row.loadNumber,
    status: row.status,
    rate: financials.gross,
    net: financials.net,
    loadedMiles: financials.loadedMiles,
    deadheadMiles: financials.deadheadMiles,
    year: p?.year ?? 0,
    month: p?.month ?? 0,
    date: attrDate,
    broker: row.brokerName ?? "—",
    origin: row.origin ?? "—",
    destination: row.destination ?? "—",
    deliveryDate: row.deliveryDate,
    paidAt: row.paidAt,
    tripId: row.tripId,
    tripName,
  };
}

const LOAD_COLUMNS =
  "id, load_number, broker_id, broker_name, origin, destination, pickup_date, delivery_date, rate, tonu_amount, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, paid_at, created_at, trip_id";

type LoadRow = {
  id: string;
  load_number: string | null;
  broker_id: string | null;
  broker_name: string | null;
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
  paid_at: string | null;
  created_at: string | null;
  trip_id: string | null;
};

async function fetchFuelSettings(sb: SupabaseClient): Promise<FuelSettings> {
  const { data } = await sb
    .from("dispatch_settings")
    .select("mpg, diesel_price_per_gallon, factoring_pct")
    .eq("id", true)
    .maybeSingle<{ mpg: number | string | null; diesel_price_per_gallon: number | string | null; factoring_pct: number | string | null }>();
  return {
    mpg: num(data?.mpg) || FUEL_DEFAULTS.mpg,
    ppg: num(data?.diesel_price_per_gallon) || FUEL_DEFAULTS.ppg,
    factoringPct: data?.factoring_pct != null ? num(data.factoring_pct) : FUEL_DEFAULTS.factoringPct,
  };
}

/** Bounded: only the expenses for the given load ids, never the whole
 * `load_expenses` table. */
async function fetchExpensesByLoadId(sb: SupabaseClient, loadIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (loadIds.length === 0) return map;
  const { data } = await sb
    .from("load_expenses")
    .select("load_id, amount")
    .is("deleted_at", null)
    .in("load_id", loadIds)
    .returns<{ load_id: string; amount: number | string }[]>();
  for (const row of data ?? []) {
    map.set(row.load_id, (map.get(row.load_id) ?? 0) + num(row.amount));
  }
  return map;
}

/** Bounded: only the factoring flags for the given broker ids. */
async function fetchFactoringBrokerIds(sb: SupabaseClient, brokerIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (brokerIds.length === 0) return set;
  const { data } = await sb
    .from("brokers")
    .select("id, factoring")
    .in("id", brokerIds)
    .returns<{ id: string; factoring: boolean | null }[]>();
  for (const row of data ?? []) {
    if (row.factoring) set.add(row.id);
  }
  return set;
}

/** Bounded: only the trip names for the given trip ids — the analytical
 * Load Board's "Trip" column (Phase 8). */
async function fetchTripNames(sb: SupabaseClient, tripIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tripIds.length === 0) return map;
  const { data } = await sb.from("trips").select("id, name").in("id", tripIds).returns<{ id: string; name: string | null }[]>();
  for (const row of data ?? []) {
    if (row.name) map.set(row.id, row.name);
  }
  return map;
}

/**
 * Every load attributed (by pickup date, the one rule) to `[range.start,
 * range.end)` — bounded by the range itself, never an unbounded scan.
 * Calendar clips this to the viewed month; Performance clips it to the
 * selected month or custom day range — both call this same function, so
 * they cannot disagree about what a given day's loads or net are worth.
 */
export async function getAnalyticsLoads(range: DateRange): Promise<AnalyticsLoad[]> {
  if (await isDemoMode()) return getDemoAnalyticsLoads(range);

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("loads")
    .select(LOAD_COLUMNS)
    .is("deleted_at", null)
    .or(loadsPeriodFilter(range))
    .order("pickup_date", { ascending: true })
    .limit(2000)
    .returns<LoadRow[]>();
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const loadIds = rows.map((r) => r.id);
  const brokerIds = [...new Set(rows.map((r) => r.broker_id).filter((id): id is string => !!id))];
  const tripIds = [...new Set(rows.map((r) => r.trip_id).filter((id): id is string => !!id))];

  const [fuel, expensesByLoad, factoringIds, tripNames] = await Promise.all([
    fetchFuelSettings(sb),
    fetchExpensesByLoadId(sb, loadIds),
    fetchFactoringBrokerIds(sb, brokerIds),
    fetchTripNames(sb, tripIds),
  ]);

  return rows.map((r) =>
    toAnalyticsLoad(
      {
        id: r.id,
        loadNumber: r.load_number,
        brokerId: r.broker_id,
        brokerName: r.broker_name,
        origin: r.origin,
        destination: r.destination,
        pickupDate: r.pickup_date,
        deliveryDate: r.delivery_date,
        rate: r.rate,
        tonuAmount: r.tonu_amount,
        loadedMilesEstimate: r.loaded_miles,
        odoAssigned: r.odo_assigned,
        odoLoaded: r.odo_loaded,
        odoDelivered: r.odo_delivered,
        status: r.status,
        paidAt: r.paid_at,
        createdAt: r.created_at,
        tripId: r.trip_id,
      },
      expensesByLoad.get(r.id) ?? 0,
      fuel,
      r.broker_id != null && factoringIds.has(r.broker_id),
      r.trip_id ? (tripNames.get(r.trip_id) ?? null) : null,
    ),
  );
}

function getDemoAnalyticsLoads(range: DateRange): AnalyticsLoad[] {
  const { loads, brokers, trips, expenses } = buildDemoData();
  const brokersById = new Map(brokers.map((b) => [b.id, b]));
  const tripsById = new Map(trips.map((t) => [t.id, t]));
  const expensesByLoad = new Map<string, number>();
  for (const e of expenses) expensesByLoad.set(e.loadId, (expensesByLoad.get(e.loadId) ?? 0) + e.amount);

  return loads
    .filter((l) => l.pickupDate >= range.start && l.pickupDate < range.end)
    .map((l) => {
      const broker = brokersById.get(l.brokerId);
      return toAnalyticsLoad(
        {
          id: l.id,
          loadNumber: l.loadNumber,
          brokerId: l.brokerId,
          brokerName: broker?.name ?? null,
          origin: l.origin,
          destination: l.destination,
          pickupDate: l.pickupDate,
          deliveryDate: l.deliveryDate,
          rate: l.rate,
          tonuAmount: l.tonuAmount,
          loadedMilesEstimate: l.loadedMilesEstimate,
          odoAssigned: l.odoAssigned,
          odoLoaded: l.odoLoaded,
          odoDelivered: l.odoDelivered,
          status: l.status,
          paidAt: l.paidAt,
          createdAt: l.createdAt,
          tripId: l.tripId,
        },
        expensesByLoad.get(l.id) ?? 0,
        FUEL_DEFAULTS,
        broker?.factoring ?? false,
        l.tripId ? (tripsById.get(l.tripId)?.name ?? null) : null,
      );
    });
}

// ------------------------------------------------------------- Trip Analysis

export type AnalyticsTrip = {
  id: string;
  name: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  closedAt: string | null;
  financials: TripFinancials;
};

type TripAnalyticsRow = {
  id: string;
  name: string | null;
  status: string;
  start_odometer: number | null;
  end_odometer: number | null;
  started_at: string | null;
  ended_at: string | null;
  closed_at: string | null;
};

/**
 * Trip Analysis (Phase 2 item 5) — every trip touched by the selected range:
 * any trip with at least one load whose attribution date fell in the range,
 * i.e. the distinct `tripId`s already present on the range-scoped
 * `AnalyticsLoad[]` the page fetched for its own KPIs/trend/leaderboards —
 * no second, wider load query to find "which trips". Each trip's financials
 * are computed over its FULL load set (not just the in-range slice, since a
 * trip can straddle a range boundary) via `computeTripNet` — the SAME
 * function the Trips list and Trip Detail page use — so a trip reads
 * identically here as it does anywhere else, including its trip-scoped PC
 * miles/diesel. PC only ever surfaces here (Brent's Option C): never folded
 * into Performance's top-level mileage KPIs.
 */
export async function getAnalyticsTrips(loads: AnalyticsLoad[]): Promise<AnalyticsTrip[]> {
  const tripIds = [...new Set(loads.map((l) => l.tripId).filter((id): id is string => !!id))];
  if (tripIds.length === 0) return [];

  if (await isDemoMode()) return getDemoAnalyticsTrips(tripIds);

  const sb = createServiceRoleClient();
  const { data: tripRows } = await sb
    .from("trips")
    .select("id, name, status, start_odometer, end_odometer, started_at, ended_at, closed_at")
    .in("id", tripIds)
    .is("deleted_at", null)
    .returns<TripAnalyticsRow[]>();
  const trips = tripRows ?? [];
  if (trips.length === 0) return [];

  const { data: tripLoadRows } = await sb
    .from("loads")
    .select("id, trip_id, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, broker_id, status")
    .is("deleted_at", null)
    .in("trip_id", tripIds)
    .returns<(TripRollupLoad & { trip_id: string })[]>();
  const tripLoads = tripLoadRows ?? [];

  const [fuel, expensesByLoad, factoringIds] = await Promise.all([
    fetchFuelSettings(sb),
    fetchExpensesByLoadId(sb, tripLoads.map((l) => l.id)),
    fetchFactoringBrokerIds(sb, tripLoads.map((l) => l.broker_id).filter((id): id is string => !!id)),
  ]);

  return trips
    .map((trip) => {
      const rows = tripLoads.filter((l) => l.trip_id === trip.id);
      const financials = computeTripNet(rows, fuel, factoringIds, expensesByLoad, {
        start: trip.start_odometer,
        end: trip.end_odometer,
      });
      return {
        id: trip.id,
        name: trip.name,
        status: trip.status,
        startedAt: trip.started_at,
        endedAt: trip.ended_at,
        closedAt: trip.closed_at,
        financials,
      };
    })
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

function getDemoAnalyticsTrips(tripIds: string[]): AnalyticsTrip[] {
  const { trips, loads, brokers, expenses } = buildDemoData();
  const expensesByLoad = new Map<string, number>();
  for (const e of expenses) expensesByLoad.set(e.loadId, (expensesByLoad.get(e.loadId) ?? 0) + e.amount);
  const factoringIds = new Set(brokers.filter((b) => b.factoring).map((b) => b.id));

  return trips
    .filter((t) => tripIds.includes(t.id))
    .map((trip) => {
      const rows: TripRollupLoad[] = loads
        .filter((l) => l.tripId === trip.id)
        .map((l) => ({
          id: l.id,
          rate: l.rate,
          loaded_miles: l.loadedMilesEstimate,
          odo_assigned: l.odoAssigned,
          odo_loaded: l.odoLoaded,
          odo_delivered: l.odoDelivered,
          broker_id: l.brokerId,
          status: l.status,
        }));
      const financials = computeTripNet(rows, FUEL_DEFAULTS, factoringIds, expensesByLoad, {
        start: trip.startOdometer,
        end: trip.endOdometer,
      });
      return {
        id: trip.id,
        name: trip.name,
        status: trip.status,
        startedAt: trip.startedAt,
        endedAt: trip.endedAt,
        closedAt: trip.closedAt,
        financials,
      };
    });
}
