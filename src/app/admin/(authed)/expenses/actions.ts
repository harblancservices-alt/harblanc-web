"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import {
  isDayOfWeek,
  isFrequency,
  nextChargeDate,
  toIsoDate,
  type Frequency,
} from "./types";

/**
 * Recurring expenses — a manual log of monthly-ish charges (insurance, truck
 * payment, subscriptions, …). No bank/card connection; every field here is
 * hand-entered and nothing here moves real money.
 */

const PATH = "/admin/expenses";

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

/** A full weekday name ("Sunday".."Saturday"). Null when blank/invalid. */
function dayOfWeekOrNull(raw: string | null): string | null {
  if (!raw) return null;
  return isDayOfWeek(raw) ? raw : null;
}

/** "YYYY-MM-DD" only. Null when blank/malformed. */
function isoDateOrNull(raw: string | null): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/** Comma-separated tag input → trimmed, deduped, non-empty tags. */
function tagsFromInput(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (t) seen.add(t);
  }
  return Array.from(seen);
}

/** Best-effort audit trail insert — never blocks or fails the caller's
 *  mutation, so a logging hiccup can't take down a save/delete. */
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

type ExpenseFields = {
  name: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  frequency: Frequency;
  dayOfMonth: number | null;
  dayOfWeek: string | null;
  startDate: string | null;
  card: string | null;
  autopay: boolean;
  notes: string | null;
  tags: string[];
};

function parseFields(fd: FormData): ExpenseFields {
  const name = str(fd, "name");
  if (!name) throw new Error("Name is required.");
  const amount = moneyOrNull(str(fd, "amount"));
  if (amount == null) throw new Error("Enter a valid amount.");
  const frequencyRaw = str(fd, "frequency") ?? "monthly";
  const frequency = isFrequency(frequencyRaw) ? frequencyRaw : "monthly";
  // Weekly charges pick a weekday; monthly/quarterly/annual pick a
  // day-of-month; one-time picks a start date instead. Never persist an
  // anchor the current cadence doesn't use.
  const isWeekly = frequency === "weekly";
  const isOnetime = frequency === "onetime";
  return {
    name,
    category: str(fd, "category"),
    vendor: str(fd, "vendor"),
    amount,
    frequency,
    dayOfMonth: isWeekly || isOnetime ? null : dayOfMonthOrNull(str(fd, "day_of_month")),
    dayOfWeek: isWeekly ? dayOfWeekOrNull(str(fd, "day_of_week")) : null,
    startDate: isoDateOrNull(str(fd, "start_date")),
    card: str(fd, "card"),
    autopay: bool(fd, "autopay"),
    notes: str(fd, "notes"),
    tags: tagsFromInput(str(fd, "tags")),
  };
}

export async function createExpense(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const f = parseFields(formData);
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("recurring_expenses")
    .insert({
      name: f.name,
      category: f.category,
      vendor: f.vendor,
      amount: f.amount,
      frequency: f.frequency,
      day_of_month: f.dayOfMonth,
      day_of_week: f.dayOfWeek,
      start_date: f.startDate,
      card: f.card,
      autopay: f.autopay,
      notes: f.notes,
      tags: f.tags,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`Could not save expense: ${error?.message ?? "unknown error"}`);
  await logActivity(sb, data.id, "Created", f.vendor ? `Vendor: ${f.vendor}` : null);
  revalidatePath(PATH);
}

export async function updateExpense(id: string, formData: FormData): Promise<void> {
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
      day_of_week: f.dayOfWeek,
      start_date: f.startDate,
      card: f.card,
      autopay: f.autopay,
      notes: f.notes,
      tags: f.tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Could not update expense: ${error.message}`);
  await logActivity(sb, id, "Updated");
  revalidatePath(PATH);
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
  await logActivity(sb, id, "Deleted");
  revalidatePath(PATH);
}

export async function duplicateExpense(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!id) throw new Error("Missing expense.");
  const sb = createServiceRoleClient();
  const { data: source, error: readError } = await sb
    .from("recurring_expenses")
    .select(
      "name, category, vendor, amount, frequency, day_of_month, day_of_week, start_date, card, autopay, notes, tags",
    )
    .eq("id", id)
    .single();
  if (readError || !source) {
    throw new Error(`Could not duplicate expense: ${readError?.message ?? "not found"}`);
  }
  const { data: copy, error: insertError } = await sb
    .from("recurring_expenses")
    .insert({ ...source, name: `${source.name} (copy)` })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !copy) {
    throw new Error(`Could not duplicate expense: ${insertError?.message ?? "unknown error"}`);
  }
  await logActivity(sb, copy.id, "Duplicated", `From "${source.name}"`);
  revalidatePath(PATH);
}

export async function archiveExpense(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!id) throw new Error("Missing expense.");
  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ archived: true }).eq("id", id);
  if (error) throw new Error(`Could not archive expense: ${error.message}`);
  await logActivity(sb, id, "Archived");
  revalidatePath(PATH);
}

export async function restoreExpense(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!id) throw new Error("Missing expense.");
  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ archived: false }).eq("id", id);
  if (error) throw new Error(`Could not restore expense: ${error.message}`);
  await logActivity(sb, id, "Restored");
  revalidatePath(PATH);
}

export async function skipNextPayment(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (!id) throw new Error("Missing expense.");
  const sb = createServiceRoleClient();
  const { data: row, error: readError } = await sb
    .from("recurring_expenses")
    .select("frequency, day_of_month, day_of_week, start_date, skip_next_date")
    .eq("id", id)
    .single<{
      frequency: string;
      day_of_month: number | null;
      day_of_week: string | null;
      start_date: string | null;
      skip_next_date: string | null;
    }>();
  if (readError || !row) throw new Error(`Could not load expense: ${readError?.message ?? "not found"}`);

  const frequency = isFrequency(row.frequency) ? row.frequency : "monthly";
  const upcoming = nextChargeDate(
    {
      frequency,
      dayOfMonth: row.day_of_month,
      dayOfWeek: row.day_of_week,
      startDate: row.start_date,
      skipNextDate: row.skip_next_date,
    },
    new Date(),
  );
  if (!upcoming) {
    throw new Error("This expense has no upcoming charge to skip.");
  }
  const skipDate = toIsoDate(upcoming);
  const { error } = await sb
    .from("recurring_expenses")
    .update({ skip_next_date: skipDate })
    .eq("id", id);
  if (error) throw new Error(`Could not skip payment: ${error.message}`);
  await logActivity(sb, id, "Skipped next payment", skipDate);
  revalidatePath(PATH);
}

export async function getExpenseActivity(
  id: string,
): Promise<{ id: string; action: string; detail: string | null; whenLabel: string }[]> {
  if (!id) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("expense_activity")
    .select("id, action, detail, created_at")
    .eq("expense_id", id)
    .order("created_at", { ascending: false })
    .limit(25)
    .returns<{ id: string; action: string; detail: string | null; created_at: string }[]>();
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail,
    whenLabel: new Date(r.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  }));
}

// ---------------------------------------------------------------------------
// Bulk actions — driven by the table's row-checkbox selection.

export async function bulkDeleteExpenses(ids: string[]): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (ids.length === 0) return;
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("recurring_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(`Could not delete expenses: ${error.message}`);
  await Promise.all(ids.map((id) => logActivity(sb, id, "Deleted", "Bulk action")));
  revalidatePath(PATH);
}

export async function bulkArchiveExpenses(ids: string[]): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (ids.length === 0) return;
  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ archived: true }).in("id", ids);
  if (error) throw new Error(`Could not archive expenses: ${error.message}`);
  await Promise.all(ids.map((id) => logActivity(sb, id, "Archived", "Bulk action")));
  revalidatePath(PATH);
}

export async function bulkChangeCategory(ids: string[], category: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  if (ids.length === 0) return;
  const trimmed = category.trim();
  if (!trimmed) throw new Error("Choose a category.");
  const sb = createServiceRoleClient();
  const { error } = await sb.from("recurring_expenses").update({ category: trimmed }).in("id", ids);
  if (error) throw new Error(`Could not update category: ${error.message}`);
  await Promise.all(ids.map((id) => logActivity(sb, id, "Category changed", trimmed)));
  revalidatePath(PATH);
}

// ---------------------------------------------------------------------------
// CSV import — the toolbar's Import button. Parsing happens client-side
// (FileReader + a small quoted-CSV splitter) so this action just receives
// plain, already-validated rows and inserts them.

export type ImportExpenseRow = {
  vendor: string;
  category: string | null;
  description: string | null;
  amount: number;
  paymentMethod: string | null;
  frequency: string;
  startDate: string | null;
};

export type ImportResult = { ok: true; count: number } | { ok: false; reason: string };

export async function importExpenses(rows: ImportExpenseRow[]): Promise<ImportResult> {
  if (await blockedByDemo()) return { ok: false, reason: "Demo mode — import is disabled." };
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
  }));
  const { data, error } = await sb.from("recurring_expenses").insert(payload).select("id");
  if (error) return { ok: false, reason: `Import failed: ${error.message}` };
  await Promise.all(
    (data ?? []).map((r: { id: string }) => logActivity(sb, r.id, "Created", "Imported from CSV")),
  );
  revalidatePath(PATH);
  return { ok: true, count: data?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// Payment methods (expense_accounts) — nickname + light card metadata used
// to populate the expense form's "Payment Method" dropdown. No card numbers
// stored, ever — last4 only.

export type PaymentMethodResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

function last4OrNull(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits.slice(-4) : null;
}

/** Ungated core — tms-v2 has no demo mode of its own (src/actions/tms-v2/
 * expense-accounts.ts calls this directly), so its writes can never be
 * silently no-op'd by /admin's demo cookie. Admin's own gated export below
 * is unchanged. */
export async function createExpenseAccountLive(formData: FormData): Promise<PaymentMethodResult> {
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Nickname is required." };
  const type = str(formData, "type");
  const last4 = last4OrNull(str(formData, "last4"));
  const isDefault = bool(formData, "is_default");
  const sb = createServiceRoleClient();
  if (isDefault) {
    await sb.from("expense_accounts").update({ is_default: false }).is("deleted_at", null);
  }
  const { data, error } = await sb
    .from("expense_accounts")
    .insert({ name, type, last4, is_default: isDefault })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    return { ok: false, reason: `Could not add payment method: ${error?.message ?? "unknown error"}` };
  }
  revalidatePath(PATH);
  return { ok: true, id: data.id };
}

/** Admin's own gated entry point — unchanged behavior. */
export async function createExpenseAccount(formData: FormData): Promise<PaymentMethodResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — payment method changes are disabled." };
  }
  return createExpenseAccountLive(formData);
}

/** Ungated core — see createExpenseAccountLive's header for why. */
export async function updateExpenseAccountLive(
  id: string,
  formData: FormData,
): Promise<PaymentMethodResult> {
  if (!id) return { ok: false, reason: "Missing payment method." };
  const name = str(formData, "name");
  if (!name) return { ok: false, reason: "Nickname is required." };
  const type = str(formData, "type");
  const last4 = last4OrNull(str(formData, "last4"));
  const isDefault = bool(formData, "is_default");
  const sb = createServiceRoleClient();
  if (isDefault) {
    await sb.from("expense_accounts").update({ is_default: false }).is("deleted_at", null);
  }
  const { error } = await sb
    .from("expense_accounts")
    .update({ name, type, last4, is_default: isDefault })
    .eq("id", id);
  if (error) return { ok: false, reason: `Could not update payment method: ${error.message}` };
  revalidatePath(PATH);
  return { ok: true, id };
}

/** Admin's own gated entry point — unchanged behavior. */
export async function updateExpenseAccount(
  id: string,
  formData: FormData,
): Promise<PaymentMethodResult> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — payment method changes are disabled." };
  }
  return updateExpenseAccountLive(id, formData);
}

/** Ungated core — see createExpenseAccountLive's header for why. */
export async function deleteExpenseAccountLive(id: string): Promise<void> {
  if (!id) throw new Error("Missing payment method.");
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("expense_accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not remove payment method: ${error.message}`);
  revalidatePath(PATH);
}

/** Admin's own gated entry point — unchanged behavior. */
export async function deleteExpenseAccount(id: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  return deleteExpenseAccountLive(id);
}
