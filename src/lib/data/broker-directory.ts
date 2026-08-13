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
import { computeCarrierAR } from "@/lib/domain/money";
import { DEFAULT_PAGE_SIZE, pageRange, toPaginated, type Paginated } from "./pagination";

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type BrokerDirectoryRow = {
  id: string;
  name: string;
  status: string;
  mcNumber: string | null;
  dotNumber: string | null;
  factoring: boolean;
  loadsCount: number;
  /** All-time gross across non-TONU loads (TONU loads earn only their flat
   * fee, tracked separately — matching /admin's existing broker-detail
   * convention). */
  gross: number;
  arOutstanding: number;
};

export type BrokerSortKey = "name" | "gross" | "loads" | "ar";

export type ListBrokerDirectoryOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
  /** Mirrors legacy's BrokerListSidebar sort selector (Name A–Z / Gross
   * high / Loads high). Sorting is by stats fetched per-page, so it's
   * applied client-side after the page's stats are joined — fine at this
   * scale (one page of brokers, not a full-table sort). */
  sort?: BrokerSortKey;
};

type BrokerDbRow = { id: string; name: string; status: string; mc_number: string | null; dot_number: string | null; factoring: boolean | null };
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

  function sortRows(rows: BrokerDirectoryRow[]): BrokerDirectoryRow[] {
    const sorted = [...rows];
    if (opts.sort === "gross") sorted.sort((a, b) => b.gross - a.gross);
    else if (opts.sort === "loads") sorted.sort((a, b) => b.loadsCount - a.loadsCount);
    else if (opts.sort === "ar") sorted.sort((a, b) => b.arOutstanding - a.arOutstanding);
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }

  const sb = createServiceRoleClient();
  let query = sb.from("brokers").select("id, name, status, mc_number, dot_number, factoring", { count: "exact" }).is("deleted_at", null);
  if (opts.search) {
    const q = opts.search.replace(/[,()]/g, "").trim();
    if (q) query = query.or(`name.ilike.%${q}%,mc_number.ilike.%${q}%,dot_number.ilike.%${q}%`);
  }

  // Sorting is applied after stats are joined below (gross/loads aren't
  // columns on `brokers`), so this fetches the full matching set rather
  // than a `.range()`'d page — bounded to 500 brokers, well above this
  // one-owner-operator's actual broker count (v2-architecture.md §3c).
  const { data, count } = await query.order("name", { ascending: true }).limit(500).returns<BrokerDbRow[]>();
  const allBrokers = data ?? [];
  const stats = await fetchStatsForBrokers(allBrokers.map((b) => b.id));

  const allRows: BrokerDirectoryRow[] = sortRows(
    allBrokers.map((b) => {
      const s = stats.get(b.id) ?? { loadsCount: 0, gross: 0, arOutstanding: 0 };
      // Defensive: `brokers.status`/`name` have no DB-level NOT NULL — see
      // broker-profile.ts's getBrokerProfile() for the crash this same gap
      // caused there.
      return { id: b.id, name: b.name ?? "Unnamed broker", status: b.status ?? "active", mcNumber: b.mc_number, dotNumber: b.dot_number, factoring: !!b.factoring, ...s };
    }),
  );

  const { from, to } = pageRange(page, pageSize);
  return toPaginated(allRows.slice(from, to + 1), count ?? allRows.length, page, pageSize);
}

export type ArchivedBrokerRow = { id: string; name: string; deletedAt: string | null };

/** Archived (soft-deleted) brokers — bounded to 50, the "restore" surface
 * for archiveBroker/restoreBroker (audit trap #7: no restore path existed
 * anywhere for any entity). */
export async function listArchivedBrokers(): Promise<ArchivedBrokerRow[]> {
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
