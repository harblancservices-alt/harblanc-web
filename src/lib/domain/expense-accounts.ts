import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Expense payment methods (expense_accounts) — nickname/type/last-4/default
 * only, never a full card number. Shared by both /admin and /tms-v2, each of
 * which adds only its own app-specific behavior on top (demo-mode gate and
 * revalidatePath target for /admin; MutationResult conversion and its own
 * revalidatePath targets for /tms-v2) — see the two wrapper files:
 * src/app/admin/(authed)/expenses/actions.ts and
 * src/actions/tms-v2/expense-accounts.ts.
 *
 * No company/user scoping or per-caller authorization here by design — this
 * is a single-tenant domain (no org column on expense_accounts, same as
 * `loads`/`brokers`/etc.), and every caller is already behind the shared
 * admin session gate (src/middleware.ts) before it can reach a Server
 * Action that calls these.
 *
 * "Only one default" is enforced here exactly as it always was: clear
 * `is_default` on every non-deleted row first, then write the target row's
 * own fields (including its own is_default value) second — so a row being
 * set as the new default is never the one that gets cleared, and a row
 * being unset simply keeps its own is_default: false from the second write.
 * There is no unique partial index backing this invariant at the DB layer
 * (a pre-existing race-condition risk, unchanged by this extraction, not
 * introduced by it).
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

function last4OrNull(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits.slice(-4) : null;
}

export type PaymentMethodResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

export async function createExpenseAccount(formData: FormData): Promise<PaymentMethodResult> {
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
  return { ok: true, id: data.id };
}

export async function updateExpenseAccount(
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
  return { ok: true, id };
}

export async function deleteExpenseAccount(id: string): Promise<void> {
  if (!id) throw new Error("Missing payment method.");
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("expense_accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not remove payment method: ${error.message}`);
}
