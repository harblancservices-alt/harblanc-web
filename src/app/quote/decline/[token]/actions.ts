"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";
import { resolveByToken } from "@/lib/quote-token/lookup";

export type DeclineResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function declineEstimate(
  token: string,
  formData: FormData,
): Promise<DeclineResult> {
  const resolved = await resolveByToken(token);
  if (!resolved.ok) {
    return { ok: false, reason: "This quote link isn't valid anymore." };
  }
  const { estimate, lead } = resolved;
  if (estimate.acceptedAt) {
    return {
      ok: false,
      reason: "This quote was already accepted. Reply to dispatch if you need to back out.",
    };
  }

  const reasonRaw = formData.get("reason");
  const reason =
    typeof reasonRaw === "string" ? reasonRaw.trim().slice(0, 4000) : "";
  const declinedReason = reason.length > 0 ? reason : null;

  const sb = createServiceRoleClient();
  const now = new Date().toISOString();

  // Stamp declined_at only the first time. Resubmits (e.g. the customer
  // clicks Submit again to update the reason) update the reason field
  // but leave the timestamp at the first decline.
  const updatePayload: Record<string, unknown> = { declined_reason: declinedReason };
  if (!estimate.declinedAt) {
    updatePayload.declined_at = now;
  }
  const { error } = await sb
    .from("dispatch_estimates")
    .update(updatePayload)
    .eq("id", estimate.id);
  if (error) return { ok: false, reason: error.message };

  if (!estimate.declinedAt) {
    await logDispatchEvent(sb, lead.id, "estimate_declined", {
      estimateId: estimate.id,
      reason: declinedReason,
    });
  }

  revalidatePath(`/admin/quotes/${lead.id}`);
  revalidatePath("/admin/quotes");
  revalidatePath(`/tms-v2/operations/${lead.id}`);
  revalidatePath("/tms-v2/operations");
  revalidatePath(`/quote/decline/${token}`);
  return { ok: true };
}
