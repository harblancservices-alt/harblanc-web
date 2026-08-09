import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type BrokerProfile = {
  name: string;
  mc: string;
  dot: string;
  /** Mailing address for the broker letterhead. Blank until Settings has one
   * on file — callers must render nothing (not a placeholder) when blank. */
  address: string;
};

const EMPTY_PROFILE: BrokerProfile = { name: "", mc: "", dot: "", address: "" };

/**
 * Hello Hotshot's broker letterhead info — permanent, org-wide identity that
 * documents (Bill of Lading, Rate Confirmation, ...) read instead of asking
 * a rep to type it per-document. Backed by the single-row-per-org
 * crm_broker_profile table (RLS: org_id = crm_current_org()), edited from
 * CRM Settings. Falls back to blank fields (never a hardcoded company name)
 * if the org somehow has no row yet, so a missing row reads as "unset" on
 * the doc rather than showing another org's placeholder data.
 */
export async function getBrokerProfile(): Promise<BrokerProfile> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_broker_profile")
    .select("company_name, mc_number, dot_number, address")
    .eq("org_id", user.orgId)
    .maybeSingle();

  if (!data) return EMPTY_PROFILE;

  return {
    name: data.company_name || "",
    mc: data.mc_number || "",
    dot: data.dot_number || "",
    address: data.address || "",
  };
}
