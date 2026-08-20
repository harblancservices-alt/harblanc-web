"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { normalizeStage, DEFAULT_LIFECYCLE } from "../../accounts/lifecycle";
import { titleCaseWords, upperCaseState } from "../../_shell/format";

/**
 * OTR (/crm/admin/otr) — the document-less prospect-intake funnel's real
 * backend, mirroring crm-design's admin/otr feature (see
 * CRM_MIGRATION_MATRIX.md §3 and the seed migration's header comment for
 * full context). Every write here is admin-only, independently re-verified
 * (never trusts the page gate alone) — same pattern as every other
 * crm/admin/**\/actions.ts file.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };
export type OtrStatus = "new" | "researching" | "ready_for_approval" | "released" | "rejected";

async function requireAdminUser() {
  const user = await requireCrmUser();
  if (user.role !== "owner") throw new Error("Only an admin can manage OTR entries.");
  return user;
}

function revalidateOtr() {
  revalidatePath("/crm/admin/otr");
  revalidatePath("/crm/admin");
}

export async function addOtrEntry(formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { ok: false, error: "Company name is required." };
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_otr_entries").insert({
    org_id: user.orgId,
    company_name: titleCaseWords(companyName),
    city: city ? titleCaseWords(city) : null,
    state: state ? upperCaseState(state) : null,
    industry: industry || null,
    notes: notes || null,
    status: "new",
    requested_by_user_id: user.id,
  });

  if (error) return { ok: false, error: "Could not save the OTR entry. Please try again." };

  revalidateOtr();
  return { ok: true };
}

export async function saveOtrNotes(id: string, notes: string, salesRelevance: "high" | "medium" | "low" | null): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_otr_entries")
    .update({ notes: notes || null, sales_relevance: salesRelevance })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not save notes." };
  revalidateOtr();
  return { ok: true };
}

export async function setOtrStatus(id: string, status: Exclude<OtrStatus, "released">): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_otr_entries").update({ status }).eq("id", id);

  if (error) return { ok: false, error: "Could not update status." };
  revalidateOtr();
  return { ok: true };
}

/**
 * The only path that creates a real crm_accounts row from an OTR entry —
 * mirrors accounts/actions.ts's createAccount() exactly (org_id from the
 * session, default 'lead' stage, logs one crm_activities row), then marks the
 * entry released so it can never be released twice.
 */
export async function releaseOtrEntry(id: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { data: entry, error: fetchError } = await supabase
    .from("crm_otr_entries")
    .select("id, company_name, city, state, industry, notes, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !entry) return { ok: false, error: "OTR entry not found." };
  if (entry.status === "released") return { ok: false, error: "This entry has already been released." };

  const { data: account, error: insertError } = await supabase
    .from("crm_accounts")
    .insert({
      org_id: user.orgId,
      name: entry.company_name,
      city: entry.city,
      state: entry.state,
      industry: entry.industry,
      context_notes: entry.notes,
      source: "otr",
      lifecycle_status: normalizeStage(DEFAULT_LIFECYCLE),
      assigned_user_id: user.id,
    })
    .select("id")
    .single();

  if (insertError || !account) return { ok: false, error: "Could not create the company from this entry." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: account.id as string,
    kind: CRM_ACTIVITY.accountCreated,
    summary: "Company released from OTR intake",
  });

  const { error: updateError } = await supabase
    .from("crm_otr_entries")
    .update({
      status: "released",
      released_account_id: account.id,
      released_at: new Date().toISOString(),
      released_by_user_id: user.id,
    })
    .eq("id", id);

  if (updateError) return { ok: false, error: "Company was created, but the OTR entry could not be marked released." };

  revalidateOtr();
  revalidatePath("/crm/accounts");
  return { ok: true };
}
