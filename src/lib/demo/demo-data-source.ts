/**
 * The demo `DataSource` (v2-architecture.md §10) — reads only
 * `demo-dataset.ts`, never Supabase. Runs the exact same
 * `lib/domain/money.ts` functions the live data source uses, so demo
 * numbers agree across screens internally exactly like real numbers do.
 */

import {
  computeLoadNet,
  computeTripNet,
  computeCarrierAR,
  FUEL_DEFAULTS,
  type FuelSettings,
  type TripRollupLoad,
} from "@/lib/domain/money";
import { attributionDate, currentPeriod, periodLabel, isInPeriod } from "@/lib/domain/attribution";
import { toPaginated, type Paginated } from "@/lib/data/pagination";
import type { LoadWithFinancials, ListLoadsOptions } from "@/lib/data/loads";
import type { TripWithFinancials, ListTripsOptions } from "@/lib/data/trips";
import type { ExpenseRow, ListExpensesOptions } from "@/lib/data/expenses";
import type { BrokerRow, ListBrokersOptions } from "@/lib/data/brokers";
import type { TodaySummary, AttentionReceivable } from "@/lib/data/dashboard";
import type { DataSource } from "./data-source";
import { buildDemoData, type DemoLoad } from "./demo-dataset";

const DEMO_FUEL: FuelSettings = FUEL_DEFAULTS;

function paginate<T>(rows: T[], page = 1, pageSize = 25): Paginated<T> {
  const start = (page - 1) * pageSize;
  return toPaginated(rows.slice(start, start + pageSize), rows.length, page, pageSize);
}

function mapDemoLoad(
  load: DemoLoad,
  brokersById: Map<string, { name: string; factoring: boolean }>,
  expensesByLoad: Map<string, number>,
): LoadWithFinancials {
  const broker = brokersById.get(load.brokerId);
  const financials = computeLoadNet(
    {
      status: load.status,
      rate: load.rate,
      tonuAmount: load.tonuAmount,
      odoAssigned: load.odoAssigned,
      odoLoaded: load.odoLoaded,
      odoDelivered: load.odoDelivered,
      loadedMilesEstimate: load.loadedMilesEstimate,
    },
    expensesByLoad.get(load.id) ?? 0,
    DEMO_FUEL,
    broker?.factoring ?? false,
  );
  return {
    id: load.id,
    loadNumber: load.loadNumber,
    brokerId: load.brokerId,
    brokerName: broker?.name ?? null,
    brokerFactoring: broker?.factoring ?? false,
    tripId: load.tripId,
    tripName: load.tripId ? "TX-TN run (Demo)" : null,
    origin: load.origin,
    destination: load.destination,
    pickupDate: load.pickupDate,
    deliveryDate: load.deliveryDate,
    status: load.status,
    paymentStatus: load.paymentStatus,
    paidAt: load.paidAt,
    createdAt: load.createdAt,
    attributionDate: attributionDate({ pickup_date: load.pickupDate, delivery_date: load.deliveryDate, created_at: load.createdAt }),
    odoAssigned: load.odoAssigned,
    odoLoaded: load.odoLoaded,
    odoDelivered: load.odoDelivered,
    financials,
  };
}

export const demoDataSource: DataSource = {
  async listLoads(opts: ListLoadsOptions): Promise<Paginated<LoadWithFinancials>> {
    const { loads, brokers, expenses } = buildDemoData();
    const brokersById = new Map(brokers.map((b) => [b.id, { name: b.name, factoring: b.factoring }]));
    const expensesByLoad = new Map<string, number>();
    for (const e of expenses) expensesByLoad.set(e.loadId, (expensesByLoad.get(e.loadId) ?? 0) + e.amount);

    let filtered = loads;
    if (opts.dateRange) {
      const { start, end } = opts.dateRange;
      filtered = filtered.filter((l) => l.pickupDate != null && l.pickupDate >= start && l.pickupDate < end);
    } else if (opts.period) {
      filtered = filtered.filter((l) => isInPeriod(l.pickupDate, opts.period!));
    }
    if (opts.brokerId) filtered = filtered.filter((l) => l.brokerId === opts.brokerId);
    if (opts.status) filtered = filtered.filter((l) => l.status === opts.status);
    if (opts.search) {
      const q = opts.search.trim().toLowerCase();
      if (q) {
        filtered = filtered.filter((l) => {
          const brokerName = brokersById.get(l.brokerId ?? "")?.name ?? "";
          return (
            (l.loadNumber ?? "").toLowerCase().includes(q) ||
            brokerName.toLowerCase().includes(q) ||
            (l.origin ?? "").toLowerCase().includes(q) ||
            (l.destination ?? "").toLowerCase().includes(q)
          );
        });
      }
    }

    const dirMul = opts.dir === "asc" ? 1 : -1;
    const sorted = filtered.slice().sort((a, b) => {
      if (opts.sort === "number") return dirMul * (a.loadNumber ?? "").localeCompare(b.loadNumber ?? "");
      if (opts.sort === "broker") {
        const an = brokersById.get(a.brokerId ?? "")?.name ?? "";
        const bn = brokersById.get(b.brokerId ?? "")?.name ?? "";
        return dirMul * an.localeCompare(bn);
      }
      if (opts.sort === "status") return dirMul * a.status.localeCompare(b.status);
      if (opts.sort === "pickup") return dirMul * (a.pickupDate ?? "").localeCompare(b.pickupDate ?? "");
      return (b.pickupDate ?? "").localeCompare(a.pickupDate ?? "");
    });
    const mapped = sorted.map((l) => mapDemoLoad(l, brokersById, expensesByLoad));
    return paginate(mapped, opts.page, opts.pageSize);
  },

  async getLoadById(id: string): Promise<LoadWithFinancials | null> {
    const { loads, brokers, expenses } = buildDemoData();
    const load = loads.find((l) => l.id === id);
    if (!load) return null;
    const brokersById = new Map(brokers.map((b) => [b.id, { name: b.name, factoring: b.factoring }]));
    const expensesByLoad = new Map<string, number>();
    for (const e of expenses) expensesByLoad.set(e.loadId, (expensesByLoad.get(e.loadId) ?? 0) + e.amount);
    return mapDemoLoad(load, brokersById, expensesByLoad);
  },

  async listActiveLoads(limit: number): Promise<LoadWithFinancials[]> {
    const { loads, brokers, expenses } = buildDemoData();
    const brokersById = new Map(brokers.map((b) => [b.id, { name: b.name, factoring: b.factoring }]));
    const expensesByLoad = new Map<string, number>();
    for (const e of expenses) expensesByLoad.set(e.loadId, (expensesByLoad.get(e.loadId) ?? 0) + e.amount);
    return loads
      .filter((l) => l.status === "pending" || l.status === "assigned" || l.status === "loaded")
      .slice(0, limit)
      .map((l) => mapDemoLoad(l, brokersById, expensesByLoad));
  },

  async listTrips(opts: ListTripsOptions): Promise<Paginated<TripWithFinancials>> {
    const { trips, loads, brokers, expenses } = buildDemoData();
    let filtered = trips;
    if (opts.status) filtered = filtered.filter((t) => t.status === opts.status);

    const factoringIds = new Set(brokers.filter((b) => b.factoring).map((b) => b.id));
    const expensesByLoad = new Map<string, number>();
    for (const e of expenses) expensesByLoad.set(e.loadId, (expensesByLoad.get(e.loadId) ?? 0) + e.amount);

    const mapped: TripWithFinancials[] = filtered.map((trip) => {
      const tripLoads = loads.filter((l) => l.tripId === trip.id);
      const rollupLoads: TripRollupLoad[] = tripLoads.map((l) => ({
        id: l.id,
        rate: l.rate,
        loaded_miles: l.loadedMilesEstimate,
        odo_assigned: l.odoAssigned,
        odo_loaded: l.odoLoaded,
        odo_delivered: l.odoDelivered,
        broker_id: l.brokerId,
        status: l.status,
      }));
      const financials = computeTripNet(rollupLoads, DEMO_FUEL, factoringIds, expensesByLoad, {
        start: trip.startOdometer,
        end: trip.endOdometer,
      });
      return {
        id: trip.id,
        name: trip.name,
        status: trip.status,
        notes: trip.notes,
        startOdometer: trip.startOdometer,
        endOdometer: trip.endOdometer,
        startedAt: trip.startedAt,
        endedAt: trip.endedAt,
        closedAt: trip.closedAt,
        createdAt: trip.createdAt,
        loadIds: tripLoads.map((l) => l.id),
        financials,
      };
    });
    return paginate(mapped, opts.page, opts.pageSize);
  },

  async getTripById(id: string): Promise<TripWithFinancials | null> {
    const { rows } = await demoDataSource.listTrips({ page: 1, pageSize: 100 });
    return rows.find((t) => t.id === id) ?? null;
  },

  async listExpenses(opts: ListExpensesOptions): Promise<Paginated<ExpenseRow>> {
    const { expenses } = buildDemoData();
    let filtered = expenses;
    if (opts.loadId) filtered = filtered.filter((e) => e.loadId === opts.loadId);
    if (opts.period) filtered = filtered.filter((e) => isInPeriod(e.createdAt, opts.period!));
    const mapped: ExpenseRow[] = filtered
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({ id: e.id, loadId: e.loadId, category: e.category, amount: e.amount, note: e.note, createdAt: e.createdAt }));
    return paginate(mapped, opts.page, opts.pageSize);
  },

  async listBrokers(opts: ListBrokersOptions): Promise<Paginated<BrokerRow>> {
    const { brokers } = buildDemoData();
    let filtered = brokers;
    if (opts.search) {
      const q = opts.search.toLowerCase();
      filtered = filtered.filter((b) => b.name.toLowerCase().includes(q));
    }
    const mapped: BrokerRow[] = filtered
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ id: b.id, name: b.name, status: b.status, mcNumber: b.mcNumber, dotNumber: b.dotNumber, phone: b.phone, email: b.email, factoring: b.factoring }));
    return paginate(mapped, opts.page, opts.pageSize);
  },

  async getBrokerById(id: string): Promise<BrokerRow | null> {
    const { rows } = await demoDataSource.listBrokers({ page: 1, pageSize: 100 });
    return rows.find((b) => b.id === id) ?? null;
  },

  async getFuelSettings(): Promise<FuelSettings> {
    return DEMO_FUEL;
  },

  async getTodaySummary(): Promise<TodaySummary> {
    const now = new Date();
    const period = currentPeriod(now);
    const { rows: periodLoads } = await demoDataSource.listLoads({ page: 1, pageSize: 100, period });
    const gross = periodLoads.reduce((s, l) => s + l.financials.gross, 0);
    const net = periodLoads.reduce((s, l) => s + l.financials.net, 0);

    const { loads, brokers } = buildDemoData();
    const brokerNameById = new Map(brokers.map((b) => [b.id, b.name]));
    const unpaidClosed = loads.filter((l) => (l.status === "delivered" || l.status === "tonu") && l.paymentStatus === "unpaid");
    const ar = computeCarrierAR(
      unpaidClosed.map((l) => ({ id: l.id, status: l.status, paymentStatus: l.paymentStatus, deliveryDate: l.deliveryDate, rate: l.rate, tonuAmount: l.tonuAmount })),
      now,
    );
    const rowById = new Map(unpaidClosed.map((l) => [l.id, l]));
    const overdueReceivables: AttentionReceivable[] = ar.items
      .filter((item) => item.overdue)
      .map((item) => {
        const row = rowById.get(item.loadId);
        return {
          ...item,
          loadNumber: row?.loadNumber ?? null,
          brokerName: row ? (brokerNameById.get(row.brokerId) ?? null) : null,
          deliveryDate: row?.deliveryDate ?? null,
        };
      });

    const activeLoads = await demoDataSource.listActiveLoads(20);

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
