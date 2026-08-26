import { createCrmServerClient, type CrmUser } from "@/lib/crm/auth";

export type CompanyVisibility = {
  /** True when this caller must NOT see every company in the org. */
  restricted: boolean;
  /**
   * True when a RESTRICTED caller additionally sees companies with no owner.
   * Meaningless (and always false) for an unrestricted caller, who already
   * sees everything including the unowned pile.
   */
  includeUnassigned: boolean;
  userId: string;
};

/**
 * Resolves what the caller may see in the AGENT-FACING company roster.
 *
 * THE RULE (Brent, 2026-08-25) — a caller sees a company when:
 *   it is assigned to them,
 *   OR crm_profiles.can_view_all_companies is true,
 *   OR (crm_profiles.show_unassigned is true AND the company has no owner).
 *
 * Both flags are per-profile and admin-editable at
 * /crm/admin/accounts/[userId] (Account controls). They are INDEPENDENT: an
 * agent can be given the unowned pile without being given everyone else's
 * book, which is the common case the second flag exists for.
 *
 * ROLE IS NOT PART OF THIS RULE (2026-08-25). An owner used to be
 * short-circuited to "sees everything" before the flags were even read.
 * That is now gone, deliberately: Brent wants Kartik — a full admin — to see
 * every company on Admin -> Companies but only his own in the workspace
 * Companies list, and a role short-circuit here makes those two inseparable.
 *
 * The two surfaces stay independent because they are gated by different
 * things and neither consults the other:
 *   - /crm/admin/**        gated by requireCrmAdmin() on role === 'owner'.
 *                          Admin -> Companies (admin/companies/companies-data.ts)
 *                          applies NO visibility filter at all, by design.
 *   - the agent-facing     gated by THIS function, on the profile flags only.
 *     roster
 * So setting an owner's can_view_all_companies to false narrows their
 * workspace list and cannot touch their admin access; and being an owner
 * cannot override their own agent-side filter.
 *
 * Applied to the CRM's actual company-ROSTER surfaces — the Companies list
 * (../accounts/page.tsx) and Active Customers (../customers/
 * ActiveCustomersPanel.tsx) — not to every place a company name is looked up
 * (task/call/contact "which company" pickers, the dashboard's queues, the
 * calendar). Those reference a specific company a rep is already working
 * with rather than let them browse the org's whole roster, which is what
 * these flags are about.
 *
 * FAILS CLOSED (2026-08-25). If the read fails — network hiccup, schema
 * drift, a profile row that has gone missing — the caller is treated as
 * RESTRICTED with no unowned pile. Under the centralised model the safe
 * failure is showing too little, not showing them the whole org.
 */
export async function getCompanyVisibility(user: CrmUser): Promise<CompanyVisibility> {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_profiles")
    .select("can_view_all_companies, show_unassigned")
    .eq("id", user.id)
    .maybeSingle();

  const row = data as {
    can_view_all_companies: boolean | null;
    show_unassigned: boolean | null;
  } | null;

  // `?? false` on both — no row, or no answer, means the narrowest view.
  const canViewAll = row?.can_view_all_companies ?? false;
  const showUnassigned = row?.show_unassigned ?? false;

  return {
    restricted: !canViewAll,
    includeUnassigned: !canViewAll && showUnassigned,
    userId: user.id,
  };
}

/**
 * THE ONE FILTER PATH. Every roster query narrows through this and nothing
 * re-implements the rule beside it — the whole point of the flags is that
 * "what can this person see" has a single answer.
 *
 * Structurally typed against the Supabase builder's own `.eq()`/`.or()` so
 * it composes with any query without importing PostgREST generics — same
 * shape as ai-agent/queue.ts::excludeUnclaimedProspects.
 *
 * The unowned case is a PostgREST `or=`, which is its own top-level
 * AND-ed condition, so it stacks safely with the stage/search/tag filters a
 * caller has already applied.
 */
export function applyCompanyVisibility<
  T extends { eq(column: string, value: string): T; or(filter: string): T },
>(query: T, visibility: CompanyVisibility): T {
  if (!visibility.restricted) return query;
  if (visibility.includeUnassigned) {
    return query.or(`assigned_user_id.eq.${visibility.userId},assigned_user_id.is.null`);
  }
  return query.eq("assigned_user_id", visibility.userId);
}
