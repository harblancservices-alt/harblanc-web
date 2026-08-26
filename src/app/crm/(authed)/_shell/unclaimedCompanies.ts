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
 * NO LONGER THE POOL'S COMPLEMENT (2026-08-26). This used to be the exact
 * inverse of Admin -> Overview's "work to assign" query, and the two were
 * described as one rule seen from both sides. They diverged when the pool
 * became simply "assigned_user_id IS NULL" — Brent's call that every unowned
 * company must be assignable.
 *
 * This predicate deliberately did NOT follow. Widening it to hide every
 * unowned company would REMOVE ten companies from agents' Companies lists,
 * which is the opposite of the visibility that change was made for. So the
 * pool now shows a superset: a company with no owner and no ai_status
 * appears both here and in the pool, which is the right way round — being
 * assignable and being visible are not mutually exclusive.
 *
 * WHERE THIS LIVES, AND WHY IT MOVED (2026-08-26). This was ai-agent/queue.ts,
 * next to the Prospects claim queue that owned the idea. That page is gone —
 * the claim model was retired on 2026-08-25 (agents no longer pick work out of
 * a shared pool, an admin assigns it) and its route came out today. The RULE
 * outlived the page: released-but-unassigned companies still exist, they are
 * exactly what sits in Admin -> Overview's assign pool, and the Companies
 * roster still has to keep them out of an agent's book until somebody owns
 * them. So the predicate moved here rather than dying with its old home.
 *
 * Its one remaining consumer is ../accounts/page.tsx (the Companies list),
 * which yields to an explicit "show unassigned" grant on the profile.
 */

/**
 * Keep a row unless it is a RELEASED, still-unassigned company. Note the
 * `released` half: this is narrower than "unowned", on purpose — see the
 * note at the top of the file. Being ASSIGNED is what makes a
 * company appear in the roster; until then it lives only in Admin ->
 * Overview's pool, waiting to be handed to someone.
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
