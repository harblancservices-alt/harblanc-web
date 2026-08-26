"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { DEFAULT_LIFECYCLE } from "../accounts/lifecycle";
import { titleCaseWords, upperCaseState } from "../_shell/format";

/**
 * "Add a company to the pool" — the intake that used to be OTR.
 *
 * WHAT CHANGED ON 2026-08-26. This was addOtrEntry(), which wrote a row to
 * crm_otr_entries where it sat at status='new' until an admin worked it
 * through research → ready → released and a company was finally created.
 * Brent's rule retired that whole machine: the review is not a stage before
 * assignment, deciding WHO to assign it to IS the review, and research
 * happens after the work reaches the agent. So there is no queue to sit in —
 * the company exists immediately and lands in Admin → Overview's pool with no
 * owner.
 *
 * This is deliberately the SAME END STATE releaseOtrEntry() used to build,
 * re-timed rather than rewritten: an unassigned crm_accounts row with
 * source='otr', ai_status='released' and lifecycle_status='new_lead'. Those
 * three columns are what put it in the pool, and none of them is new.
 *
 * NO RESEARCH TASK IS CREATED HERE. It is created when the company is
 * ASSIGNED — assignmentTaskSpec() already returns "Research and qualify this
 * company" for a source='otr' row, so both assign paths produce it without
 * anything extra. Creating one at intake would put a task in nobody's queue.
 *
 * NO lifecycle_changed ACTIVITY either. That kind is in
 * CRM_CONTACT_ACTIVITY_KINDS, so logging it would make a company nobody has
 * spoken to read as "last contacted today" on the hot/cold scale. The company
 * is born at new_lead, so there is no stage change to record in any case.
 * account_created is not a contact kind, which is why it is safe.
 *
 * Admin-only, independently re-verified — never trusts the page gate alone,
 * same pattern as every other crm/admin/**\/actions.ts file.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addCompanyToPool(formData: FormData): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Only an admin can add a company to the pool." };

  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { ok: false, error: "Company name is required." };

  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const supabase = await createCrmServerClient();

  const { data: account, error } = await supabase
    .from("crm_accounts")
    .insert({
      org_id: user.orgId,
      name: titleCaseWords(companyName),
      city: city ? titleCaseWords(city) : null,
      state: state ? upperCaseState(state) : null,
      industry: industry || null,
      context_notes: notes || null,
      source: "otr",
      lifecycle_status: DEFAULT_LIFECYCLE,
      ai_status: "released",
      assigned_user_id: null,
    })
    .select("id")
    .single();

  if (error || !account) return { ok: false, error: "Could not add the company. Please try again." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: account.id as string,
    kind: CRM_ACTIVITY.accountCreated,
    summary: "Company added to the assignment pool",
  });

  revalidatePath("/crm/admin");
  revalidatePath("/crm/accounts");
  return { ok: true };
}
