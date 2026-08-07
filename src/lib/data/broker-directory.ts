/**
 * Broker list — Phase 3d, BROKERS entity data module (v2-architecture.md
 * §3c). Paginated broker directory with per-broker gross/loads/A/R inline,
 * per v2-design.md §9. See `recurring-expenses.ts`'s header for why this
 * talks to Supabase directly rather than through the shared `DataSource`
 * (concurrent Phase 3d work is touching that shared plumbing for other
 * entities right now).
 *
 * Money only through the engine: this module never computes a load's net
 * itself — A/R goes through `computeCarrierAR()` from `lib/domain/money.ts`,
 * the same function Today's dashboard uses, so a broker's outstanding
 * figure here always agrees with Receivables/Today.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { computeCarrierAR } from "@/lib/domain/money";
import { DEFAULT_PAGE_SIZE, pageRange, toPaginated, type Paginated } from "./pagination";
import { buildDemoData, DEMO_BROKERS } from "@/lib/demo/demo-dataset";

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type BrokerDirectoryRow = {
  id: string;
  name: string;
  status: string;
  factoring: boolean;
  loadsCount: number;
  /** All-time gross across non-TONU loads (TONU loads earn only their flat
   * fee, tracked separately — matching /admin's existing broker-detail
   * convention). */
  gross: number;
  arOutstanding: number;
};

export type ListBrokerDirectoryOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
};

type BrokerDbRow = { id: string; name: string; status: string; factoring: boolean | null };
type LoadStatsRow = {
  broker_id: string;
  status: string;
  payment_status: string;
  rate: number | string | null;
  tonu_amount: number | string | null;
  delivery_date: string | null;
};

type BrokerStats = { loadsCount: number; gross: number; arOutstanding: number };

/** Bounded to only the brokers on the current page — never a scan of the
 * whole `loads` table (v2-architecture.md §3c). */
async function fetchStatsForBrokers(brokerIds: string[]): Promise<Map<string, BrokerStats>> {
  const map = new Map<string, BrokerStats>();
  if (brokerIds.length === 0) return map;

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("loads")
    .select("broker_id, status, payment_status, rate, tonu_amount, delivery_date")
    .is("deleted_at", null)
    .in("broker_id", brokerIds)
    .returns<LoadStatsRow[]>();

  const rowsByBroker = new Map<string, LoadStatsRow[]>();
  for (const row of data ?? []) {
    if (!row.broker_id) continue;
    const list = rowsByBroker.get(row.broker_id) ?? [];
    list.push(row);
    rowsByBroker.set(row.broker_id, list);
  }

  for (const brokerId of brokerIds) {
    const rows = rowsByBroker.get(brokerId) ?? [];
    const live = rows.filter((r) => r.status !== "tonu");
    const gross = live.reduce((s, r) => s + num(r.rate), 0);
    const unpaidClosed = rows.filter(
      (r) => (r.status === "delivered" || r.status === "tonu") && r.payment_status !== "paid",
    );
    const ar = computeCarrierAR(
      unpaidClosed.map((r) => ({
        id: brokerId,
        status: r.status,
        paymentStatus: r.payment_status,
        deliveryDate: r.delivery_date,
        rate: r.rate,
        tonuAmount: r.tonu_amount,
      })),
    );
    map.set(brokerId, { loadsCount: rows.length, gross, arOutstanding: ar.totalOutstanding });
  }
  return map;
}

export async function listBrokerDirectory(opts: ListBrokerDirectoryOptions = {}): Promise<Paginated<BrokerDirectoryRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;

  if (await isDemoMode()) {
    const { loads } = buildDemoData();
    let brokers = DEMO_BROKERS;
    if (opts.search) {
      const q = opts.search.toLowerCase();
      brokers = brokers.filter((b) => b.name.toLowerCase().includes(q));
    }
    const rows: BrokerDirectoryRow[] = brokers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => {
        const brokerLoads = loads.filter((l) => l.brokerId === b.id);
        const live = brokerLoads.filter((l) => l.status !== "tonu");
        const gross = live.reduce((s, l) => s + num(l.rate), 0);
        const unpaidClosed = brokerLoads.filter(
          (l) => (l.status === "delivered" || l.status === "tonu") && l.paymentStatus !== "paid",
        );
        const ar = computeCarrierAR(
          unpaidClosed.map((l) => ({ id: l.id, status: l.status, paymentStatus: l.paymentStatus, deliveryDate: l.deliveryDate, rate: l.rate, tonuAmount: l.tonuAmount })),
        );
        return { id: b.id, name: b.name, status: b.status, factoring: b.factoring, loadsCount: brokerLoads.length, gross, arOutstanding: ar.totalOutstanding };
      });
    const { from, to } = pageRange(page, pageSize);
    return toPaginated(rows.slice(from, to + 1), rows.length, page, pageSize);
  }

  const sb = createServiceRoleClient();
  let query = sb.from("brokers").select("id, name, status, factoring", { count: "exact" }).is("deleted_at", null);
  if (opts.search) query = query.ilike("name", `%${opts.search}%`);

  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await query.order("name", { ascending: true }).range(from, to).returns<BrokerDbRow[]>();
  const brokers = data ?? [];
  const stats = await fetchStatsForBrokers(brokers.map((b) => b.id));

  const rows: BrokerDirectoryRow[] = brokers.map((b) => {
    const s = stats.get(b.id) ?? { loadsCount: 0, gross: 0, arOutstanding: 0 };
    return { id: b.id, name: b.name, status: b.status, factoring: !!b.factoring, ...s };
  });

  return toPaginated(rows, count ?? rows.length, page, pageSize);
}

export type ArchivedBrokerRow = { id: string; name: string; deletedAt: string | null };

/** Archived (soft-deleted) brokers — bounded to 50, the "restore" surface
 * for archiveBroker/restoreBroker (audit trap #7: no restore path existed
 * anywhere for any entity). Not shown in demo mode — nothing to restore. */
export async function listArchivedBrokers(): Promise<ArchivedBrokerRow[]> {
  if (await isDemoMode()) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("brokers")
    .select("id, name, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(50)
    .returns<{ id: string; name: string; deleted_at: string | null }[]>();
  return (data ?? []).map((b) => ({ id: b.id, name: b.name, deletedAt: b.deleted_at }));
}
