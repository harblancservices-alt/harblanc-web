import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoBrokerDetail } from "@/lib/demo/demoData";
import {
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import { BrokerDetail, type BrokerDetailData } from "./BrokerDetail";

export const metadata: Metadata = {
  title: "Broker",
  robots: { index: false, follow: false },
};

type Broker = {
  id: string;
  name: string;
  status: string;
  mc_number: string | null;
  dot_number: string | null;
  broker_type: string | null;
  phone: string | null;
  email: string | null;
  office: string | null;
  timezone: string | null;
  authority: string | null;
  insurance: string | null;
  w9: string | null;
  ten99: string | null;
  notes: string | null;
  factoring: boolean | null;
};

type LoadRow = {
  id: string;
  origin: string | null;
  destination: string | null;
  equipment: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  tonu_amount: number | string | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  loaded_miles: number | null;
  status: string;
  payment_status: string;
};

type Phone = { number: string; ext: string | null; label: string | null };
type Email = { address: string; label: string | null };
type Contact = {
  id: string;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  phones: Phone[] | null;
  emails: Email[] | null;
  is_backhaul: boolean | null;
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
    year: "numeric",
    timeZone: "UTC",
  });
}
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso + "T00:00:00").getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export default async function BrokerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // DEMO MODE: return the static fake broker profile and never touch Supabase.
  // A non-demo id yields null here, so a real broker can never surface in demo.
  if (await isDemoMode()) {
    const demo = demoBrokerDetail(id);
    if (!demo) notFound();
    return <BrokerDetail data={demo} />;
  }

  const sb = createServiceRoleClient();
  const [
    { data: broker },
    { data: loadRows },
    { data: contactRows },
    { data: fuelRow },
    { data: expRows },
  ] = await Promise.all([
    sb.from("brokers").select("*").eq("id", id).maybeSingle<Broker>(),
    sb
      .from("loads")
      .select(
        "id, origin, destination, equipment, delivery_date, rate, tonu_amount, odo_assigned, odo_loaded, odo_delivered, loaded_miles, status, payment_status",
      )
      .eq("broker_id", id)
      .is("deleted_at", null)
      .order("delivery_date", { ascending: false, nullsFirst: false })
      .returns<LoadRow[]>(),
    sb
      .from("broker_contacts")
      .select("id, name, title, phone, email, phones, emails, is_backhaul")
      .eq("broker_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .returns<Contact[]>(),
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
  ]);

  if (!broker) notFound();

  const loads = loadRows ?? [];
  const contacts = contactRows ?? [];
  const live = loads.filter((l) => l.status !== "cancelled");
  const delivered = loads.filter((l) => l.status === "delivered");
  const activeCount = loads.filter(
    (l) => l.status === "pending" || l.status === "assigned" || l.status === "loaded",
  ).length;
  const cancelled = loads.filter((l) => l.status === "cancelled").length;

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
  const factors = broker.factoring ?? false;

  // Per-load net via the canonical fuel math — the same calc the Load Board,
  // trip cards, and the calendar's weekly net run, so a load's net reads
  // identically wherever it appears. A cancelled load earns only its TONU,
  // with no miles burned against it.
  const netOf = (l: LoadRow) => {
    if (l.status === "cancelled") return num(l.tonu_amount);
    const md = loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      fuel,
    );
    return loadNet(
      {
        rate: num(l.rate),
        diesel: md.diesel,
        expensesTotal: expByLoad.get(l.id) ?? 0,
      },
      fuel,
      factors,
    ).net;
  };

  const gross = live.reduce((s, l) => s + num(l.rate), 0);
  const net = live.reduce((s, l) => s + netOf(l), 0);
  const unpaid = delivered.filter((l) => l.payment_status !== "paid");
  const collected = delivered
    .filter((l) => l.payment_status === "paid")
    .reduce((s, l) => s + num(l.rate), 0);
  const ar = unpaid.reduce((s, l) => s + num(l.rate), 0);
  const avgRate = live.length ? gross / live.length : 0;
  const avgMiles = live.length
    ? Math.round(
        live.reduce((s, l) => s + (l.loaded_miles ?? 0), 0) / live.length,
      )
    : 0;

  const aging = { b1: 0, b2: 0, b3: 0, b4: 0, c1: 0, c2: 0, c3: 0, c4: 0 };
  for (const l of unpaid) {
    const d = daysSince(l.delivery_date) ?? 0;
    const amt = num(l.rate);
    if (d <= 7) {
      aging.b1 += amt;
      aging.c1 += 1;
    } else if (d <= 14) {
      aging.b2 += amt;
      aging.c2 += 1;
    } else if (d <= 30) {
      aging.b3 += amt;
      aging.c3 += 1;
    } else {
      aging.b4 += amt;
      aging.c4 += 1;
    }
  }

  // Lane overview — aggregate this broker's booked (non-cancelled) loads by
  // origin → destination. Lanes are broker-level (loads carry broker_id, not
  // contact_id), so a contact card opens the broker's lane history.
  const laneMap = new Map<
    string,
    {
      origin: string;
      destination: string;
      count: number;
      gross: number;
      miles: number;
      lastIso: string | null;
    }
  >();
  for (const l of live) {
    const origin = l.origin?.trim() || "—";
    const destination = l.destination?.trim() || "—";
    const key = `${origin} → ${destination}`;
    const e =
      laneMap.get(key) ??
      { origin, destination, count: 0, gross: 0, miles: 0, lastIso: null };
    e.count += 1;
    e.gross += num(l.rate);
    e.miles += l.loaded_miles ?? 0;
    if (l.delivery_date && (!e.lastIso || l.delivery_date > e.lastIso)) {
      e.lastIso = l.delivery_date;
    }
    laneMap.set(key, e);
  }
  const lanes = [...laneMap.values()]
    .map((e) => ({
      lane: `${e.origin} → ${e.destination}`,
      origin: e.origin,
      destination: e.destination,
      count: e.count,
      gross: e.gross,
      avgRate: e.count ? e.gross / e.count : 0,
      miles: e.miles,
      avgRpm: e.miles > 0 ? e.gross / e.miles : 0,
      lastDate: fmtDate(e.lastIso),
    }))
    .sort((a, b) => b.count - a.count || b.gross - a.gross);

  const data: BrokerDetailData = {
    broker: {
      id: broker.id,
      name: broker.name,
      status: broker.status,
      mc: broker.mc_number,
      dot: broker.dot_number,
      type: broker.broker_type,
      phone: broker.phone,
      email: broker.email,
      office: broker.office,
      timezone: broker.timezone,
      authority: broker.authority,
      insurance: broker.insurance,
      w9: broker.w9,
      ten99: broker.ten99,
      notes: broker.notes,
      factoring: broker.factoring ?? false,
    },
    kpis: { loads: live.length, gross, net, ar },
    summary: {
      totalLoads: loads.length,
      delivered: delivered.length,
      active: activeCount,
      cancelled,
      gross,
      avgRate,
      avgMiles,
    },
    receivables: { gross, collected, ar, net },
    aging,
    contacts: contacts.map((c) => {
      let phones = Array.isArray(c.phones) ? c.phones : [];
      let emails = Array.isArray(c.emails) ? c.emails : [];
      // Fold legacy single fields in if the arrays are empty.
      if (phones.length === 0 && c.phone) {
        phones = [{ number: c.phone, ext: null, label: null }];
      }
      if (emails.length === 0 && c.email) {
        emails = [{ address: c.email, label: null }];
      }
      return {
        id: c.id,
        name: c.name,
        title: c.title,
        phones,
        emails,
        is_backhaul: !!c.is_backhaul,
      };
    }),
    loads: loads.map((l) => ({
      id: l.id,
      lane: `${l.origin ?? "—"} → ${l.destination ?? "—"}`,
      equipment: l.equipment ?? "—",
      date: fmtDate(l.delivery_date),
      rate: num(l.rate),
      net: netOf(l),
      status: l.status,
      paymentStatus: l.payment_status,
      ageDays: daysSince(l.delivery_date),
      unpaid: l.status === "delivered" && l.payment_status !== "paid",
    })),
    lanes,
  };

  return <BrokerDetail data={data} />;
}
