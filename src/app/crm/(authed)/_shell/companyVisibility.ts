import { createCrmServerClient, type CrmUser } from "@/lib/crm/auth";

export type CompanyVisibility = {
  /** True when this caller must only see companies they're assigned to. */
  restricted: boolean;
  userId: string;
};

/**
 * Resolves whether the caller should see every company in the org, or only
 * the ones they're assigned to — crm_profiles.can_view_all_companies, the
 * Admin Account "Account Controls" toggle (../admin/actions.ts). An owner
 * always sees everything regardless of the flag (the toggle only exists to
 * restrict a Sales Agent), so this never even queries for one.
 *
 * Applied to the CRM's actual company-ROSTER surfaces — the Companies list
 * (../accounts/page.tsx) and Active Customers (../customers/
 * ActiveCustomersPanel.tsx) — not to every place a company name is looked up
 * (task/call/contact "which company" pickers, the dashboard's org-wide
 * command-center queues, calendar). Those reference a specific company a rep
 * is already working with rather than let them browse the org's whole
 * roster, which is what this flag is about.
 *
 * FAILS CLOSED (2026-08-25). If the read fails — network hiccup, schema
 * drift, a profile row that has gone missing — a non-owner is now treated as
 * RESTRICTED rather than unrestricted. Under the centralised model a sales
 * agent is meant to see only their own companies, so the safe failure is
 * showing too little, not showing them the whole org. This inverts the old
 * default, which pre-dated that rule.
 *
 * An owner is still resolved without a query and always sees everything.
 */
export async function getCompanyVisibility(user: CrmUser): Promise<CompanyVisibility> {
  if (user.role === "owner") return { restricted: false, userId: user.id };

  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_profiles")
    .select("can_view_all_companies")
    .eq("id", user.id)
    .maybeSingle();

  // `?? false` — no row, or no answer, means restricted.
  const canViewAll = (data as { can_view_all_companies: boolean } | null)?.can_view_all_companies ?? false;
  return { restricted: !canViewAll, userId: user.id };
}
