"use server";

import { revalidatePath } from "next/cache";
import {
  createExpenseAccountLive as legacyCreateExpenseAccount,
  updateExpenseAccountLive as legacyUpdateExpenseAccount,
  deleteExpenseAccountLive as legacyDeleteExpenseAccount,
  type PaymentMethodResult,
} from "@/app/admin/(authed)/expenses/actions";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Expense payment-method (expense_accounts) writes for /tms-v2 — thin
 * wrappers around V1's create/update/delete actions (documents.ts/
 * camera.ts's reuse pattern). Calls the `*Live` variants (ungated core, no
 * `blockedByDemo()` check) — /tms-v2 has no demo mode of its own, so its
 * writes must never be silently no-op'd by admin's demo cookie.
 * deleteExpenseAccount is the one legacy exception (throws instead of
 * returning a result) — converted to MutationResult here via try/catch,
 * same as any other exception boundary.
 */

export type { PaymentMethodResult };

function revalidateAccountPaths() {
  revalidatePath("/tms-v2/settings");
  revalidatePath("/tms-v2/expenses");
}

export async function createExpenseAccount(formData: FormData): Promise<PaymentMethodResult> {
  const res = await legacyCreateExpenseAccount(formData);
  if (res.ok) revalidateAccountPaths();
  return res;
}

export async function updateExpenseAccount(id: string, formData: FormData): Promise<PaymentMethodResult> {
  const res = await legacyUpdateExpenseAccount(id, formData);
  if (res.ok) revalidateAccountPaths();
  return res;
}

export async function deleteExpenseAccount(id: string): Promise<MutationResult> {
  try {
    await legacyDeleteExpenseAccount(id);
    revalidateAccountPaths();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not remove payment method." };
  }
}
