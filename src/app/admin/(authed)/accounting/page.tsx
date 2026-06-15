import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe/server";
import { AccountingView, type AccountingData } from "./AccountingView";

export const metadata: Metadata = {
  title: "Accounting",
  robots: { index: false, follow: false },
};

/**
 * Accounting page.
 *
 * Local-first: A/R and the payments ledger come from the `payments` +
 * `finalized_quotes` tables (every method, instant). Stripe-only figures —
 * processing fees, payouts to the bank, and current balance — are pulled
 * live from the Stripe API on each load and degrade gracefully if the
 * secret key isn't configured.
 */

type PaymentRow = {
  id: string;
  finalized_quote_id: string | null;
  quote_request_id: string | null;
  amount: number | string | null;
  currency: string | null;
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

type LeadRow = {
  id: string;
  name: string | null;
  pickup_zip: string | null;
  delivery_zip: string | null;
  deleted_at: string | null;
};

// Payment statuses that do NOT count as money received.
const NON_RECEIVED = new Set(["cancelled", "failed", "refunded", "pending"]);

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function received(p: PaymentRow): boolean {
  const s = (p.status ?? "completed").toLowerCase();
  return !NON_RECEIVED.has(s);
}

function laneOf(lead: LeadRow | undefined): string {
  const o = lead?.pickup_zip?.trim() || "—";
  const d = lead?.delivery_zip?.trim() || "—";
  return `${o} → ${d}`;
}

async function loadAccounting(): Promise<AccountingData> {
  const sb = createServiceRoleClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthStartIso = monthStart.toISOString();

  const [{ data: payRows }, { data: fqRows }] = await Promise.all([
    sb
      .from("payments")
      .select(
        "id, finalized_quote_id, quote_request_id, amount, currency, received_at, recorded_at, method, status, stripe_payment_intent_id",
      )
      .is("deleted_at", null)
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(100)
      .returns<PaymentRow[]>(),
    sb
      .from("finalized_quotes")
      .select(
        "id, quote_request_id, finalized_quote_number, total_amount, sent_at, payment_due_at",
      )
      .not("sent_at", "is", null)
      .returns<FqRow[]>(),
  ]);

  const payments = payRows ?? [];
  const fqs = fqRows ?? [];

  const leadIds = Array.from(
    new Set(
      [
        ...fqs.map((f) => f.quote_request_id),
        ...payments.map((p) => p.quote_request_id),
      ].filter((x): x is string => !!x),
    ),
  );
  let leads: LeadRow[] = [];
  if (leadIds.length > 0) {
    const { data } = await sb
      .from("quote_requests")
      .select("id, name, pickup_zip, delivery_zip, deleted_at")
      .in("id", leadIds)
      .returns<LeadRow[]>();
    leads = data ?? [];
  }
  const leadById = new Map(leads.map((l) => [l.id, l]));

  // A finalized quote / payment only counts if its parent quote still exists
  // and isn't trashed. Soft-deleting a quote (deleted_at) doesn't cascade to
  // finalized_quotes / payments, so without this filter deleted test quotes
  // keep haunting A/R and the ledger.
  const isActiveLead = (id: string | null): boolean =>
    id != null && leadById.get(id)?.deleted_at == null && leadById.has(id);

  // Paid-per-finalized-quote (received payments only).
  const paidByFq = new Map<string, number>();
  for (const p of payments) {
    const amt = num(p.amount) ?? 0;
    if (amt <= 0 || !p.finalized_quote_id || !received(p)) continue;
    if (!isActiveLead(p.quote_request_id)) continue;
    paidByFq.set(
      p.finalized_quote_id,
      (paidByFq.get(p.finalized_quote_id) ?? 0) + amt,
    );
  }

  // Collected this month.
  let collectedMtd = 0;
  for (const p of payments) {
    const amt = num(p.amount) ?? 0;
    if (amt <= 0 || !received(p) || !isActiveLead(p.quote_request_id)) continue;
    const when = p.received_at ?? p.recorded_at;
    if (when && when >= monthStartIso) collectedMtd += amt;
  }

  // Accounts receivable — sent finalized quotes not paid in full.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const receivables = fqs
    .map((fq) => {
      const total = num(fq.total_amount);
      const paid = paidByFq.get(fq.id) ?? 0;
      const lead = fq.quote_request_id
        ? leadById.get(fq.quote_request_id)
        : undefined;
      // Overdue once the payment-due date has passed with money still owed.
      const dueMs = fq.payment_due_at
        ? new Date(fq.payment_due_at).getTime()
        : null;
      const isOverdue = dueMs != null && now.getTime() > dueMs;
      const daysOverdue = isOverdue
        ? Math.floor((now.getTime() - dueMs!) / DAY_MS)
        : null;
      const status: "overdue" | "unpaid" | "deposit" = isOverdue
        ? "overdue"
        : paid <= 0
          ? "unpaid"
          : "deposit";
      return {
        fqId: fq.id,
        leadId: fq.quote_request_id,
        number: fq.finalized_quote_number,
        customerName: lead?.name?.trim() || "—",
        lane: laneOf(lead),
        total,
        paid,
        outstanding: total != null ? Math.max(0, total - paid) : null,
        status,
        daysOverdue,
      };
    })
    .filter(
      (r) =>
        r.total != null &&
        (r.outstanding ?? 0) > 0.5 &&
        isActiveLead(r.leadId),
    )
    .sort((a, b) => {
      const ao = a.status === "overdue" ? 1 : 0;
      const bo = b.status === "overdue" ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return (b.outstanding ?? 0) - (a.outstanding ?? 0);
    });

  const outstandingAr = receivables.reduce(
    (s, r) => s + (r.outstanding ?? 0),
    0,
  );

  // Ledger — recent payments, every method, excluding any tied to a
  // trashed/missing quote.
  const ledger = payments
    .filter((p) => isActiveLead(p.quote_request_id))
    .slice(0, 15)
    .map((p) => {
    const lead = p.quote_request_id
      ? leadById.get(p.quote_request_id)
      : undefined;
    return {
      id: p.id,
      date: p.received_at ?? p.recorded_at,
      customerName: lead?.name?.trim() || "—",
      amount: num(p.amount) ?? 0,
      method: (p.method ?? "other").trim(),
      status: (p.status ?? "completed").trim(),
      isStripe: !!p.stripe_payment_intent_id,
    };
  });

  // ── Stripe-only figures (live) ────────────────────────────────────────
  let stripeOk = false;
  let feesMtd = 0;
  let balance: { available: number; pending: number } | null = null;
  let payouts: AccountingData["payouts"] = [];

  try {
    const stripe = getStripeClient();
    const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
    const [bal, payoutList, txns] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 8 }),
      stripe.balanceTransactions.list({
        created: { gte: monthStartUnix },
        limit: 100,
      }),
    ]);
    stripeOk = true;

    const usd = (
      arr: ReadonlyArray<{ amount: number; currency: string }>,
    ): number =>
      arr
        .filter((a) => a.currency === "usd")
        .reduce((s, a) => s + a.amount, 0) / 100;
    balance = { available: usd(bal.available), pending: usd(bal.pending) };

    feesMtd =
      txns.data.reduce((s, t) => s + (t.fee > 0 ? t.fee : 0), 0) / 100;

    payouts = payoutList.data.map((p) => ({
      id: p.id,
      date: new Date(p.created * 1000).toISOString(),
      arrivalDate: p.arrival_date
        ? new Date(p.arrival_date * 1000).toISOString()
        : null,
      amount: p.amount / 100,
      status: p.status,
    }));
  } catch {
    stripeOk = false;
  }

  const netToBank = collectedMtd - feesMtd;

  return {
    monthLabel: now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    summary: { collectedMtd, feesMtd, netToBank, outstandingAr },
    receivables,
    ledger,
    payouts,
    balance,
    stripeOk,
    stripeDashboardUrl: "https://dashboard.stripe.com/payments",
  };
}

export default async function AccountingPage() {
  const data = await loadAccounting();
  return <AccountingView data={data} />;
}
