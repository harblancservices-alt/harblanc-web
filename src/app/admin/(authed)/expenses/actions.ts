"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { isFrequency } from "./types";

/**
 * Recurring expenses — a manual log of monthly-ish charges (insurance, truck
 * payment, subscriptions, …). No bank/card connection; every field here is
 * hand-entered and nothing here moves real money.
 */

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** "$1,250.50" → 1250.5. Null when blank/invalid/negative. Rounded to cents. */
function moneyOrNull(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Clamped to 1–31. Null when blank/invalid. */
function dayOfMonthOrNull(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 31) return null;
  return rounded;
}

type ExpenseFields = {
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  frequency: string;
  dayOfMonth: number | null;
  card: string | null;
  autopay: boolean;
  notes: string | null;
};

function parseFields(fd: FormData): ExpenseFields {
  const name = str(fd, "name");
  if (!name) throw new Error("Name is required.");
  const amount = moneyOrNull(str(fd, "amount"));
  if (amount == null) throw new Error("Enter a valid amount.");
  const frequencyRaw = str(fd, "frequency") ?? "monthly";
  const frequency = isFrequency(frequencyRaw) ? frequencyRaw : "monthly";
  return {
    name,
    category: str(fd, "category"),
    vendor: str(fd, "vendor"),
    amount,
    frequency,
    dayOfMonth: dayOfMonthOrNull(str(fd, "day_of_month")),
    card: str(fd, "card"),
    autopay: bool(fd, "autopay"),
    notes: str(fd, "notes"),
  };
}

export async function createExpense(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const f = parseFields(formData);
  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").insert({
    name: f.name,
    category: f.category,
    vendor: f.vendor,
    amount: f.amount,
    frequency: f.frequency,
    day_of_month: f.dayOfMonth,
    card: f.card,
    autopay: f.autopay,
    notes: f.notes,
  });
  if (error) throw new Error(`Could not save expense: ${error.message}`);
  revalidatePath("/admin/expenses");
}

export async function updateExpense(
  id: string,
  formData: FormData,
): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!id) throw new Error("Missing expense.");
  const f = parseFields(formData);
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("recurring_expenses")
    .update({
      name: f.name,
      category: f.category,
      vendor: f.vendor,
      amount: f.amount,
      frequency: f.frequency,
      day_of_month: f.dayOfMonth,
      card: f.card,
      autopay: f.autopay,
      notes: f.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Could not update expense: ${error.message}`);
  revalidatePath("/admin/expenses");
}

export async function deleteExpense(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!id) throw new Error("Missing expense.");
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("recurring_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not delete expense: ${error.message}`);
  revalidatePath("/admin/expenses");
}

// ---------------------------------------------------------------------------
// Expense accounts — a name-only list of the operator's cards/accounts, used
// to populate the expense form's "Card" dropdown. No card numbers stored.

export type CreateAccountResult =
  | { ok: true; id: string; name: string }
  | { ok: false; reason: string };

export async function createExpenseAccount(
  formData: FormData,
): Promise<CreateAccountResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — account changes are disabled." };
  }
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Name is required." };
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("expense_accounts")
    .insert({ name })
    .select("id, name")
    .single<{ id: string; name: string }>();
  if (error || !data) {
    return {
      ok: false,
      reason: `Could not add account: ${error?.message ?? "unknown error"}`,
    };
  }
  revalidatePath("/admin/expenses");
  return { ok: true, id: data.id, name: data.name };
}

export async function deleteExpenseAccount(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!id) throw new Error("Missing account.");
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("expense_accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not delete account: ${error.message}`);
  revalidatePath("/admin/expenses");
}
