import { createCrmServerClient } from "@/lib/crm/auth";

export type OrgUser = {
  id: string;
  name: string;
  email: string;
  /** Always "" today — crm_profiles has no phone column. Stays editable
   * client-side either way once a caller lets the user override it. */
  phone: string;
};

/**
 * The org's active CRM users, for "assign a rep" dropdowns (Bill of Lading
 * and Rate Confirmation broker-contact auto-fill). Shared here so both docs
 * fetch and shape this list identically instead of drifting apart.
 */
export async function getActiveOrgUsers(): Promise<OrgUser[]> {
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  return ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
    (u) => ({
      id: u.id,
      name: u.full_name || u.email || "Unnamed",
      email: u.email || "",
      phone: "",
    }),
  );
}
