"use server";

import { revalidatePath } from "next/cache";
import {
  createExpenseAccount as createExpenseAccountShared,
  updateExpenseAccount as updateExpenseAccountShared,
  deleteExpenseAccount as deleteExpenseAccountShared,
  type PaymentMethodResult,
} from "@/lib/domain/expense-accounts";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Expense payment-method (expense_accounts) writes for /tms-v2 — thin
 * wrappers around the neutral create/update/delete core
 * (src/lib/domain/expense-accounts.ts), shared with /admin's own wrapper
 * (src/app/admin/(authed)/expenses/actions.ts). /tms-v2 has no demo mode of
 * its own, so unlike admin's wrapper this one calls the shared core
 * directly with no demo gate. deleteExpenseAccount is the one shared-core
 * exception (throws instead of returning a result) — converted to
 * MutationResult here via try/catch, same as any other exception boundary.
 */

function revalidateAccountPaths() {
  revalidatePath("/tms-v2/settings");
  revalidatePath("/tms-v2/expenses");
}

export async function createExpenseAccount(formData: FormData): Promise<PaymentMethodResult> {
  const res = await createExpenseAccountShared(formData);
  if (res.ok) revalidateAccountPaths();
  return res;
}

export async function updateExpenseAccount(id: string, formData: FormData): Promise<PaymentMethodResult> {
  const res = await updateExpenseAccountShared(id, formData);
  if (res.ok) revalidateAccountPaths();
  return res;
}

export async function deleteExpenseAccount(id: string): Promise<MutationResult> {
  try {
    await deleteExpenseAccountShared(id);
    revalidateAccountPaths();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not remove payment method." };
  }
}
