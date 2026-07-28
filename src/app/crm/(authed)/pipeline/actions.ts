"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";

/**
 * Deal writes. Same contract as every CRM mutation: resolve the caller with
 * requireCrmUser(), run through the RLS-scoped client, stamp org_id (and the
 * default owner) from the SESSION — never from client input — and log an
 * append-only activity for the events the pipeline timeline cares about.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateDealResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}
function optNum(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v.length) return null;
  const n = Number.parseFloat(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function dealFieldsFromForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    account_id: optStr(fd, "account_id"),
    pipeline_id: optStr(fd, "pipeline_id"),
    stage_id: optStr(fd, "stage_id"),
    estimated_revenue: optNum(fd, "estimated_revenue"),
    expected_close_date: optStr(fd, "expected_close_date"),
    assigned_user_id: optStr(fd, "assigned_user_id"),
  };
}

function revalidateDeal(accountId?: string | null) {
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm");
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

/**
 * Create a deal on a company and drop it into a stage. org_id + default owner
 * come from the session; RLS WITH CHECK enforces org. Logs the first pipeline
 * timeline entry for the deal.
 */
export async function createDeal(
  formData: FormData,
): Promise<CreateDealResult> {
  const user = await requireCrmUser();

  const fields = dealFieldsFromForm(formData);
  if (!fields.name) return { ok: false, error: "Deal name is required." };
  if (!fields.account_id) return { ok: false, error: "Select a company." };

  const supabase = await createCrmServerClient();
  const { data, error } = await supabase
    .from("crm_deals")
    .insert({
      org_id: user.orgId,
      account_id: fields.account_id,
      name: fields.name,
      pipeline_id: fields.pipeline_id,
      stage_id: fields.stage_id,
      estimated_revenue: fields.estimated_revenue,
      expected_close_date: fields.expected_close_date,
      assigned_user_id: fields.assigned_user_id ?? user.id,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not save the deal. Please try again." };
  }

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: fields.account_id,
    dealId: data.id as string,
    kind: CRM_ACTIVITY.dealCreated,
    summary: `Deal created: ${fields.name}`,
  });

  revalidateDeal(fields.account_id);
  return { ok: true, id: data.id as string };
}

/**
 * Move a deal to a different pipeline stage (the board's "move to" control)
 * and log the transition, matching the account lifecycle-change pattern.
 */
export async function moveDealStage(
  dealId: string,
  stageId: string,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_deals")
    .select("stage_id, account_id, name")
    .eq("id", dealId)
    .maybeSingle();

  if (!prior) return { ok: false, error: "Deal not found." };

  const priorStageId = (prior.stage_id as string | null) ?? null;
  if (priorStageId === stageId) return { ok: true };

  const { error } = await supabase
    .from("crm_deals")
    .update({ stage_id: stageId })
    .eq("id", dealId);

  if (error) {
    return { ok: false, error: "Could not move the deal. Please try again." };
  }

  const [{ data: nextStage }, { data: priorStage }] = await Promise.all([
    supabase.from("crm_pipeline_stages").select("name").eq("id", stageId).maybeSingle(),
    priorStageId
      ? supabase
          .from("crm_pipeline_stages")
          .select("name")
          .eq("id", priorStageId)
          .maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);

  const fromLabel = (priorStage?.name as string) || "No stage";
  const toLabel = (nextStage?.name as string) || "No stage";
  const dealName = (prior.name as string) || "Deal";
  const accountId = (prior.account_id as string | null) ?? null;

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    dealId,
    kind: CRM_ACTIVITY.dealStageChanged,
    summary: `${dealName} moved: ${fromLabel} → ${toLabel}`,
    meta: { from: priorStageId, to: stageId },
  });

  revalidateDeal(accountId);
  return { ok: true };
}

/**
 * Soft-delete a deal (set deleted_at). Admin-only (role=owner) — a deal is a
 * shared record, same defense-in-depth reasoning as accounts/actions.ts's
 * deleteAccount/deleteContact. RLS only scopes crm_deals to the org, not by
 * role, so this app-layer check is the enforcement point.
 */
export async function deleteDeal(
  dealId: string,
  accountId: string | null,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can delete a deal." };
  }

  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_deals")
    .select("name")
    .eq("id", dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Deal not found." };

  const { error } = await supabase
    .from("crm_deals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", dealId);

  if (error) return { ok: false, error: "Could not delete the deal." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    dealId,
    kind: CRM_ACTIVITY.dealDeleted,
    summary: `Deal deleted: ${prior.name as string}`,
  });

  revalidateDeal(accountId);
  return { ok: true };
}
