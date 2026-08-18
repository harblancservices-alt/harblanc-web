"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { resolveByConfirmationToken } from "@/lib/quote-token/lookup";

/**
 * Server action for the customer-facing /quote/confirm/[token] page.
 *
 * No admin auth — the confirmation_token IS the authorization signal.
 * resolveByConfirmationToken gates the call. Idempotent: re-clicking a
 * confirmed token returns ok without double-stamping confirmed_at or
 * logging a duplicate event.
 *
 * Lead status is intentionally NOT advanced here. The finalized_quotes
 * row's confirmed_at timestamp is the source of truth for "customer
 * confirmed the rate." The existing lead_status pipeline already has
 * the customer in awaiting_payment (set by sendFinalizedQuote), and
 * the next transition to ready_to_dispatch is owned by
 * payment-actions.ts::recordPayment. Inserting a new status here would
 * require a CHECK-constraint migration and admin pill updates — out
 * of scope for the smallest safe path. See Phase 2B report for the
 * trade-off.
 */

export type ConfirmResult =
  | { ok: true; alreadyConfirmed: boolean }
  | { ok: false; reason: string };

export async function confirmFinalizedQuote(
  token: string,
): Promise<ConfirmResult> {
  const resolved = await resolveByConfirmationToken(token);
  if (!resolved.ok) {
    if (resolved.reason === "not_sent") {
      return {
        ok: false,
        reason: "This rate confirmation isn't active yet.",
      };
    }
    return { ok: false, reason: "This confirmation link isn't valid anymore." };
  }

  const { finalizedQuote, lead } = resolved;

  // Idempotent re-click — return success without re-stamping.
  if (finalizedQuote.confirmedAt) {
    return { ok: true, alreadyConfirmed: true };
  }

  const sb = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await sb
    .from("finalized_quotes")
    .update({ confirmed_at: nowIso })
    .eq("id", finalizedQuote.id)
    .is("confirmed_at", null); // belt-and-suspenders idempotency at the SQL layer
  if (updateErr) {
    console.error("[confirmFinalizedQuote] stamp failed", {
      finalizedQuoteId: finalizedQuote.id,
      message: updateErr.message,
    });
    return {
      ok: false,
      reason: "Could not record the confirmation. Try again or contact dispatch.",
    };
  }

  await logDispatchEvent(
    sb,
    lead.id,
    "finalized_quote_confirmed",
    {
      finalizedQuoteId: finalizedQuote.id,
      finalizedQuoteNumber: finalizedQuote.finalizedQuoteNumber,
      confirmedAt: nowIso,
    },
  );

  // Revalidate both admin's and tms-v2's workspace views so either
  // operator picks up the new confirmed state on their next nav. The
  // customer route revalidates so the same token URL renders the success
  // state.
  revalidatePath(`/admin/quotes/${lead.id}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
  revalidatePath(`/tms-v2/operations/${lead.id}`);
  revalidatePath("/tms-v2/operations");
  revalidatePath("/tms-v2");
  revalidatePath(`/quote/confirm/${token}`);

  return { ok: true, alreadyConfirmed: false };
}
