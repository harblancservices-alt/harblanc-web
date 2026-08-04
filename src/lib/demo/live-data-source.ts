/**
 * The real `DataSource` (v2-architecture.md §10) — wraps
 * `createServiceRoleClient()` (reused from /admin's existing
 * `src/lib/supabase/server.ts`, not a second client factory) and issues
 * bounded, scoped Supabase queries. This is the ONLY file in /tms-v2
 * permitted to import `createServiceRoleClient` — every other file reaches
 * the DB only by going through `lib/data/*` -> `resolve.ts` -> here.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  computeLoadNet,
  computeTripNet,
  computeCarrierAR,
  FUEL_DEFAULTS,
  type FuelSettings,
  type LoadFinancials,
  type TripRollupLoad,
} from "@/lib/domain/money";
import { attributionDate, currentPeriod, periodRange, periodLabel } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE, pageRange, toPaginated, type Paginated } from "@/lib/data/pagination";
import type { LoadWithFinancials, ListLoadsOptions, LoadStatus } from "@/lib/data/loads";
import type { TripWithFinancials, ListTripsOptions } from "@/lib/data/trips";
import type { ExpenseRow, ListExpensesOptions } from "@/lib/data/expenses";
import type { BrokerRow, ListBrokersOptions } from "@/lib/data/brokers";
import type { TodaySummary, AttentionReceivable } from "@/lib/data/dashboard";
import type { DataSource } from "./data-source";

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Raw row shapes (only the columns this data source reads).
// ---------------------------------------------------------------------------

const LOAD_COLUMNS =
  "id, load_number, broker_id, broker_name, trip_id, trip_name, origin, destination, pickup_date, delivery_date, rate, tonu_amount, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, payment_status, paid_at, created_at";

type LoadRow = {
  id: string;
  load_number: string | null;
  broker_id: string | null;
  broker_name: string | null;
  trip_id: string | null;
  trip_name: string | null;
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
  created_at: string | null;
};

type ExpenseDbRow = { id: string; load_id: string; category: string | null; amount: number | string; note: string | null; created_at: string | null };
type TripRow = {
  id: string;
  name: string | null;
  status: string;
  notes: string | null;
  start_odometer: number | null;
  end_odometer: number | null;
  started_at: string | null;
  ended_at: string | null;
  closed_at: string | null;
  created_at: string | null;
};
type BrokerDbRow = {
  id: string;
  name: string;
  status: string;
  mc_number: string | null;
  dot_number: string | null;
  phone: string | null;
  email: string | null;
  factoring: boolean | null;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function fetchFuelSettings(): Promise<FuelSettings> {
  const sb = createServiceRoleClient();
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

/** Bounded: only fetches expenses for the given load ids (never the whole
 * `load_expenses` table), returning the summed amount per load. */
async function fetchExpensesByLoadId(loadIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (loadIds.length === 0) return map;
  const sb = createServiceRoleClient();
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

/** Bounded: only fetches factoring flags for the given broker ids. */
async function fetchFactoringBrokerIds(brokerIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  const ids = [...new Set(brokerIds)].filter((id): id is string => !!id);
  if (ids.length === 0) return set;
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("brokers")
    .select("id, factoring")
    .in("id", ids)
    .returns<{ id: string; factoring: boolean | null }[]>();
  for (const row of data ?? []) {
    if (row.factoring) set.add(row.id);
  }
  return set;
}

function mapLoadRow(
  row: LoadRow,
  expensesByLoad: Map<string, number>,
  factoringBrokerIds: Set<string>,
  fuel: FuelSettings,
): LoadWithFinancials {
  const financials: LoadFinancials = computeLoadNet(
    {
      status: row.status,
      rate: row.rate,
      tonuAmount: row.tonu_amount,
      odoAssigned: row.odo_assigned,
      odoLoaded: row.odo_loaded,
      odoDelivered: row.odo_delivered,
      loadedMilesEstimate: row.loaded_miles,
    },
    expensesByLoad.get(row.id) ?? 0,
    fuel,
    row.broker_id != null && factoringBrokerIds.has(row.broker_id),
  );
  return {
    id: row.id,
    loadNumber: row.load_number,
    brokerId: row.broker_id,
    brokerName: row.broker_name,
    brokerFactoring: row.broker_id != null && factoringBrokerIds.has(row.broker_id),
    tripId: row.trip_id,
    tripName: row.trip_name,
    origin: row.origin,
    destination: row.destination,
    pickupDate: row.pickup_date,
    deliveryDate: row.delivery_date,
    status: row.status as LoadStatus,
    paymentStatus: row.payment_status as "unpaid" | "paid",
    paidAt: row.paid_at,
    createdAt: row.created_at,
    attributionDate: attributionDate({ pickup_date: row.pickup_date, delivery_date: row.delivery_date, created_at: row.created_at }),
    financials,
  };
}

async function loadsToFinancials(rows: LoadRow[]): Promise<LoadWithFinancials[]> {
  const [fuel, expensesByLoad, factoringIds] = await Promise.all([
    fetchFuelSettings(),
    fetchExpensesByLoadId(rows.map((r) => r.id)),
    fetchFactoringBrokerIds(rows.map((r) => r.broker_id).filter((id): id is string => !!id)),
  ]);
  return rows.map((r) => mapLoadRow(r, expensesByLoad, factoringIds, fuel));
}

// ---------------------------------------------------------------------------
// DataSource implementation
// ---------------------------------------------------------------------------

export const liveDataSource: DataSource = {
  async listLoads(opts: ListLoadsOptions): Promise<Paginated<LoadWithFinancials>> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const { from, to } = pageRange(page, pageSize);
    const sb = createServiceRoleClient();

    let query = sb.from("loads").select(LOAD_COLUMNS, { count: "exact" }).is("deleted_at", null);
    if (opts.period) {
      const { start, end } = periodRange(opts.period);
      query = query.gte("pickup_date", start).lt("pickup_date", end);
    }
    if (opts.brokerId) query = query.eq("broker_id", opts.brokerId);
    if (opts.status) query = query.eq("status", opts.status);

    const { data, count } = await query
      .order("pickup_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<LoadRow[]>();

    const rows = await loadsToFinancials(data ?? []);
    return toPaginated(rows, count ?? rows.length, page, pageSize);
  },

  async getLoadById(id: string): Promise<LoadWithFinancials | null> {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("loads")
      .select(LOAD_COLUMNS)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<LoadRow>();
    if (!data) return null;
    const [mapped] = await loadsToFinancials([data]);
    return mapped;
  },

  async listActiveLoads(limit: number): Promise<LoadWithFinancials[]> {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("loads")
      .select(LOAD_COLUMNS)
      .is("deleted_at", null)
      .in("status", ["pending", "assigned", "loaded"] satisfies LoadStatus[])
      .order("pickup_date", { ascending: true, nullsFirst: false })
      .limit(limit)
      .returns<LoadRow[]>();
    return loadsToFinancials(data ?? []);
  },

  async listTrips(opts: ListTripsOptions): Promise<Paginated<TripWithFinancials>> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const { from, to } = pageRange(page, pageSize);
    const sb = createServiceRoleClient();

    let query = sb
      .from("trips")
      .select("id, name, status, notes, start_odometer, end_odometer, started_at, ended_at, closed_at, created_at", { count: "exact" })
      .is("deleted_at", null);
    if (opts.status) query = query.eq("status", opts.status);

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<TripRow[]>();
    const trips = data ?? [];
    const financials = await tripsToFinancials(trips);
    return toPaginated(financials, count ?? financials.length, page, pageSize);
  },

  async getTripById(id: string): Promise<TripWithFinancials | null> {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("trips")
      .select("id, name, status, notes, start_odometer, end_odometer, started_at, ended_at, closed_at, created_at")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<TripRow>();
    if (!data) return null;
    const [mapped] = await tripsToFinancials([data]);
    return mapped;
  },

  async listExpenses(opts: ListExpensesOptions): Promise<Paginated<ExpenseRow>> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const { from, to } = pageRange(page, pageSize);
    const sb = createServiceRoleClient();

    let query = sb
      .from("load_expenses")
      .select("id, load_id, category, amount, note, created_at", { count: "exact" })
      .is("deleted_at", null);
    if (opts.loadId) query = query.eq("load_id", opts.loadId);
    if (opts.period) {
      const { start, end } = periodRange(opts.period);
      query = query.gte("created_at", start).lt("created_at", end);
    }

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<ExpenseDbRow[]>();
    const rows: ExpenseRow[] = (data ?? []).map((r) => ({
      id: r.id,
      loadId: r.load_id,
      category: r.category,
      amount: num(r.amount),
      note: r.note,
      createdAt: r.created_at,
    }));
    return toPaginated(rows, count ?? rows.length, page, pageSize);
  },

  async listBrokers(opts: ListBrokersOptions): Promise<Paginated<BrokerRow>> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
    const { from, to } = pageRange(page, pageSize);
    const sb = createServiceRoleClient();

    let query = sb
      .from("brokers")
      .select("id, name, status, mc_number, dot_number, phone, email, factoring", { count: "exact" })
      .is("deleted_at", null);
    if (opts.search) query = query.ilike("name", `%${opts.search}%`);

    const { data, count } = await query
      .order("name", { ascending: true })
      .range(from, to)
      .returns<BrokerDbRow[]>();
    const rows: BrokerRow[] = (data ?? []).map(mapBrokerRow);
    return toPaginated(rows, count ?? rows.length, page, pageSize);
  },

  async getBrokerById(id: string): Promise<BrokerRow | null> {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("brokers")
      .select("id, name, status, mc_number, dot_number, phone, email, factoring")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<BrokerDbRow>();
    return data ? mapBrokerRow(data) : null;
  },

  getFuelSettings: fetchFuelSettings,

  async getTodaySummary(): Promise<TodaySummary> {
    const now = new Date();
    const period = currentPeriod(now);
    const { start, end } = periodRange(period);
    const sb = createServiceRoleClient();

    const [periodLoadsRes, unpaidClosedRes, activeLoads] = await Promise.all([
      sb
        .from("loads")
        .select(LOAD_COLUMNS)
        .is("deleted_at", null)
        .gte("pickup_date", start)
        .lt("pickup_date", end)
        .limit(1000)
        .returns<LoadRow[]>(),
      sb
        .from("loads")
        .select(LOAD_COLUMNS)
        .is("deleted_at", null)
        .in("status", ["delivered", "tonu"] satisfies LoadStatus[])
        .eq("payment_status", "unpaid")
        .order("delivery_date", { ascending: true, nullsFirst: true })
        .limit(200)
        .returns<LoadRow[]>(),
      liveDataSource.listActiveLoads(20),
    ]);

    const periodLoads = await loadsToFinancials(periodLoadsRes.data ?? []);
    const gross = periodLoads.reduce((s, l) => s + l.financials.gross, 0);
    const net = periodLoads.reduce((s, l) => s + l.financials.net, 0);

    const unpaidRows = unpaidClosedRes.data ?? [];
    const ar = computeCarrierAR(
      unpaidRows.map((r) => ({
        id: r.id,
        status: r.status,
        paymentStatus: r.payment_status,
        deliveryDate: r.delivery_date,
        rate: r.rate,
        tonuAmount: r.tonu_amount,
      })),
      now,
    );
    const rowById = new Map(unpaidRows.map((r) => [r.id, r]));
    const overdueReceivables: AttentionReceivable[] = ar.items
      .filter((item) => item.overdue)
      .map((item) => {
        const row = rowById.get(item.loadId);
        return {
          ...item,
          loadNumber: row?.load_number ?? null,
          brokerName: row?.broker_name ?? null,
          deliveryDate: row?.delivery_date ?? null,
        };
      });

    return {
      period,
      periodLabel: periodLabel(period),
      gross,
      net,
      loadsCount: periodLoads.length,
      arTotal: ar.totalOutstanding,
      activeLoads,
      overdueReceivables,
    };
  },
};

async function tripsToFinancials(trips: TripRow[]): Promise<TripWithFinancials[]> {
  if (trips.length === 0) return [];
  const sb = createServiceRoleClient();
  const tripIds = trips.map((t) => t.id);
  const { data: loadRows } = await sb
    .from("loads")
    .select("id, trip_id, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, broker_id, status")
    .is("deleted_at", null)
    .in("trip_id", tripIds)
    .returns<(TripRollupLoad & { trip_id: string })[]>();
  const loads = loadRows ?? [];

  const [fuel, expensesByLoad, factoringIds] = await Promise.all([
    fetchFuelSettings(),
    fetchExpensesByLoadId(loads.map((l) => l.id)),
    fetchFactoringBrokerIds(loads.map((l) => l.broker_id).filter((id): id is string => !!id)),
  ]);

  return trips.map((trip) => {
    const tripLoads = loads.filter((l) => l.trip_id === trip.id);
    const financials = computeTripNet(tripLoads, fuel, factoringIds, expensesByLoad, {
      start: trip.start_odometer,
      end: trip.end_odometer,
    });
    return {
      id: trip.id,
      name: trip.name,
      status: trip.status as TripWithFinancials["status"],
      notes: trip.notes,
      startOdometer: trip.start_odometer,
      endOdometer: trip.end_odometer,
      startedAt: trip.started_at,
      endedAt: trip.ended_at,
      closedAt: trip.closed_at,
      createdAt: trip.created_at,
      loadIds: tripLoads.map((l) => l.id),
      financials,
    };
  });
}

function mapBrokerRow(row: BrokerDbRow): BrokerRow {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    mcNumber: row.mc_number,
    dotNumber: row.dot_number,
    phone: row.phone,
    email: row.email,
    factoring: !!row.factoring,
  };
}

