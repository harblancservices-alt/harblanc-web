import { createCrmServerClient } from "@/lib/crm/auth";

/**
 * Data layer for the confirm-to-fill flow — reads over crm_ai_suggestions.
 * Writes (confirm/edit/dismiss/generate) live in ai-suggestions-actions.ts
 * and ai-field-mapper.ts; this module is read-only and safe to import from a
 * server component (AiSuggestionsPanel.tsx).
 */

export type AiSuggestionStatus = "pending" | "confirmed" | "dismissed";

export type AiSuggestion = {
  id: string;
  accountId: string;
  fieldKey: string;
  suggestedValue: unknown;
  status: AiSuggestionStatus;
  source: string | null;
  createdAt: string;
};

type SuggestionRow = {
  id: string;
  account_id: string;
  field_key: string;
  suggested_value: unknown;
  status: string;
  source: string | null;
  created_at: string;
};

function mapRow(row: SuggestionRow): AiSuggestion {
  return {
    id: row.id,
    accountId: row.account_id,
    fieldKey: row.field_key,
    suggestedValue: row.suggested_value,
    status: (row.status as AiSuggestionStatus) ?? "pending",
    source: row.source,
    createdAt: row.created_at,
  };
}

/** Every still-pending suggestion for this account, newest first. */
export async function fetchPendingSuggestions(accountId: string): Promise<AiSuggestion[]> {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_ai_suggestions")
    .select("id, account_id, field_key, suggested_value, status, source, created_at")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return ((data ?? []) as SuggestionRow[]).map(mapRow);
}
