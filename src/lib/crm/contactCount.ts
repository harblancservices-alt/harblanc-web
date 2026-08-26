import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "How many people do we know at this company" — one rollup, one meaning.
 *
 * It counts live rows in crm_contacts, so a soft-deleted contact does not keep
 * a company looking staffed. That `.is("deleted_at", null)` is the whole point:
 * the number drives the "no contact on file" completeness gap, and a company
 * whose only contact was deleted must read as a gap, not as covered.
 *
 * WHY THIS FILE EXISTS. Five readers — the Companies list, Active Customers,
 * the agent dashboard, the task planner and the AI agent queue — each carried
 * their own copy of the same query and the same reduce. Two shapes are offered
 * because two of those readers already have the contact rows in hand for other
 * reasons (Active Customers builds its task-contact picker from them) and
 * should not pay for a second query just to share the counting.
 */

/** The count, from rows you already fetched. Pure — no DB. */
export function countContactRows(
  rows: { account_id: string | null }[] | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows ?? []) {
    const id = row.account_id;
    if (!id) continue;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/**
 * The count, fetched. ONE grouped query for the whole set rather than a query
 * per company. Companies with nobody on file are absent from the map; callers
 * read that as zero.
 */
export async function contactCountByAccount(
  supabase: SupabaseClient,
  accountIds: string[],
): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map();
  const { data } = await supabase
    .from("crm_contacts")
    .select("account_id")
    .in("account_id", accountIds)
    .is("deleted_at", null);
  return countContactRows(data as { account_id: string | null }[] | null);
}
