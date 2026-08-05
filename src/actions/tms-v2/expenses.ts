"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";
import { RECURRING_FREQUENCIES, type RecurringFrequency } from "@/lib/domain/expenses";

/**
 * Recurring-expenses writes — same mutation() pattern as
 * src/actions/tms-v2/loads.ts (see that file's header, and
 * src/lib/demo/mutation.ts, for the pattern itself). Field set and
 * frequency/day-anchor rules are ported from V1's
 * src/app/admin/(authed)/expenses/actions.ts so a row written here reads
 * identically on /admin's ledger — same table (`recurring_expenses`), same
 * soft-delete-by-`deleted_at` convention (unused here — archive is a flag,
 * not a delete, matching V1). expense_accounts (the card dropdown) stays
 * read-only in this phase (lib/data/recurring-expenses.ts's
 * listExpenseAccounts) — adding/editing payment methods is a later phase.
 */

const PATH = "/tms-v2/expenses";

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

function isFrequency(v: string): v is RecurringFrequency {
  return (RECURRING_FREQUENCIES as readonly string[]).includes(v);
}

/** "$1,250.50" -> 1250.5, rounded to cents. Null when blank/invalid/negative. */
function moneyOrNull(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function dayOfMonthOrNull(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 31 ? rounded : null;
}

const WEEKDAYS = new Set(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);

function dayOfWeekOrNull(raw: string | null): string | null {
  if (!raw) return null;
  return WEEKDAYS.has(raw) ? raw : null;
}

function isoDateOrNull(raw: string | null): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

type ExpenseFields = {
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  frequency: RecurringFrequency;
  day_of_month: number | null;
  day_of_week: string | null;
  start_date: string | null;
  card: string | null;
  autopay: boolean;
};

function parseFields(formData: FormData): { ok: true; fields: ExpenseFields } | { ok: false; reason: string } {
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Name is required." };
  const amount = moneyOrNull(str(formData, "amount"));
  if (amount == null) return { ok: false, reason: "Enter a valid amount." };
  const frequencyRaw = str(formData, "frequency") ?? "monthly";
  const frequency = isFrequency(frequencyRaw) ? frequencyRaw : "monthly";
  const isWeekly = frequency === "weekly";
  const isOnetime = frequency === "onetime";

  if (isWeekly && !dayOfWeekOrNull(str(formData, "day_of_week"))) {
    return { ok: false, reason: "Pick a day of the week." };
  }
  if (isOnetime && !isoDateOrNull(str(formData, "start_date"))) {
    return { ok: false, reason: "Pick a date." };
  }

  return {
    ok: true,
    fields: {
      name,
      category: str(formData, "category"),
      vendor: str(formData, "vendor"),
      amount,
      frequency,
      day_of_month: isWeekly || isOnetime ? null : dayOfMonthOrNull(str(formData, "day_of_month")),
      day_of_week: isWeekly ? dayOfWeekOrNull(str(formData, "day_of_week")) : null,
      start_date: isoDateOrNull(str(formData, "start_date")),
      card: str(formData, "card"),
      autopay: bool(formData, "autopay"),
    },
  };
}

export const addExpense = mutation(async (formData: FormData): Promise<MutationResult<{ id: string }>> => {
  const parsed = parseFields(formData);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("recurring_expenses")
    .insert({ ...parsed.fields, archived: false })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, reason: `Could not add expense: ${error?.message ?? "unknown error"}` };

  revalidatePath(PATH);
  return { ok: true, data: { id: data.id } };
});

export const editExpense = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const parsed = parseFields(formData);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("recurring_expenses")
    .update({ ...parsed.fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not save expense: ${error.message}` };

  revalidatePath(PATH);
  return { ok: true };
});

/** Toggle an expense between active and archived — a flag, not a delete
 * (V1's own distinction; the ledger keeps archived rows visible under the
 * "Archived" filter rather than hiding them). */
export const setExpenseArchived = mutation(async (id: string, archived: boolean): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ archived }).eq("id", id).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not ${archived ? "archive" : "restore"} expense: ${error.message}` };

  revalidatePath(PATH);
  return { ok: true };
});
