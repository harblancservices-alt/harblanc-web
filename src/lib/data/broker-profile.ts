/**
 * Broker profile — Phase 3d, BROKERS entity data module (v2-architecture.md
 * §3c/§9). Contact info, lanes, and load history/financials for one broker,
 * per v2-design.md §10. See `recurring-expenses.ts`'s header for why this
 * talks to Supabase directly rather than through the shared `DataSource`.
 *
 * Every load's net is the fuel-adjusted, factoring-aware figure from
 * `computeLoadNet()` (`lib/domain/money.ts`) — never gross, and never
 * re-derived here. This is the same function Today/the money engine's test
 * suite exercise, so a load's net on a broker's History tab matches what it
 * would show anywhere else.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import {
  computeLoadNet,
  computeCarrierAR,
  FUEL_DEFAULTS,
  type FuelSettings,
  type LoadFinancials,
} from "@/lib/domain/money";
import { buildDemoData, DEMO_BROKERS } from "@/lib/demo/demo-dataset";

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type BrokerIdentity = {
  id: string;
  name: string;
  status: string;
  mcNumber: string | null;
  dotNumber: string | null;
  phone: string | null;
  email: string | null;
  factoring: boolean;
  notes: string | null;
};

export type BrokerContact = {
  id: string;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  isBackhaul: boolean;
};

export type BrokerLane = {
  origin: string;
  destination: string;
  count: number;
  gross: number;
  avgRate: number;
  miles: number;
  avgRatePerMile: number;
  lastDeliveryDate: string | null;
};

export type BrokerLoadHistoryRow = {
  id: string;
  loadNumber: string | null;
  origin: string | null;
  destination: string | null;
  equipment: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  status: string;
  paymentStatus: "unpaid" | "paid";
  financials: LoadFinancials;
};

export type BrokerArAging = { d0to7: number; d8to14: number; d15to30: number; d31plus: number };

export type BrokerProfile = {
  identity: BrokerIdentity;
  kpis: { loadsCount: number; gross: number; net: number; arOutstanding: number };
  aging: BrokerArAging;
  contacts: BrokerContact[];
  lanes: BrokerLane[];
  /** Bounded to the broker's most recent 200 loads — a single broker's
   * history at one-owner-operator scale, not a full-table read
   * (v2-architecture.md §3c). */
  loadHistory: BrokerLoadHistoryRow[];
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
  notes: string | null;
};

type ContactDbRow = { id: string; name: string | null; title: string | null; phone: string | null; email: string | null; is_backhaul: boolean | null };

type LoadDbRow = {
  id: string;
  load_number: string | null;
  origin: string | null;
  destination: string | null;
  equipment: string | null;
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
};

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

function buildLanes(loads: { origin: string | null; destination: string | null; rate: number | string | null; loadedMiles: number | null; deliveryDate: string | null; status: string }[]): BrokerLane[] {
  const laneMap = new Map<string, { origin: string; destination: string; count: number; gross: number; miles: number; lastIso: string | null }>();
  for (const l of loads) {
    if (l.status === "tonu") continue; // a TONU'd attempt isn't a real lane run
    const origin = l.origin?.trim() || "—";
    const destination = l.destination?.trim() || "—";
    const key = `${origin} → ${destination}`;
    const entry = laneMap.get(key) ?? { origin, destination, count: 0, gross: 0, miles: 0, lastIso: null };
    entry.count += 1;
    entry.gross += num(l.rate);
    entry.miles += l.loadedMiles ?? 0;
    if (l.deliveryDate && (!entry.lastIso || l.deliveryDate > entry.lastIso)) entry.lastIso = l.deliveryDate;
    laneMap.set(key, entry);
  }
  return [...laneMap.values()]
    .map((e) => ({
      origin: e.origin,
      destination: e.destination,
      count: e.count,
      gross: e.gross,
      avgRate: e.count ? e.gross / e.count : 0,
      miles: e.miles,
      avgRatePerMile: e.miles > 0 ? e.gross / e.miles : 0,
      lastDeliveryDate: e.lastIso,
    }))
    .sort((a, b) => b.count - a.count || b.gross - a.gross);
}

/** Whole calendar days between a YYYY-MM-DD date and `now`, both compared
 * as UTC calendar days — mirrors `lib/domain/money.ts`'s `daysSince()`. */
function daysSince(dateStr: string | null, now: Date): number {
  if (!dateStr) return 0;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const then = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((today - then) / 86_400_000);
  return days >= 0 ? days : 0;
}

function buildAging(unpaidClosed: { deliveryDate: string | null; rate: number | string | null; tonuAmount: number | string | null; status: string }[], now: Date): BrokerArAging {
  const aging: BrokerArAging = { d0to7: 0, d8to14: 0, d15to30: 0, d31plus: 0 };
  for (const l of unpaidClosed) {
    const amount = l.status === "tonu" ? num(l.tonuAmount) : num(l.rate);
    const d = daysSince(l.deliveryDate, now);
    if (d <= 7) aging.d0to7 += amount;
    else if (d <= 14) aging.d8to14 += amount;
    else if (d <= 30) aging.d15to30 += amount;
    else aging.d31plus += amount;
  }
  return aging;
}

function demoProfile(id: string): BrokerProfile | null {
  const demo = DEMO_BROKERS.find((b) => b.id === id);
  if (!demo) return null;
  const { loads } = buildDemoData();
  const brokerLoads = loads.filter((l) => l.brokerId === id);
  const fuel = FUEL_DEFAULTS;

  const loadHistory: BrokerLoadHistoryRow[] = brokerLoads.map((l) => ({
    id: l.id,
    loadNumber: l.loadNumber,
    origin: l.origin,
    destination: l.destination,
    equipment: null,
    pickupDate: l.pickupDate,
    deliveryDate: l.deliveryDate,
    status: l.status,
    paymentStatus: l.paymentStatus,
    financials: computeLoadNet(
      { status: l.status, rate: l.rate, tonuAmount: l.tonuAmount, odoAssigned: l.odoAssigned, odoLoaded: l.odoLoaded, odoDelivered: l.odoDelivered, loadedMilesEstimate: l.loadedMilesEstimate },
      0,
      fuel,
      demo.factoring,
    ),
  }));

  const gross = loadHistory.filter((l) => l.status !== "tonu").reduce((s, l) => s + l.financials.gross, 0);
  const net = loadHistory.reduce((s, l) => s + l.financials.net, 0);
  const unpaidClosed = brokerLoads.filter((l) => (l.status === "delivered" || l.status === "tonu") && l.paymentStatus !== "paid");
  const ar = computeCarrierAR(unpaidClosed.map((l) => ({ id: l.id, status: l.status, paymentStatus: l.paymentStatus, deliveryDate: l.deliveryDate, rate: l.rate, tonuAmount: l.tonuAmount })));

  return {
    identity: { id: demo.id, name: demo.name, status: demo.status, mcNumber: demo.mcNumber, dotNumber: demo.dotNumber, phone: demo.phone, email: demo.email, factoring: demo.factoring, notes: null },
    kpis: { loadsCount: brokerLoads.length, gross, net, arOutstanding: ar.totalOutstanding },
    aging: buildAging(unpaidClosed.map((l) => ({ deliveryDate: l.deliveryDate, rate: l.rate, tonuAmount: l.tonuAmount, status: l.status })), new Date()),
    contacts: [{ id: "demo-contact-1", name: "Dispatch (Demo)", title: "Dispatcher", phone: demo.phone, email: demo.email, isBackhaul: true }],
    lanes: buildLanes(brokerLoads.map((l) => ({ origin: l.origin, destination: l.destination, rate: l.rate, loadedMiles: l.loadedMilesEstimate, deliveryDate: l.deliveryDate, status: l.status }))),
    loadHistory: loadHistory.sort((a, b) => (b.deliveryDate ?? "").localeCompare(a.deliveryDate ?? "")),
  };
}

export async function getBrokerProfile(id: string): Promise<BrokerProfile | null> {
  if (await isDemoMode()) return demoProfile(id);

  const sb = createServiceRoleClient();
  const [{ data: broker }, { data: contactRows }, { data: loadRows }] = await Promise.all([
    sb
      .from("brokers")
      .select("id, name, status, mc_number, dot_number, phone, email, factoring, notes")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<BrokerDbRow>(),
    sb
      .from("broker_contacts")
      .select("id, name, title, phone, email, is_backhaul")
      .eq("broker_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .returns<ContactDbRow[]>(),
    sb
      .from("loads")
      .select("id, load_number, origin, destination, equipment, pickup_date, delivery_date, rate, tonu_amount, loaded_miles, odo_assigned, odo_loaded, odo_delivered, status, payment_status")
      .eq("broker_id", id)
      .is("deleted_at", null)
      .order("delivery_date", { ascending: false, nullsFirst: false })
      .limit(200)
      .returns<LoadDbRow[]>(),
  ]);

  if (!broker) return null;

  const loads = loadRows ?? [];
  const [fuel, expensesByLoad] = await Promise.all([fetchFuelSettings(), fetchExpensesByLoadId(loads.map((l) => l.id))]);
  const factoring = broker.factoring ?? false;

  const loadHistory: BrokerLoadHistoryRow[] = loads.map((l) => ({
    id: l.id,
    loadNumber: l.load_number,
    origin: l.origin,
    destination: l.destination,
    equipment: l.equipment,
    pickupDate: l.pickup_date,
    deliveryDate: l.delivery_date,
    status: l.status,
    paymentStatus: l.payment_status as "unpaid" | "paid",
    financials: computeLoadNet(
      { status: l.status, rate: l.rate, tonuAmount: l.tonu_amount, odoAssigned: l.odo_assigned, odoLoaded: l.odo_loaded, odoDelivered: l.odo_delivered, loadedMilesEstimate: l.loaded_miles },
      expensesByLoad.get(l.id) ?? 0,
      fuel,
      factoring,
    ),
  }));

  const gross = loadHistory.filter((l) => l.status !== "tonu").reduce((s, l) => s + l.financials.gross, 0);
  const net = loadHistory.reduce((s, l) => s + l.financials.net, 0);
  const unpaidClosed = loads.filter((l) => (l.status === "delivered" || l.status === "tonu") && l.payment_status !== "paid");
  const ar = computeCarrierAR(
    unpaidClosed.map((l) => ({ id: l.id, status: l.status, paymentStatus: l.payment_status, deliveryDate: l.delivery_date, rate: l.rate, tonuAmount: l.tonu_amount })),
  );

  return {
    identity: {
      id: broker.id,
      name: broker.name,
      status: broker.status,
      mcNumber: broker.mc_number,
      dotNumber: broker.dot_number,
      phone: broker.phone,
      email: broker.email,
      factoring,
      notes: broker.notes,
    },
    kpis: { loadsCount: loads.length, gross, net, arOutstanding: ar.totalOutstanding },
    aging: buildAging(unpaidClosed.map((l) => ({ deliveryDate: l.delivery_date, rate: l.rate, tonuAmount: l.tonu_amount, status: l.status })), new Date()),
    contacts: (contactRows ?? []).map((c) => ({ id: c.id, name: c.name, title: c.title, phone: c.phone, email: c.email, isBackhaul: !!c.is_backhaul })),
    lanes: buildLanes(loads.map((l) => ({ origin: l.origin, destination: l.destination, rate: l.rate, loadedMiles: l.loaded_miles, deliveryDate: l.delivery_date, status: l.status }))),
    loadHistory,
  };
}
