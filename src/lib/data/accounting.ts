/**
 * Customer-brokerage money (v2-design.md §22) — payments collected against
 * `finalized_quotes`, MTD/period collected total, and outstanding balance.
 * Deliberately a SEPARATE financial domain from `lib/data/receivables.ts`'s
 * carrier-load A/R (v2-design.md's non-negotiable #3, audit §19's "two
 * unreconciled A/R concepts" finding) — this module never sums a `loads`
 * row, and Receivables never sums a `payments`/`finalized_quotes` row.
 *
 * Fixes audit §19's confirmed correctness bug: /admin's MTD "Collected"
 * figure is a client-side reduce over a hard-capped 100-most-recent-overall
 * `payments` fetch, so a month with >100 payments (anywhere in history
 * pushing the current month's rows out of the cap) silently undercounts.
 * Here the MTD sum query is date-scoped directly in SQL (`.gte`/`.lt` on
 * the month boundary) with no row cap at all — bounded by the calendar
 * month, not by a row count.
 *
 * This phase's file-scope (accounting-only, per the concurrency note in the
 * phase brief) queries Supabase directly with an `isDemoMode()` branch, the
 * same pattern `lib/data/loads.ts`'s `getLoadDetail()` already uses for
 * fields the shared `DataSource` interface doesn't expose yet.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { currentPeriod, periodRange, periodLabel, type Period } from "@/lib/domain/attribution";
import { DEFAULT_PAGE_SIZE, toPaginated, type Paginated } from "./pagination";

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Payment statuses that do NOT count as money actually received — ported
// verbatim from /admin's AccountingPanel.tsx (audited-correct, not
// reimplemented).
const NON_RECEIVED = new Set(["cancelled", "failed", "refunded", "pending"]);

function isReceived(status: string | null): boolean {
  const s = (status ?? "completed").toLowerCase();
  return !NON_RECEIVED.has(s);
}

type PaymentRow = {
  id: string;
  finalized_quote_id: string | null;
  quote_request_id: string | null;
  amount: number | string | null;
  received_at: string | null;
  recorded_at: string | null;
  method: string | null;
  status: string | null;
  stripe_payment_intent_id: string | null;
};

type FqRow = {
  id: string;
  quote_request_id: string | null;
  finalized_quote_number: number | null;
  total_amount: number | string | null;
  sent_at: string | null;
  payment_due_at: string | null;
};

type LeadRow = { id: string; name: string | null; pickup_zip: string | null; delivery_zip: string | null; deleted_at: string | null };

export type CustomerPaymentRow = {
  id: string;
  date: string | null;
  customerName: string;
  amount: number;
  method: string;
  status: string;
  isStripe: boolean;
};

export type CustomerOutstandingRow = {
  finalizedQuoteId: string;
  leadId: string | null;
  quoteNumber: number | null;
  customerName: string;
  lane: string;
  total: number;
  paid: number;
  outstanding: number;
  status: "overdue" | "unpaid" | "deposit";
  daysOverdue: number | null;
};

export type AccountingSummary = {
  period: Period;
  periodLabel: string;
  collectedPeriod: number;
  outstandingTotal: number;
  outstandingCount: number;
};

function laneOf(lead: LeadRow | undefined): string {
  const o = lead?.pickup_zip?.trim() || "—";
  const d = lead?.delivery_zip?.trim() || "—";
  return `${o} → ${d}`;
}

async function fetchLeadsFor(ids: (string | null)[]): Promise<Map<string, LeadRow>> {
  const leadIds = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (leadIds.length === 0) return new Map();
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("quote_requests")
    .select("id, name, pickup_zip, delivery_zip, deleted_at")
    .in("id", leadIds)
    .returns<LeadRow[]>();
  return new Map((data ?? []).map((l) => [l.id, l]));
}

/** A payment/finalized-quote only counts if its parent lead still exists
 * and isn't trashed — soft-deleting a lead doesn't cascade, so without this
 * check a deleted test lead keeps haunting the collected sum / A/R
 * (ported check from /admin's AccountingPanel.tsx). */
function isActiveLead(leadById: Map<string, LeadRow>, id: string | null): boolean {
  if (!id) return false;
  const lead = leadById.get(id);
  return !!lead && lead.deleted_at == null;
}

// ---------------------------------------------------------------------------
// Demo mode — a small, self-contained fake dataset (evergreen, relative to
// "now"), scoped to this module only per the phase brief's concurrency
// note. Not derived from lib/demo/demo-dataset.ts (that dataset has no
// customer-brokerage shape) so this stays a single-file, non-shared change.
// ---------------------------------------------------------------------------

function demoAccountingRows(now: Date): { payments: CustomerPaymentRow[]; outstanding: CustomerOutstandingRow[] } {
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  return {
    payments: [
      { id: "demo-pay-1", date: iso(1), customerName: "J. Rivera (Demo)", amount: 1650, method: "card", status: "completed", isStripe: true },
      { id: "demo-pay-2", date: iso(6), customerName: "S. Cho (Demo)", amount: 940, method: "ach", status: "completed", isStripe: true },
      { id: "demo-pay-3", date: iso(14), customerName: "T. Nguyen (Demo)", amount: 2100, method: "card", status: "completed", isStripe: true },
    ],
    outstanding: [
      {
        finalizedQuoteId: "demo-fq-1",
        leadId: "demo-lead-1",
        quoteNumber: 1042,
        customerName: "M. Alvarez (Demo)",
        lane: "75201 → 38103",
        total: 1650,
        paid: 0,
        outstanding: 1650,
        status: "overdue",
        daysOverdue: 12,
      },
      {
        finalizedQuoteId: "demo-fq-2",
        leadId: "demo-lead-2",
        quoteNumber: 1044,
        customerName: "K. Park (Demo)",
        lane: "37201 → 30303",
        total: 980,
        paid: 400,
        outstanding: 580,
        status: "deposit",
        daysOverdue: null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Live queries
// ---------------------------------------------------------------------------

/** MTD/period collected — date-scoped directly at the query layer, NO row
 * cap (fixes audit §19). `received_at` is preferred; a payment recorded
 * without a received_at (rare, manual entries) falls back to
 * `recorded_at` for the same month window via a `.or()` filter. */
async function fetchPeriodPayments(period: Period): Promise<PaymentRow[]> {
  const { start, end } = periodRange(period);
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("payments")
    .select("id, finalized_quote_id, quote_request_id, amount, received_at, recorded_at, method, status, stripe_payment_intent_id")
    .is("deleted_at", null)
    .or(
      `and(received_at.gte.${start},received_at.lt.${end}),and(received_at.is.null,recorded_at.gte.${start},recorded_at.lt.${end})`,
    )
    .returns<PaymentRow[]>();
  return data ?? [];
}

async function computeOutstanding(): Promise<{ rows: CustomerOutstandingRow[]; total: number }> {
  const sb = createServiceRoleClient();
  const now = new Date();
  const DAY_MS = 86_400_000;

  const { data: fqRows } = await sb
    .from("finalized_quotes")
    .select("id, quote_request_id, finalized_quote_number, total_amount, sent_at, payment_due_at")
    .not("sent_at", "is", null)
    .returns<FqRow[]>();
  const fqs = fqRows ?? [];

  const { data: allPayRows } = await sb
    .from("payments")
    .select("id, finalized_quote_id, quote_request_id, amount, received_at, recorded_at, method, status, stripe_payment_intent_id")
    .is("deleted_at", null)
    .not("finalized_quote_id", "is", null)
    .returns<PaymentRow[]>();
  const payments = allPayRows ?? [];

  const leadById = await fetchLeadsFor([...fqs.map((f) => f.quote_request_id), ...payments.map((p) => p.quote_request_id)]);

  const paidByFq = new Map<string, number>();
  for (const p of payments) {
    const amt = num(p.amount);
    if (amt <= 0 || !p.finalized_quote_id || !isReceived(p.status)) continue;
    if (!isActiveLead(leadById, p.quote_request_id)) continue;
    paidByFq.set(p.finalized_quote_id, (paidByFq.get(p.finalized_quote_id) ?? 0) + amt);
  }

  const rows: CustomerOutstandingRow[] = fqs
    .map((fq) => {
      const total = num(fq.total_amount) || null;
      const paid = paidByFq.get(fq.id) ?? 0;
      const lead = fq.quote_request_id ? leadById.get(fq.quote_request_id) : undefined;
      const dueMs = fq.payment_due_at ? new Date(fq.payment_due_at).getTime() : null;
      const isOverdue = dueMs != null && now.getTime() > dueMs;
      const daysOverdue = isOverdue ? Math.floor((now.getTime() - dueMs!) / DAY_MS) : null;
      const status: CustomerOutstandingRow["status"] = isOverdue ? "overdue" : paid <= 0 ? "unpaid" : "deposit";
      const outstanding = total != null ? Math.max(0, total - paid) : 0;
      return {
        finalizedQuoteId: fq.id,
        leadId: fq.quote_request_id,
        quoteNumber: fq.finalized_quote_number,
        customerName: lead?.name?.trim() || "—",
        lane: laneOf(lead),
        total: total ?? 0,
        paid,
        outstanding,
        status,
        daysOverdue,
      };
    })
    .filter((r) => r.total > 0 && r.outstanding > 0.5 && isActiveLead(leadById, r.leadId));

  const total = rows.reduce((s, r) => s + r.outstanding, 0);
  return { rows, total };
}

/** The Accounting page's KPI strip — collected this period + outstanding
 * customer-brokerage balance, both computed correctly (no cap). */
export async function getAccountingSummary(now: Date = new Date()): Promise<AccountingSummary> {
  const period = currentPeriod(now);

  if (await isDemoMode()) {
    const { payments } = demoAccountingRows(now);
    const { outstanding } = demoAccountingRows(now);
    return {
      period,
      periodLabel: periodLabel(period),
      collectedPeriod: payments.reduce((s, p) => s + p.amount, 0),
      outstandingTotal: outstanding.reduce((s, r) => s + r.outstanding, 0),
      outstandingCount: outstanding.length,
    };
  }

  const periodPayments = await fetchPeriodPayments(period);
  const leadById = await fetchLeadsFor(periodPayments.map((p) => p.quote_request_id));
  const collectedPeriod = periodPayments.reduce((sum, p) => {
    const amt = num(p.amount);
    if (amt <= 0 || !isReceived(p.status)) return sum;
    if (!isActiveLead(leadById, p.quote_request_id)) return sum;
    return sum + amt;
  }, 0);

  const { rows, total } = await computeOutstanding();

  return {
    period,
    periodLabel: periodLabel(period),
    collectedPeriod,
    outstandingTotal: total,
    outstandingCount: rows.length,
  };
}

/** Customer-brokerage outstanding balances (finalized quotes not yet paid
 * in full), sorted overdue-first then largest-first — real pagination over
 * the computed set. */
export async function listCustomerOutstanding(opts: { page?: number; pageSize?: number } = {}): Promise<Paginated<CustomerOutstandingRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;

  if (await isDemoMode()) {
    const { outstanding } = demoAccountingRows(new Date());
    const start = (page - 1) * pageSize;
    return toPaginated(outstanding.slice(start, start + pageSize), outstanding.length, page, pageSize);
  }

  const { rows } = await computeOutstanding();
  const sorted = rows.slice().sort((a, b) => {
    const ao = a.status === "overdue" ? 1 : 0;
    const bo = b.status === "overdue" ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return b.outstanding - a.outstanding;
  });
  const start = (page - 1) * pageSize;
  return toPaginated(sorted.slice(start, start + pageSize), sorted.length, page, pageSize);
}

/** Recent payments ledger — real pagination (not a hardcoded last-15). */
export async function listCustomerPayments(opts: { page?: number; pageSize?: number } = {}): Promise<Paginated<CustomerPaymentRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;

  if (await isDemoMode()) {
    const { payments } = demoAccountingRows(new Date());
    const start = (page - 1) * pageSize;
    return toPaginated(payments.slice(start, start + pageSize), payments.length, page, pageSize);
  }

  const sb = createServiceRoleClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count } = await sb
    .from("payments")
    .select("id, finalized_quote_id, quote_request_id, amount, received_at, recorded_at, method, status, stripe_payment_intent_id", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order("received_at", { ascending: false, nullsFirst: false })
    .range(from, to)
    .returns<PaymentRow[]>();

  const rows = data ?? [];
  const leadById = await fetchLeadsFor(rows.map((p) => p.quote_request_id));
  const mapped: CustomerPaymentRow[] = rows
    .filter((p) => isActiveLead(leadById, p.quote_request_id))
    .map((p) => {
      const lead = p.quote_request_id ? leadById.get(p.quote_request_id) : undefined;
      return {
        id: p.id,
        date: p.received_at ?? p.recorded_at,
        customerName: lead?.name?.trim() || "—",
        amount: num(p.amount),
        method: (p.method ?? "other").trim(),
        status: (p.status ?? "completed").trim(),
        isStripe: !!p.stripe_payment_intent_id,
      };
    });
  return toPaginated(mapped, count ?? mapped.length, page, pageSize);
}
