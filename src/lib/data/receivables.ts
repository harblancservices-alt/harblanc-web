/**
 * Carrier-load A/R (v2-design.md §20 "Carrier freight") — every closed-out
 * (delivered or TONU'd) load still marked unpaid, tiered into aging buckets.
 * This is the ONE carrier-A/R concept (v2-architecture.md §3a): every row's
 * `amount` comes straight from `computeCarrierAR` in `lib/domain/money.ts`
 * (rate, or tonu_amount when TONU'd) — this module never re-derives that
 * figure itself, only buckets/paginates the result.
 *
 * Distinct from `lib/data/accounting.ts`'s customer-brokerage A/R — two
 * different receivables (freight owed to the owner vs. brokerage margin
 * owed by the shipper), never merged into one number (v2-design.md's
 * non-negotiable #3).
 *
 * This phase's file-scope (receivables-only, per the concurrency note in
 * the phase brief) queries Supabase directly with an `isDemoMode()` branch,
 * the same pattern `lib/data/loads.ts`'s `getLoadDetail()` already uses for
 * fields the shared `DataSource` interface doesn't expose yet — folding
 * this into that interface properly is a follow-up once it isn't locked by
 * concurrent work.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { buildDemoData } from "@/lib/demo/demo-dataset";
import { computeCarrierAR, RECEIVABLE_OVERDUE_DAYS, type CarrierARInput } from "@/lib/domain/money";
import { DEFAULT_PAGE_SIZE, toPaginated, type Paginated } from "./pagination";

export { RECEIVABLE_OVERDUE_DAYS };

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+" | "unaged";

export const AGING_BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "90+", "unaged"];

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  "0-30": "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
  unaged: "No delivery date",
};

export type CarrierReceivableRow = {
  loadId: string;
  loadNumber: string | null;
  brokerId: string | null;
  brokerName: string | null;
  origin: string | null;
  destination: string | null;
  deliveryDate: string | null;
  amount: number;
  daysOutstanding: number;
  overdue: boolean;
  bucket: AgingBucket;
};

export type CarrierARSummary = {
  totalOutstanding: number;
  bucketTotals: Record<AgingBucket, number>;
  bucketCounts: Record<AgingBucket, number>;
};

export type ListCarrierReceivablesOptions = {
  page?: number;
  pageSize?: number;
};

/** Every outstanding load's aging bucket — "unaged" for a missing delivery
 * date takes priority over any days-outstanding value, since `daysSince()`
 * (lib/domain/money.ts) treats a null date as 0 days, which would otherwise
 * silently misfile an undated load into the freshest bucket. */
function bucketFor(deliveryDate: string | null, daysOutstanding: number): AgingBucket {
  if (!deliveryDate) return "unaged";
  if (daysOutstanding <= 30) return "0-30";
  if (daysOutstanding <= 60) return "31-60";
  if (daysOutstanding <= 90) return "61-90";
  return "90+";
}

function emptyBucketMap(): Record<AgingBucket, number> {
  return { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, unaged: 0 };
}

// A one-truck operation's realistic outstanding-load ceiling — generous
// enough that in practice every outstanding load is included (never a
// silent undercount like the audit's flagged 100-row Accounting bug), while
// still keeping the aggregate query bounded rather than a true unbounded
// full-table read.
const AR_AGGREGATE_CAP = 1000;

type RawReceivable = CarrierARInput & {
  loadNumber: string | null;
  brokerId: string | null;
  brokerName: string | null;
  origin: string | null;
  destination: string | null;
};

function toRows(raw: RawReceivable[], now: Date): CarrierReceivableRow[] {
  const ar = computeCarrierAR(raw, now);
  const itemByLoadId = new Map(ar.items.map((i) => [i.loadId, i]));
  return raw
    .map((r) => {
      const item = itemByLoadId.get(r.id);
      if (!item) return null;
      const bucket = bucketFor(r.deliveryDate, item.daysOutstanding);
      const row: CarrierReceivableRow = {
        loadId: r.id,
        loadNumber: r.loadNumber,
        brokerId: r.brokerId,
        brokerName: r.brokerName,
        origin: r.origin,
        destination: r.destination,
        deliveryDate: r.deliveryDate,
        amount: item.amount,
        daysOutstanding: item.daysOutstanding,
        overdue: item.overdue,
        bucket,
      };
      return row;
    })
    .filter((r): r is CarrierReceivableRow => r !== null)
    // Oldest/longest-outstanding first — the design doc's "collect the
    // oldest/largest outstanding balance" primary action, unaged last since
    // there's no age to sort it by.
    .sort((a, b) => {
      if (a.bucket === "unaged" && b.bucket !== "unaged") return 1;
      if (b.bucket === "unaged" && a.bucket !== "unaged") return -1;
      return b.daysOutstanding - a.daysOutstanding;
    });
}

async function fetchAllOutstanding(now: Date): Promise<CarrierReceivableRow[]> {
  if (await isDemoMode()) {
    const { loads, brokers } = buildDemoData();
    const brokerNameById = new Map(brokers.map((b) => [b.id, b.name]));
    const raw: RawReceivable[] = loads
      .filter((l) => (l.status === "delivered" || l.status === "tonu") && l.paymentStatus === "unpaid")
      .map((l) => ({
        id: l.id,
        status: l.status,
        paymentStatus: l.paymentStatus,
        deliveryDate: l.deliveryDate,
        rate: l.rate,
        tonuAmount: l.tonuAmount,
        loadNumber: l.loadNumber,
        brokerId: l.brokerId,
        brokerName: brokerNameById.get(l.brokerId) ?? null,
        origin: l.origin,
        destination: l.destination,
      }));
    return toRows(raw, now);
  }

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("loads")
    .select("id, load_number, broker_id, broker_name, origin, destination, delivery_date, rate, tonu_amount, status, payment_status")
    .in("status", ["delivered", "tonu"])
    .neq("payment_status", "paid")
    .is("deleted_at", null)
    .limit(AR_AGGREGATE_CAP)
    .returns<
      {
        id: string;
        load_number: string | null;
        broker_id: string | null;
        broker_name: string | null;
        origin: string | null;
        destination: string | null;
        delivery_date: string | null;
        rate: number | string | null;
        tonu_amount: number | string | null;
        status: string;
        payment_status: string;
      }[]
    >();

  const raw: RawReceivable[] = (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    paymentStatus: r.payment_status,
    deliveryDate: r.delivery_date,
    rate: r.rate,
    tonuAmount: r.tonu_amount,
    loadNumber: r.load_number,
    brokerId: r.broker_id,
    brokerName: r.broker_name,
    origin: r.origin,
    destination: r.destination,
  }));
  return toRows(raw, now);
}

/** The Receivables page's aging summary — total outstanding + a sum and
 * count per bucket, across every outstanding load (bounded by
 * `AR_AGGREGATE_CAP`, not by display page size). */
export async function getCarrierARSummary(now: Date = new Date()): Promise<CarrierARSummary> {
  const rows = await fetchAllOutstanding(now);
  const bucketTotals = emptyBucketMap();
  const bucketCounts = emptyBucketMap();
  let totalOutstanding = 0;
  for (const r of rows) {
    bucketTotals[r.bucket] += r.amount;
    bucketCounts[r.bucket] += 1;
    totalOutstanding += r.amount;
  }
  return { totalOutstanding, bucketTotals, bucketCounts };
}

/** The Receivables page's row list — same bounded/sorted set the summary is
 * computed from, sliced into a real page. */
export async function listCarrierReceivables(
  opts: ListCarrierReceivablesOptions = {},
): Promise<Paginated<CarrierReceivableRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const now = new Date();
  const rows = await fetchAllOutstanding(now);
  const start = (page - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return toPaginated(slice, rows.length, page, pageSize);
}
