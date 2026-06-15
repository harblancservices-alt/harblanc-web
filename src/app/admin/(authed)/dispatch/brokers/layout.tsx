import { createServiceRoleClient } from "@/lib/supabase/server";
import { BrokerListSidebar, type BrokerListItem } from "./BrokerListSidebar";

/**
 * Dispatch → Brokers master-detail shell.
 *
 * The left rail (persistent broker list with search / sort) stays mounted
 * across selections; the right pane renders the active route — the index
 * empty state, the New Broker form, or a broker profile.
 */

type BrokerRow = {
  id: string;
  name: string | null;
  status: string;
  mc_number: string | null;
};
type LoadAgg = {
  broker_id: string | null;
  rate: number | string | null;
  status: string;
  payment_status: string;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function BrokersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = createServiceRoleClient();
  const [{ data: brokerRows }, { data: loadRows }] = await Promise.all([
    sb
      .from("brokers")
      .select("id, name, status, mc_number")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<BrokerRow[]>(),
    sb
      .from("loads")
      .select("broker_id, rate, status, payment_status")
      .is("deleted_at", null)
      .returns<LoadAgg[]>(),
  ]);

  const agg = new Map<string, { loads: number; gross: number; ar: number }>();
  for (const l of loadRows ?? []) {
    if (!l.broker_id) continue;
    const a = agg.get(l.broker_id) ?? { loads: 0, gross: 0, ar: 0 };
    a.loads += 1;
    if (l.status !== "cancelled") a.gross += num(l.rate);
    if (l.status === "delivered" && l.payment_status !== "paid")
      a.ar += num(l.rate);
    agg.set(l.broker_id, a);
  }

  const brokers: BrokerListItem[] = (brokerRows ?? []).map((b) => {
    const a = agg.get(b.id) ?? { loads: 0, gross: 0, ar: 0 };
    return {
      id: b.id,
      name: b.name?.trim() || "Unnamed broker",
      status: b.status,
      mc: b.mc_number?.trim() || null,
      loads: a.loads,
      gross: a.gross,
    };
  });

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-line bg-card px-4 py-2.5 sm:px-6">
        <h1 className="text-[15px] font-semibold tracking-tight text-fg">
          Brokers
        </h1>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
          Dispatch
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <BrokerListSidebar brokers={brokers} />
        <main className="min-w-0 flex-1 bg-canvas">{children}</main>
      </div>
    </div>
  );
}
