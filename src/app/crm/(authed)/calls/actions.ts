"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { callOutcomeLabel } from "./outcomes";

/**
 * Call logging. A call is a first-class record in crm_calls AND an append-only
 * crm_activities row (kind=call) so it shows up on the company timeline. Same
 * contract as every CRM write: resolve the caller with requireCrmUser(), run
 * through the RLS-scoped client, and stamp org_id/user_id from the SESSION so a
 * row can never be written into another org.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v.length ? v : null;
}
function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v.length) return null;
  const n = Number.parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function revalidate(accountId: string) {
  revalidatePath("/crm");
  revalidatePath("/crm/tasks");
  revalidatePath(`/crm/accounts/${accountId}`);
}

/**
 * Log a call against a company (optionally tied to a specific contact). Writes
 * the crm_calls row, bumps the contact's last_contacted_at when one was picked,
 * and drops a timeline activity carrying the outcome so the profile feed shows
 * what happened. A follow-up flagged here surfaces in the dashboard call-back
 * queue via crm_calls (followup_required + reminder_at).
 */
export async function logCall(
  accountId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireCrmUser();

  const outcome = optStr(formData, "outcome");
  if (!outcome) return { ok: false, error: "Pick a call outcome." };

  const contactId = optStr(formData, "contact_id");
  const durationMinutes = optInt(formData, "duration_minutes");
  const durationSeconds =
    durationMinutes !== null && durationMinutes >= 0 ? durationMinutes * 60 : null;
  const summary = optStr(formData, "summary");
  const notes = optStr(formData, "notes");
  const followupRequired = str(formData, "followup_required") === "on";
  const reminderAt = followupRequired ? optStr(formData, "reminder_at") : null;

  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_calls").insert({
    org_id: user.orgId,
    account_id: accountId,
    contact_id: contactId,
    user_id: user.id,
    outcome,
    duration_seconds: durationSeconds,
    summary,
    notes,
    followup_required: followupRequired,
    reminder_at: reminderAt,
  });

  if (error) {
    return { ok: false, error: "Could not log the call. Please try again." };
  }

  // Best-effort: record that we spoke to this contact.
  if (contactId) {
    await supabase
      .from("crm_contacts")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", contactId);
  }

  const label = callOutcomeLabel(outcome);
  const durLabel = durationMinutes ? ` · ${durationMinutes}m` : "";
  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    contactId,
    kind: CRM_ACTIVITY.call,
    summary: `Call · ${label}${durLabel}`,
    body: summary,
    meta: {
      outcome,
      duration_seconds: durationSeconds,
      followup_required: followupRequired,
      reminder_at: reminderAt,
    },
  });

  revalidate(accountId);
  return { ok: true };
}

/**
 * Soft-delete a call log entry. Calls are operational (not a shared org-wide
 * record), so this is allowed for any CRM user — no role gate, matching
 * task/note deletes. The append-only crm_activities entry for the call is
 * left untouched (it's a historical record of the timeline, not the log
 * itself), matching how deleteContact leaves the activity feed alone.
 */
export async function deleteCall(
  callId: string,
  accountId: string,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_calls")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", callId);

  if (error) return { ok: false, error: "Could not delete the call." };

  revalidate(accountId);
  return { ok: true };
}
