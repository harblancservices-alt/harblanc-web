"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { DETAILS_FIELD_BY_KEY, parseFieldValue } from "./details-fields";

/**
 * Confirm / edit-then-confirm / dismiss a pending crm_ai_suggestions row —
 * the ONLY code paths that ever write an AI-sourced value into a live
 * crm_accounts Details field. Any sales rep may act on a suggestion (no
 * role gate) — see the module docstring on ai-field-mapper.ts for how a
 * suggestion gets created in the first place.
 *
 * A suggestion's field_key is checked against DETAILS_FIELD_BY_KEY before
 * anything is written — a row whose field_key isn't in the registry (never
 * produced by ai-field-mapper.ts, but a suggestion table is untrusted input
 * once it exists as a row) is refused rather than blindly spread into an
 * update({ [key]: value }) call.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

type SuggestionRow = {
  id: string;
  account_id: string;
  field_key: string;
  suggested_value: unknown;
  status: string;
  source: string | null;
};

async function loadPendingSuggestion(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  suggestionId: string,
): Promise<{ ok: true; row: SuggestionRow } | { ok: false; error: string }> {
  const { data } = await supabase
    .from("crm_ai_suggestions")
    .select("id, account_id, field_key, suggested_value, status, source")
    .eq("id", suggestionId)
    .maybeSingle();

  const row = data as SuggestionRow | null;
  if (!row) return { ok: false, error: "Suggestion not found." };
  if (row.status !== "pending") return { ok: false, error: "That suggestion was already resolved." };
  return { ok: true, row };
}

/** Shared write path for confirm and edit-then-confirm. */
async function applyConfirm(
  suggestionId: string,
  valueOverride: unknown | undefined,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const loaded = await loadPendingSuggestion(supabase, suggestionId);
  if (!loaded.ok) return loaded;
  const { row } = loaded;

  const def = DETAILS_FIELD_BY_KEY.get(row.field_key);
  if (!def) return { ok: false, error: "Unrecognized suggestion field." };

  const value = valueOverride !== undefined ? valueOverride : row.suggested_value;

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("ai_confirmed_fields")
    .eq("id", row.account_id)
    .maybeSingle();
  const priorMarks = (account?.ai_confirmed_fields as Record<string, unknown> | null) ?? {};

  const { error: accountErr } = await supabase
    .from("crm_accounts")
    .update({
      [def.column]: value,
      ai_confirmed_fields: {
        ...priorMarks,
        [def.key]: { at: new Date().toISOString(), source: row.source ?? "ai_research" },
      },
    })
    .eq("id", row.account_id);
  if (accountErr) return { ok: false, error: "Could not save the confirmed value." };

  await supabase
    .from("crm_ai_suggestions")
    .update({
      status: "confirmed",
      suggested_value: value,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", suggestionId);

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: row.account_id,
    kind: CRM_ACTIVITY.aiSuggestionConfirmed,
    summary: `AI suggestion confirmed: ${def.label}`,
  });

  revalidatePath(`/crm/accounts/${row.account_id}`);
  return { ok: true };
}

/** Accept the AI-suggested value exactly as proposed. */
export async function confirmSuggestion(suggestionId: string): Promise<ActionResult> {
  return applyConfirm(suggestionId, undefined);
}

/** Accept a rep-edited value instead of the raw suggestion (the "Edit" path —
 * editedText is the generic plain-text encoding from details-fields.ts's
 * formatFieldValue/parseFieldValue round-trip). */
export async function editAndConfirmSuggestion(
  suggestionId: string,
  editedText: string,
): Promise<ActionResult> {
  const supabase = await createCrmServerClient();
  const loaded = await loadPendingSuggestion(supabase, suggestionId);
  if (!loaded.ok) return loaded;

  const def = DETAILS_FIELD_BY_KEY.get(loaded.row.field_key);
  if (!def) return { ok: false, error: "Unrecognized suggestion field." };

  return applyConfirm(suggestionId, parseFieldValue(def, editedText));
}

/** Discard a suggestion without writing anything to crm_accounts. */
export async function dismissSuggestion(suggestionId: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const loaded = await loadPendingSuggestion(supabase, suggestionId);
  if (!loaded.ok) return loaded;
  const { row } = loaded;
  const def = DETAILS_FIELD_BY_KEY.get(row.field_key);

  const { error } = await supabase
    .from("crm_ai_suggestions")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq("id", suggestionId);
  if (error) return { ok: false, error: "Could not dismiss the suggestion." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: row.account_id,
    kind: CRM_ACTIVITY.aiSuggestionDismissed,
    summary: `AI suggestion dismissed: ${def?.label ?? row.field_key}`,
  });

  revalidatePath(`/crm/accounts/${row.account_id}`);
  return { ok: true };
}
