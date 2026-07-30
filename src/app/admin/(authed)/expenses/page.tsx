import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ExpensesView } from "./ExpensesView";
import {
  isFrequency,
  monthlyAmount,
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
 * balances. Purely what the operator types in.
 */

type ExpenseRow = {
  id: string;
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number | string | null;
  frequency: string | null;
  day_of_month: number | null;
  card: string | null;
  autopay: boolean | null;
  notes: string | null;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

type AccountRow = { id: string; name: string };

async function loadExpenses(): Promise<ExpensesData> {
  const sb = createServiceRoleClient();
  const [{ data }, { data: accountRows }] = await Promise.all([
    sb
      .from("recurring_expenses")
      .select(
        "id, name, category, vendor, amount, frequency, day_of_month, card, autopay, notes",
      )
      .is("deleted_at", null)
      .returns<ExpenseRow[]>(),
    sb
      .from("expense_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<AccountRow[]>(),
  ]);
  const accounts: ExpenseAccount[] = accountRows ?? [];

  const expenses: ExpenseItem[] = (data ?? []).map((r) => {
    const rawFrequency = r.frequency ?? "";
    const frequency = isFrequency(rawFrequency) ? rawFrequency : "monthly";
    const amount = num(r.amount);
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      vendor: r.vendor,
      amount,
      frequency,
      dayOfMonth: r.day_of_month,
      card: r.card,
      autopay: r.autopay ?? true,
      notes: r.notes,
      monthlyAmount: monthlyAmount(amount, frequency),
    };
  });

  expenses.sort((a, b) => {
    const d = (a.dayOfMonth ?? 32) - (b.dayOfMonth ?? 32);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });

  const monthlyTotal = expenses.reduce((s, e) => s + e.monthlyAmount, 0);
  const annualTotal = monthlyTotal * 12;

  const categoryMap = new Map<string, number>();
  const cardMap = new Map<string, number>();
  for (const e of expenses) {
    const catKey = e.category?.trim() || "Uncategorized";
    categoryMap.set(catKey, (categoryMap.get(catKey) ?? 0) + e.monthlyAmount);
    const cardKey = e.card?.trim() || "No card on file";
    cardMap.set(cardKey, (cardMap.get(cardKey) ?? 0) + e.monthlyAmount);
  }
  const byCategory = Array.from(categoryMap, ([label, total]) => ({ label, total })).sort(
    (a, b) => b.total - a.total,
  );
  const byCard = Array.from(cardMap, ([label, total]) => ({ label, total })).sort(
    (a, b) => b.total - a.total,
  );

  return { expenses, accounts, monthlyTotal, annualTotal, byCategory, byCard };
}

export default async function ExpensesPage() {
  const data = await loadExpenses();
  return <ExpensesView data={data} />;
}
