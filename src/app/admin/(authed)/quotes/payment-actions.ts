"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { blockedByDemo } from "@/lib/admin/demo";
import {
  recordPayment as recordPaymentShared,
  softDeletePayment as softDeletePaymentShared,
} from "@/lib/domain/revenue-payment";

/**
 * Phase P1B — manual admin payment recording server actions.
 *
 * Core logic lives in @/lib/domain/revenue-payment.ts, shared with
 * /tms-v2's pipeline.ts (decoupling plan Phase 8). This file only adds
 * the demo-mode gate, admin auth (and the authenticated user id the
 * shared core needs to stamp payments.recorded_by), and admin's
 * revalidatePath targets.
 *
 * Workflow gate:
 *   - sendFinalizedQuote (finalized-quote-actions.ts) auto-advances
 *     booked → awaiting_payment.
 *   - recordPayment auto-advances awaiting_payment → ready_to_dispatch
 *     iff the new total paid reaches the FQ's total_amount AND the
 *     event hasn't already fired for this FQ.
 */

export async function recordPayment(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const user = await requireAdmin();
  await recordPaymentShared(formData, user.id);

  const quoteRequestId = String(formData.get("quote_request_id") ?? "");
  if (quoteRequestId) revalidatePath(`/admin/quotes/${quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}

export async function softDeletePayment(paymentId: string): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  await requireAdmin();
  const result = await softDeletePaymentShared(paymentId);
  if (!result) return; // Already deleted — idempotent no-op, no revalidate.

  revalidatePath(`/admin/quotes/${result.quoteRequestId}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
}
