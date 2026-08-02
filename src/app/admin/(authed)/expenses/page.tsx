import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ExpensesView } from "./ExpensesView";
import {
  formatNextCharge,
  isFrequency,
  monthlyAmount,
  nextChargeDate,
  toIsoDate,
  type ExpenseAccount,
  type ExpenseItem,
  type ExpensesData,
} from "./types";

export const metadata: Metadata = {
  title: "Expenses",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Payments → Expenses. A manual log of recurring charges (insurance, truck
 * payment, subscriptions, …) — not connected to any bank or card, no live
 * balances. Purely what the operator types in, restyled as a QuickBooks-
 * style ledger (dense table, KPI strip, payment-method manager).
 */

type ExpenseRow = {
  id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number | string | null;
  frequency: string | null;
  day_of_month: number | null;
  day_of_week: string | null;
  start_date: string | null;
  card: string | null;
  autopay: boolean | null;
  notes: string | null;
  archived: boolean | null;
  tags: string[] | null;
  skip_next_date: string | null;
};

type AccountRow = {
  id: string;
  name: string;
  type: string | null;
  last4: string | null;
  is_default: boolean | null;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadExpenses(): Promise<ExpensesData> {
  const sb = createServiceRoleClient();
  const [{ data }, { data: accountRows }] = await Promise.all([
    sb
      .from("recurring_expenses")
      .select(
        "id, name, category, vendor, amount, frequency, day_of_month, day_of_week, start_date, card, autopay, notes, archived, tags, skip_next_date",
      )
      .is("deleted_at", null)
      .returns<ExpenseRow[]>(),
    sb
      .from("expense_accounts")
      .select("id, name, type, last4, is_default")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<AccountRow[]>(),
  ]);

  // One `now` for every row, computed here rather than in the client, so the
  // "Next …" label and the KPI math can't drift by timezone or clock skew on
  // hydration.
  const now = new Date();

  const expenses: ExpenseItem[] = (data ?? []).map((r) => {
    const rawFrequency = r.frequency ?? "";
    const frequency = isFrequency(rawFrequency) ? rawFrequency : "monthly";
    const amount = num(r.amount);
    const item = {
      id: r.id,
      name: r.name,
      category: r.category,
      vendor: r.vendor,
      amount,
      frequency,
      dayOfMonth: r.day_of_month,
      dayOfWeek: r.day_of_week,
      startDate: r.start_date,
      card: r.card,
      autopay: r.autopay ?? true,
      notes: r.notes,
      archived: r.archived ?? false,
      tags: r.tags ?? [],
      skipNextDate: r.skip_next_date,
      monthlyAmount: monthlyAmount(amount, frequency),
    };
    const nextDate = nextChargeDate(item, now);
    return {
      ...item,
      nextChargeLabel: nextDate ? formatNextCharge(nextDate, now) : null,
      nextChargeDateIso: nextDate ? toIsoDate(nextDate) : null,
    };
  });

  expenses.sort((a, b) => {
    const d = (a.dayOfMonth ?? 32) - (b.dayOfMonth ?? 32);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });

  // ── KPI math ──────────────────────────────────────────────────────────
  // This is a hand-kept schedule log, not a transaction ledger, so these
  // figures are the best honest estimate from the recurring schedule rather
  // than actual posted amounts:
  //   This Month      — every active (non-archived) recurring charge's
  //                      monthly-equivalent, plus any one-time charge dated
  //                      in the current calendar month.
  //   Recurring        — count of active, non-one-time charges.
  //   YTD Expenses     — monthly-equivalent × months elapsed this year,
  //                      plus one-time charges already dated this year.
  //   Average Monthly  — YTD ÷ months elapsed.
  const year = now.getFullYear();
  const monthIndex = now.getMonth(); // 0-11
  const monthsElapsed = monthIndex + 1;

  const active = expenses.filter((e) => !e.archived);
  const recurringActive = active.filter((e) => e.frequency !== "onetime");
  const onetimeActive = active.filter((e) => e.frequency === "onetime" && e.startDate);

  const monthlyTotal = recurringActive.reduce((s, e) => s + e.monthlyAmount, 0);
  const recurringCount = recurringActive.length;

  const onetimeThisMonth = onetimeActive
    .filter((e) => {
      const d = new Date(e.startDate as string);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    })
    .reduce((s, e) => s + e.amount, 0);

  const onetimeYtd = onetimeActive
    .filter((e) => {
      const d = new Date(e.startDate as string);
      return d.getFullYear() === year && d.getTime() <= now.getTime();
    })
    .reduce((s, e) => s + e.amount, 0);

  const thisMonth = monthlyTotal + onetimeThisMonth;
  const ytd = monthlyTotal * monthsElapsed + onetimeYtd;
  const averageMonthly = ytd / monthsElapsed;

  // ── Payment-method aggregates ────────────────────────────────────────
  const accounts: ExpenseAccount[] = (accountRows ?? []).map((a) => {
    const linked = active.filter((e) => e.card === a.name);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      last4: a.last4,
      isDefault: a.is_default ?? false,
      monthlySpend: linked.reduce((s, e) => s + e.monthlyAmount, 0),
      chargeCount: linked.length,
    };
  });

  return {
    expenses,
    accounts,
    kpis: { thisMonth, recurringCount, ytd, averageMonthly },
  };
}

export default async function ExpensesPage() {
  const data = await loadExpenses();
  return <ExpensesView data={data} />;
}
