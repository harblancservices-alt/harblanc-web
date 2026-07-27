"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type CreateAccountResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Create a company (crm_account) for the caller's org. org_id is set from the
 * authenticated session, and the insert still runs through RLS (WITH CHECK
 * org_id = crm_current_org()), so a row can never be written into another org.
 * Phase-1 stub: captures the essentials; richer fields land in later steps.
 */
export async function createAccount(
  formData: FormData,
): Promise<CreateAccountResult> {
  const user = await requireCrmUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Company name is required." };

  const optional = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v.length ? v : null;
  };

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_accounts").insert({
    org_id: user.orgId,
    name,
    industry: optional("industry"),
    phone: optional("phone"),
    website: optional("website"),
    city: optional("city"),
    state: optional("state"),
    lifecycle_status: optional("lifecycle_status") ?? "lead",
    assigned_user_id: user.id,
  });

  if (error) {
    return { ok: false, error: "Could not save the company. Please try again." };
  }

  revalidatePath("/crm/accounts");
  revalidatePath("/crm");
  return { ok: true };
}
