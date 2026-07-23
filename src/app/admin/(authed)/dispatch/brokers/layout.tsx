import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoBrokerList } from "@/lib/demo/demoData";
import { Button } from "@/components/ui/Button";
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

async function realBrokerList(): Promise<BrokerListItem[]> {
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

  return (brokerRows ?? []).map((b) => {
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
}

export default async function BrokersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // DEMO MODE: build the broker rail from the static fake dataset — never
  // touch Supabase.
  const brokers: BrokerListItem[] = (await isDemoMode())
    ? demoBrokerList()
    : await realBrokerList();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {/* Shell header — the standard dispatch pattern: the small section
          eyebrow sits ABOVE the title on the left, actions group on the right.
          This bar used to be reversed (title left, "DISPATCH" stranded on the
          right), which read as a different page family than every other
          dispatch screen. The Quick add / + New buttons moved up here from the
          broker rail so they land where the action group lives on every other
          page; on a phone they wrap to their own line under the title. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line bg-card px-4 py-2.5 sm:px-6">
        <div className="min-w-0 basis-full sm:basis-auto">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
            Dispatch
          </div>
          <h1 className="text-[24px] font-bold leading-tight text-ink">
            Brokers
          </h1>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
          <Button
            href="/admin/dispatch/brokers/quick-add"
            prefetch={false}
            variant="navigate"
            size="sm"
          >
            Quick add
          </Button>
          <Button
            href="/admin/dispatch/brokers/new"
            prefetch={false}
            variant="primary"
            size="sm"
            leftIcon={<span className="text-[13px] leading-none">+</span>}
          >
            New
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <BrokerListSidebar brokers={brokers} />
        <main className="min-w-0 flex-1 bg-canvas">{children}</main>
      </div>
    </div>
  );
}
