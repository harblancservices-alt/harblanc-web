/**
 * The single list of intake sources whose released, unclaimed crm_accounts
 * rows appear in the agent claim queue (/crm/ai-agent) — the tab itself,
 * claimAiLead()'s claim guard, and the nav badge's unclaimed count all
 * import this so the three surfaces can never drift out of sync (2026-08-21:
 * broadened from AI-agent/Field-Capture-only so BOL Center and OTR released
 * companies are claimable here too).
 *
 * This list only widens WHICH intake pipelines are eligible — the real gate
 * every consumer still applies is ai_status='released' AND assigned_user_id
 * IS NULL. A manually-created company (source NULL, or a source outside
 * this list) has ai_status NULL and so never leaks in regardless of this
 * list, and a company from one of these sources that's already claimed or
 * still pending review is equally excluded by that same gate.
 */
export const CLAIMABLE_LEAD_SOURCES = ["ai_agent", "field_capture", "bol", "otr"] as const;

/**
 * The exact COMPLEMENT of the claim-queue predicate above, as a PostgREST
 * `or=` filter: keep a row unless it is a released, still-unclaimed prospect
 * from one of CLAIMABLE_LEAD_SOURCES. Claiming a company (assigned_user_id
 * stops being NULL) is what makes it appear in the Companies roster — until
 * then it lives only in /crm/ai-agent.
 *
 * Written as a NEGATED OR rather than three `.not()` calls because PostgREST
 * ANDs top-level filters: we need NOT(source ∈ list AND ai_status='released'
 * AND assigned_user_id IS NULL), which is
 *   source ∉ list  OR  ai_status IS NULL  OR  ai_status <> 'released'
 *   OR  assigned_user_id IS NOT NULL.
 *
 * `ai_status.is.null` is a REQUIRED disjunct, not redundant with
 * `ai_status.neq.released`: in SQL `column <> value` is NULL (not true) for a
 * NULL column, so without it every ordinary manually-created company (source
 * NULL, ai_status NULL) would be silently hidden — the same trap the
 * pending_review filter in accounts/page.tsx documents.
 *
 * Deliberately NARROWER than "assigned_user_id IS NULL": a company that was
 * simply never assigned to a rep (ai_status NULL — e.g. created by hand, or a
 * BOL company never promoted to the queue) is NOT a prospect and stays
 * visible, so the Companies page's "Unassigned" rep filter keeps working for
 * the rows it was built for.
 */
export const CLAIMED_COMPANIES_OR_FILTER = [
  `source.not.in.(${CLAIMABLE_LEAD_SOURCES.join(",")})`,
  "ai_status.is.null",
  "ai_status.neq.released",
  "assigned_user_id.not.is.null",
].join(",");

/**
 * Applies CLAIMED_COMPANIES_OR_FILTER to a crm_accounts query. Structurally
 * typed against the builder's own `.or()` so it composes with any Supabase
 * query without importing its generics.
 *
 * Note this composes safely with an existing `.or()` on the same query —
 * PostgREST treats each `or=` as its own top-level (AND-ed) condition, so the
 * pending-review filter and this one both apply.
 *
 * Interaction with crm_profiles.can_view_all_companies (see
 * ../_shell/companyVisibility.ts): for a RESTRICTED caller the roster query
 * already narrows to `assigned_user_id = <self>`, which cannot match a NULL
 * assignee, so this filter is a no-op for them. It only changes what an
 * unrestricted caller (every owner, and any member with the flag on) sees.
 */
export function excludeUnclaimedProspects<T extends { or(filter: string): T }>(query: T): T {
  return query.or(CLAIMED_COMPANIES_OR_FILTER);
}
