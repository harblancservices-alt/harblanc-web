import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { BillOfLadingGenerator, type OrgUser } from "./BillOfLadingGenerator";

export const dynamic = "force-dynamic";

/**
 * Bill of Lading generator: a left-side fill-in form paired with a live
 * document preview on the right, printed via the same "hide everything but
 * the print area" trick as /crm/rate-confirmation. Every field is
 * controlled React state (not uncontrolled inputs) so the preview can
 * re-render as-you-type with blank underlines instead of bracket
 * placeholders. No persistence.
 *
 * The one thing this Server Component DOES fetch: the org's active CRM
 * users, for the Broker Contact dropdown. crm_profiles has no phone
 * column (see supabase/migrations/20260557000000_crm_foundation.sql) —
 * phone always comes back "" and stays editable client-side, same as the
 * "leave blank if the user record has none" fallback for any user who
 * genuinely lacks one once a phone column exists.
 */
export default async function BillOfLadingPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  const orgUsers: OrgUser[] = ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
    (u) => ({
      id: u.id,
      name: u.full_name || u.email || "Unnamed",
      email: u.email || "",
      phone: "",
    }),
  );

  return (
    <PageShell>
      <BillOfLadingGenerator orgUsers={orgUsers} />
    </PageShell>
  );
}
