/**
 * The single definition of "unclaimed prospect", shared by every surface that
 * has to agree about it:
 *
 *   ai_status = 'released'  AND  assigned_user_id IS NULL
 *
 * That is the whole gate. `source` is deliberately NOT part of it — it is
 * pure provenance ("where did this company come from"), never control flow.
 *
 * WHY (2026-08-25): the gate used to also require source ∈ a fixed list
 * (ai_agent, field_capture, bol, otr). promoteAccountToProspect (../accounts/
 * actions.ts) only stamps `source` when the account has none yet — a real
 * existing source is never clobbered — so releasing a company that already
 * carried some other source produced a row that was released and unclaimed
 * but matched no list entry. Such a row was invisible in the claim queue
 * (nobody could ever claim it) while still showing in the Companies list:
 * the exact opposite of both intended behaviours, at once. Reachable today
 * via BOL Center's addToProspects() on any company created inline from a call
 * log or the Add-Contact dialog, both of which insert source='manual'.
 *
 * The enumeration was also unreliable in practice: production `source` values
 * include free-typed strings like "Cold Call" and a person's name, because
 * the column is plain nullable text with no constraint. Anything keyed on it
 * was always going to drift.
 *
 * Consumers that must stay in lockstep with this file:
 *   - ./page.tsx                    the claim queue itself
 *   - ./actions.ts                  claimAiLead's update guard
 *   - ../layout.tsx                 the nav's unclaimed badge count
 *   - ../page.tsx                   isClaimableNewLead (dashboard Claim pill)
 *   - ../accounts/page.tsx          the Companies list (via the helper below)
 */

/**
 * The COMPLEMENT of the gate, as a PostgREST `or=` filter: keep a row unless
 * it is a released, still-unclaimed prospect. Claiming a company is what
 * makes it appear in the Companies roster; until then it lives only in the
 * claim queue.
 *
 * Written as a NEGATED OR rather than `.not()` calls because PostgREST ANDs
 * top-level filters, and we need NOT(ai_status='released' AND
 * assigned_user_id IS NULL), which is
 *   ai_status IS NULL  OR  ai_status <> 'released'  OR  assigned_user_id IS NOT NULL.
 *
 * `ai_status.is.null` is REQUIRED, not redundant with `ai_status.neq.released`:
 * in SQL `column <> value` evaluates to NULL (not true) for a NULL column, so
 * without it every ordinary company that has never been through the queue
 * (ai_status NULL — the majority) would be silently hidden.
 */
export const CLAIMED_COMPANIES_OR_FILTER = [
  "ai_status.is.null",
  "ai_status.neq.released",
  "assigned_user_id.not.is.null",
].join(",");

/**
 * Applies CLAIMED_COMPANIES_OR_FILTER to a crm_accounts query. Structurally
 * typed against the builder's own `.or()` so it composes with any Supabase
 * query without importing its generics.
 *
 * Composes safely with an existing `.or()` on the same query — PostgREST
 * treats each `or=` as its own top-level (AND-ed) condition.
 *
 * Interaction with crm_profiles.can_view_all_companies (see
 * ../_shell/companyVisibility.ts): a RESTRICTED caller's roster query already
 * narrows to `assigned_user_id = <self>`, which cannot match a NULL assignee,
 * so this is a no-op for them. It only changes what an unrestricted caller
 * (every owner, and any member with the flag on) sees.
 */
export function excludeUnclaimedProspects<T extends { or(filter: string): T }>(query: T): T {
  return query.or(CLAIMED_COMPANIES_OR_FILTER);
}
