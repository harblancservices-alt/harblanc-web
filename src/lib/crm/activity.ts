import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The CRM activity timeline is APPEND-ONLY. Every meaningful change to a
 * company (created, stage moved, note added, contact added/edited) drops one
 * immutable crm_activities row here, so the profile's feed is a faithful,
 * never-pruned history. Writes go through the caller's RLS-scoped CRM client,
 * and org_id/user_id are always set from the authenticated session — a row can
 * never be logged into another org.
 *
 * Logging is best-effort: a failed activity write must never fail the parent
 * mutation (the company/contact/note that succeeded should stand), so the
 * error is swallowed here and the caller continues.
 */
export const CRM_ACTIVITY = {
  accountCreated: "account_created",
  lifecycleChanged: "lifecycle_changed",
  repChanged: "rep_changed",
  noteAdded: "note_added",
  contactAdded: "contact_added",
  contactUpdated: "contact_updated",
  call: "call",
  taskCreated: "task_created",
  taskCompleted: "task_completed",
  dealCreated: "deal_created",
  dealStageChanged: "deal_stage_changed",
  aiLeadReleased: "ai_lead_released",
  aiLeadDiscarded: "ai_lead_discarded",
  aiLeadClaimed: "ai_lead_claimed",
  aiResearchRequested: "ai_research_requested",
  aiSuggestionsGenerated: "ai_suggestions_generated",
  aiSuggestionConfirmed: "ai_suggestion_confirmed",
  aiSuggestionDismissed: "ai_suggestion_dismissed",
  detailsUpdated: "details_updated",
  locationAdded: "location_added",
  locationUpdated: "location_updated",
  locationDeleted: "location_deleted",
  accountDeleted: "account_deleted",
  contactDeleted: "contact_deleted",
  dealDeleted: "deal_deleted",
} as const;

export type CrmActivityKind =
  (typeof CRM_ACTIVITY)[keyof typeof CRM_ACTIVITY];

/**
 * Activity kinds that represent genuine human contact with a company — the
 * source of truth for "last contact" (Companies list, stale-account sort).
 * Matches the CRM's original intent for that computation (a note, a stage
 * move, or a new contact with no call should still count as contact — a call
 * already lands here too via kind=call) while excluding every system/
 * automated kind: AI research/suggestions, AI lead lifecycle, record
 * creation/deletion, rep reassignment, task/deal/location/detail changes.
 * None of those mean a human actually talked to the company, so a company
 * whose only recent crm_activities row is e.g. an AI-research run must not
 * read as recently contacted. Any new automated kind added later should NOT
 * be added here unless it truly represents a rep reaching the company.
 */
export const CRM_CONTACT_ACTIVITY_KINDS: CrmActivityKind[] = [
  CRM_ACTIVITY.call,
  CRM_ACTIVITY.noteAdded,
  CRM_ACTIVITY.contactAdded,
  CRM_ACTIVITY.lifecycleChanged,
];

export async function logActivity(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    userId: string;
    kind: CrmActivityKind;
    summary: string;
    accountId?: string | null;
    contactId?: string | null;
    dealId?: string | null;
    body?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("crm_activities").insert({
      org_id: input.orgId,
      user_id: input.userId,
      account_id: input.accountId ?? null,
      contact_id: input.contactId ?? null,
      deal_id: input.dealId ?? null,
      kind: input.kind,
      summary: input.summary,
      body: input.body ?? null,
      meta: input.meta ?? {},
    });
  } catch {
    // Never let a timeline write break the mutation that triggered it.
  }
}
