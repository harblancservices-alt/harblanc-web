import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoReceivables } from "@/lib/demo/demoData";
import { daysOutstanding } from "@/lib/dispatch/alerts";
import {
  ReceivablesView,
} from "./ReceivablesView";
import type { PaidItem, ReceivableItem } from "@/lib/dispatch/view-types";

export const metadata: Metadata = {
  title: "Accounts Receivable",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Accounts Receivable.
 *
 * Every delivered-but-unpaid load, across ALL months, is money still owed by a
 * broker. This page is the single all-time A/R tally (the load board's "A/R"
 * KPI links here): outstanding loads with a running total, aging buckets, a
 * "Mark as paid" action per card that drops it off the list, and a small
 * "recently paid" strip so an accidental mark-paid can be undone.
 *
 * A/R = sum of RATE over delivered loads whose payment_status is not "paid".
 * payment_status only ever holds "unpaid" (default) or "paid" — there is no
 * "factored" state — so every delivered-unpaid load counts as receivable.
 *
 * This file is the data half only: it reads, derives (days outstanding, the
 * formatted dates, the total) against ONE `now`, and hands plain rows to
 * ReceivablesView. Every layout, color, sort and filter decision lives there.
 * Deriving the day count here rather than in the client is what keeps the
 * aging badges from rehydrating to a different number than they rendered with.
 */

type ReceivableRow = {
  id: string;
  load_number: string | null;
  broker_id: string | null;
  broker_name: string | null;
  origin: string | null;
  destination: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  paid_at: string | null;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  // Date-only columns are parsed at UTC midnight to avoid a TZ off-by-one.
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  // M/D/YYYY — clean and legible, e.g. "3/5/2026".
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SELECT =
  "id, load_number, broker_id, broker_name, origin, destination, delivery_date, rate, paid_at";

async function loadReceivables() {
  // DEMO MODE: return the static fake dataset and never touch Supabase.
  if (await isDemoMode()) return demoReceivables();

  const sb = createServiceRoleClient();

  // Outstanding = delivered, not paid, not soft-deleted. Oldest delivery first
  // so the longest-owed money is at the top by default (the view can re-sort).
  const { data: outstandingData } = await sb
    .from("loads")
    .select(SELECT)
    .eq("status", "delivered")
    .neq("payment_status", "paid")
    .is("deleted_at", null)
    .order("delivery_date", { ascending: true, nullsFirst: false })
    .returns<ReceivableRow[]>();

  // Recently paid — the undo affordance. Most-recently-paid first.
  const { data: paidData } = await sb
    .from("loads")
    .select(SELECT)
    .eq("status", "delivered")
    .eq("payment_status", "paid")
    .not("paid_at", "is", null)
    .is("deleted_at", null)
    .order("paid_at", { ascending: false })
    .limit(6)
    .returns<ReceivableRow[]>();

  const now = new Date();

  const outstanding: ReceivableItem[] = (outstandingData ?? []).map((l) => ({
    id: l.id,
    loadNumber: l.load_number,
    brokerId: l.broker_id,
    brokerName: l.broker_name,
    origin: l.origin,
    destination: l.destination,
    deliveredLabel: fmtDate(l.delivery_date),
    rate: num(l.rate),
    days: daysOutstanding(l.delivery_date, now),
  }));

  const recentlyPaid: PaidItem[] = (paidData ?? []).map((l) => ({
    id: l.id,
    loadNumber: l.load_number,
    brokerName: l.broker_name,
    rate: num(l.rate),
  }));

  const arTotal = outstanding.reduce((s, l) => s + l.rate, 0);
  return { outstanding, recentlyPaid, arTotal };
}

export default async function ReceivablesPage() {
  const { outstanding, recentlyPaid, arTotal } = await loadReceivables();

  return (
    <ReceivablesView
      outstanding={outstanding}
      recentlyPaid={recentlyPaid}
      arTotal={arTotal}
    />
  );
}
