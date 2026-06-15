import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
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
};

type LoadRow = {
  id: string;
  origin: string | null;
  destination: string | null;
  equipment: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  fuel_cost: number | string | null;
  factoring_fee: number | string | null;
  misc_cost: number | string | null;
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
  const sb = createServiceRoleClient();
  const [{ data: broker }, { data: loadRows }, { data: contactRows }] =
    await Promise.all([
      sb.from("brokers").select("*").eq("id", id).maybeSingle<Broker>(),
      sb
        .from("loads")
        .select(
          "id, origin, destination, equipment, delivery_date, rate, fuel_cost, factoring_fee, misc_cost, loaded_miles, status, payment_status",
        )
        .eq("broker_id", id)
        .is("deleted_at", null)
        .order("delivery_date", { ascending: false, nullsFirst: false })
        .returns<LoadRow[]>(),
      sb
        .from("broker_contacts")
        .select("id, name, title, phone, email, phones, emails")
        .eq("broker_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .returns<Contact[]>(),
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

  const netOf = (l: LoadRow) =>
    num(l.rate) - num(l.fuel_cost) - num(l.factoring_fee) - num(l.misc_cost);

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
      return { id: c.id, name: c.name, title: c.title, phones, emails };
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
  };

  return <BrokerDetail data={data} />;
}
