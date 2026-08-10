"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Dismiss an account from the dashboard's Needs-attention list for 5 days —
 * stamps attention_dismissed_at, which the dashboard query
 * (src/app/crm/(authed)/page.tsx) excludes for 5 days from now. Doesn't log
 * a contact or otherwise touch staleness — if the account is still quiet
 * after 5 days it resurfaces on its own.
 */
export async function dismissAttention(accountId: string): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_accounts")
    .update({ attention_dismissed_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) return { ok: false, error: "Could not dismiss." };

  revalidatePath("/crm");
  return { ok: true };
}
