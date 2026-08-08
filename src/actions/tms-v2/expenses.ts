"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";
import { RECURRING_FREQUENCIES, type RecurringFrequency } from "@/lib/domain/expenses";
import { nextChargeDate, toIsoDate } from "@/lib/data/recurring-expenses";

/**
 * Recurring-expenses writes — same mutation() pattern as
 * src/actions/tms-v2/loads.ts (see that file's header, and
 * src/lib/demo/mutation.ts, for the pattern itself). Field set and
 * frequency/day-anchor rules are ported from V1's
 * src/app/admin/(authed)/expenses/actions.ts so a row written here reads
 * identically on /admin's ledger — same table (`recurring_expenses`), same
 * soft-delete-by-`deleted_at` convention.
 *
 * Every mutation below also writes to `expense_activity` (same table
 * /admin's ledger already reads/writes — not a second audit system),
 * mirroring legacy's own logActivity()/getExpenseActivity() rather than
 * reimplementing them: best-effort, never blocks or fails the caller's
 * mutation on a logging hiccup.
 */

const PATH = "/tms-v2/expenses";

async function logActivity(
  sb: ReturnType<typeof createServiceRoleClient>,
  expenseId: string,
  action: string,
  detail?: string | null,
): Promise<void> {
  try {
    await sb.from("expense_activity").insert({ expense_id: expenseId, action, detail: detail ?? null });
  } catch {
    // best-effort only
  }
}

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
  end_date: string | null;
  card: string | null;
  expense_account_id: string | null;
  autopay: boolean;
  notes: string | null;
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
  const startDate = isoDateOrNull(str(formData, "start_date"));
  const endDate = isoDateOrNull(str(formData, "end_date"));
  if (startDate && endDate && endDate < startDate) {
    return { ok: false, reason: "End date can't be before the start date." };
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
      start_date: startDate,
      end_date: endDate,
      card: str(formData, "card"),
      expense_account_id: str(formData, "expense_account_id"),
      autopay: bool(formData, "autopay"),
      notes: str(formData, "notes"),
    },
  };
}

/** Resolves the chosen payment account to both its id (the real FK) and its
 * name (kept in `card` too, so /admin's ledger — which only reads `card`
 * text — stays in sync without needing its own changes). Null fields when
 * no account is selected. */
async function resolveAccount(
  sb: ReturnType<typeof createServiceRoleClient>,
  expenseAccountId: string | null,
): Promise<{ id: string | null; name: string | null }> {
  if (!expenseAccountId) return { id: null, name: null };
  const { data } = await sb.from("expense_accounts").select("id, name").eq("id", expenseAccountId).maybeSingle<{ id: string; name: string }>();
  return data ? { id: data.id, name: data.name } : { id: null, name: null };
}

export const addExpense = mutation(async (formData: FormData): Promise<MutationResult<{ id: string }>> => {
  const parsed = parseFields(formData);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const sb = createServiceRoleClient();
  const account = await resolveAccount(sb, parsed.fields.expense_account_id);
  const { data, error } = await sb
    .from("recurring_expenses")
    .insert({ ...parsed.fields, card: account.name ?? parsed.fields.card, expense_account_id: account.id, archived: false })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, reason: `Could not add expense: ${error?.message ?? "unknown error"}` };

  await logActivity(sb, data.id, "Created", parsed.fields.vendor ? `Vendor: ${parsed.fields.vendor}` : null);
  revalidatePath(PATH);
  return { ok: true, data: { id: data.id } };
});

type PriorRow = {
  amount: number | string | null;
  card: string | null;
  expense_account_id: string | null;
  start_date: string | null;
  day_of_month: number | null;
  day_of_week: string | null;
};

export const editExpense = mutation(async (id: string, formData: FormData): Promise<MutationResult> => {
  const parsed = parseFields(formData);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const sb = createServiceRoleClient();
  const [account, { data: prior }] = await Promise.all([
    resolveAccount(sb, parsed.fields.expense_account_id),
    sb
      .from("recurring_expenses")
      .select("amount, card, expense_account_id, start_date, day_of_month, day_of_week")
      .eq("id", id)
      .maybeSingle<PriorRow>(),
  ]);
  const { error } = await sb
    .from("recurring_expenses")
    .update({ ...parsed.fields, card: account.name ?? parsed.fields.card, expense_account_id: account.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not save expense: ${error.message}` };

  const changes: [string, string | null][] = [];
  if (prior) {
    const priorAmount = prior.amount == null ? null : Number(prior.amount);
    if (priorAmount != null && priorAmount !== parsed.fields.amount) {
      changes.push(["Amount changed", `$${priorAmount.toFixed(2)} → $${parsed.fields.amount.toFixed(2)}`]);
    }
    const priorAccountKey = prior.expense_account_id ?? prior.card ?? null;
    const nextAccountKey = account.id ?? parsed.fields.card ?? null;
    if (priorAccountKey !== nextAccountKey) {
      changes.push(["Payment method changed", `${prior.card ?? "None"} → ${account.name ?? parsed.fields.card ?? "None"}`]);
    }
    if (prior.start_date !== parsed.fields.start_date || prior.day_of_month !== parsed.fields.day_of_month || prior.day_of_week !== parsed.fields.day_of_week) {
      changes.push(["Date changed", null]);
    }
  }
  if (changes.length > 0) {
    await Promise.all(changes.map(([action, detail]) => logActivity(sb, id, action, detail)));
  } else {
    await logActivity(sb, id, "Updated");
  }

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

  await logActivity(sb, id, archived ? "Archived" : "Restored");
  revalidatePath(PATH);
  return { ok: true };
});

/** Single-row delete — was bulk-only (bulkDeleteExpenses); the per-row kebab-
 * menu case legacy has always had. Same soft-delete-by-`deleted_at`. */
export const deleteExpense = mutation(async (id: string): Promise<MutationResult> => {
  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: `Could not delete expense: ${error.message}` };

  await logActivity(sb, id, "Deleted");
  revalidatePath(PATH);
  return { ok: true };
});

/* ────────────────────────────────────────────────────────────── */
/* Bulk actions — Phase 6 item 3. Ported from legacy's                */
/* admin/expenses/actions.ts (bulkArchiveExpenses/bulkDeleteExpenses/ */
/* bulkChangeCategory), reshaped to mutation()/ids:string[] like the  */
/* applications.ts bulk actions. Legacy's `deleted_at` delete has no  */
/* restore UI anywhere (a genuine, permanent-looking removal) — that  */
/* semantic is preserved as-is, not upgraded to a trash/restore flow. */
/* ────────────────────────────────────────────────────────────── */

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((s) => s.length > 0)));
}

export const bulkArchiveExpenses = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No expenses selected." };

  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ archived: true }).in("id", uniq).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not archive expenses: ${error.message}` };

  await Promise.all(uniq.map((id) => logActivity(sb, id, "Archived", "Bulk action")));
  revalidatePath(PATH);
  return { ok: true };
});

export const bulkDeleteExpenses = mutation(async (ids: string[]): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No expenses selected." };

  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ deleted_at: new Date().toISOString() }).in("id", uniq);
  if (error) return { ok: false, reason: `Could not delete expenses: ${error.message}` };

  await Promise.all(uniq.map((id) => logActivity(sb, id, "Deleted", "Bulk action")));
  revalidatePath(PATH);
  return { ok: true };
});

/* ────────────────────────────────────────────────────────────── */
/* CSV import — ported from legacy's admin/expenses/actions.ts        */
/* importExpenses. Parsing happens client-side (splitCsvLine, src/    */
/* lib/csv.ts); this action just receives already-validated rows.     */
/* ────────────────────────────────────────────────────────────── */

export type ImportExpenseRow = {
  vendor: string;
  category: string | null;
  description: string | null;
  amount: number;
  paymentMethod: string | null;
  frequency: string;
  startDate: string | null;
};

export const importExpenses = mutation(async (rows: ImportExpenseRow[]): Promise<MutationResult<{ count: number }>> => {
  if (rows.length === 0) return { ok: false, reason: "No rows to import." };

  const sb = createServiceRoleClient();
  const payload = rows.map((r) => ({
    name: r.vendor,
    vendor: r.vendor,
    category: r.category,
    notes: r.description,
    amount: r.amount,
    frequency: isFrequency(r.frequency) ? r.frequency : "monthly",
    start_date: r.startDate,
    card: r.paymentMethod,
    autopay: true,
    archived: false,
  }));
  const { data, error } = await sb.from("recurring_expenses").insert(payload).select("id");
  if (error) return { ok: false, reason: `Import failed: ${error.message}` };

  await Promise.all((data ?? []).map((r: { id: string }) => logActivity(sb, r.id, "Created", "Imported from CSV")));
  revalidatePath(PATH);
  return { ok: true, data: { count: data?.length ?? 0 } };
});

export const bulkChangeExpenseCategory = mutation(async (ids: string[], category: string): Promise<MutationResult> => {
  const uniq = dedupeIds(ids);
  if (uniq.length === 0) return { ok: false, reason: "No expenses selected." };
  const trimmed = category.trim();
  if (!trimmed) return { ok: false, reason: "Choose a category." };

  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ category: trimmed }).in("id", uniq).is("deleted_at", null);
  if (error) return { ok: false, reason: `Could not update category: ${error.message}` };

  await Promise.all(uniq.map((id) => logActivity(sb, id, "Category changed", trimmed)));
  revalidatePath(PATH);
  return { ok: true };
});

/* ────────────────────────────────────────────────────────────── */
/* Duplicate + Skip next payment — ported from legacy's                */
/* admin/expenses/actions.ts (duplicateExpense/skipNextPayment),       */
/* reshaped to mutation()/MutationResult like every other action here. */
/* ────────────────────────────────────────────────────────────── */

export const duplicateExpense = mutation(async (id: string): Promise<MutationResult<{ id: string }>> => {
  const sb = createServiceRoleClient();
  const { data: source, error: readError } = await sb
    .from("recurring_expenses")
    .select("name, category, vendor, amount, frequency, day_of_month, day_of_week, start_date, end_date, card, expense_account_id, autopay, notes")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !source) return { ok: false, reason: `Could not duplicate: ${readError?.message ?? "expense not found"}` };

  const { data: copy, error: insertError } = await sb
    .from("recurring_expenses")
    .insert({ ...source, name: `${source.name} (copy)`, archived: false })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !copy) return { ok: false, reason: `Could not duplicate: ${insertError?.message ?? "unknown error"}` };

  await logActivity(sb, copy.id, "Duplicated", `From "${source.name}"`);
  revalidatePath(PATH);
  return { ok: true, data: { id: copy.id } };
});

type ScheduleRow = { frequency: string; day_of_month: number | null; day_of_week: string | null; start_date: string | null; skip_next_date: string | null };

/** Shared by skipNextPayment/markBillPaidThisCycle: both just move
 * skip_next_date onto the bill's current next occurrence, which is exactly
 * what nextChargeDate() (lib/data/recurring-expenses.ts) already treats as
 * "not due again until the following one" — no separate paid-through
 * column needed. */
async function advancePastNextOccurrence(
  sb: ReturnType<typeof createServiceRoleClient>,
  id: string,
): Promise<{ ok: true; skippedDate: string } | { ok: false; reason: string }> {
  const { data: row, error: readError } = await sb
    .from("recurring_expenses")
    .select("frequency, day_of_month, day_of_week, start_date, skip_next_date")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<ScheduleRow>();
  if (readError || !row) return { ok: false, reason: `Could not load expense: ${readError?.message ?? "not found"}` };

  const frequency = isFrequency(row.frequency) ? row.frequency : "monthly";
  const upcoming = nextChargeDate(
    { frequency, dayOfMonth: row.day_of_month, dayOfWeek: row.day_of_week, startDate: row.start_date, skipNextDate: row.skip_next_date },
    new Date(),
  );
  if (!upcoming) return { ok: false, reason: "This bill has no upcoming charge." };

  const skipDate = toIsoDate(upcoming);
  const { error } = await sb.from("recurring_expenses").update({ skip_next_date: skipDate }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, skippedDate: skipDate };
}

export const skipNextPayment = mutation(async (id: string): Promise<MutationResult<{ skippedDate: string }>> => {
  const sb = createServiceRoleClient();
  const res = await advancePastNextOccurrence(sb, id);
  if (!res.ok) return { ok: false, reason: `Could not skip payment: ${res.reason}` };

  await logActivity(sb, id, "Skipped next payment", res.skippedDate);
  revalidatePath(PATH);
  return { ok: true, data: { skippedDate: res.skippedDate } };
});

/** Expenses' "Coming up" card swipe-to-pay (Brent's ask, 2026-08-08): marks
 * the bill's current occurrence paid and advances the schedule to the
 * next one, using the exact same skip_next_date mechanism skipNextPayment
 * uses above — no schema migration needed. Only the activity-log wording
 * differs, so the audit trail reads "Marked paid" rather than implying the
 * charge was skipped unpaid. */
export const markBillPaidThisCycle = mutation(async (id: string): Promise<MutationResult<{ paidThroughDate: string }>> => {
  const sb = createServiceRoleClient();
  const res = await advancePastNextOccurrence(sb, id);
  if (!res.ok) return { ok: false, reason: `Could not mark paid: ${res.reason}` };

  await logActivity(sb, id, "Marked paid", res.skippedDate);
  revalidatePath(PATH);
  return { ok: true, data: { paidThroughDate: res.skippedDate } };
});
