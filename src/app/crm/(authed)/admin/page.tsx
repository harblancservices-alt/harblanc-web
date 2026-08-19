import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, StatLinkTile } from "../_shell/ui";

export const dynamic = "force-dynamic";

/**
 * Admin Account "Overview" — a light landing summary (counts + quick links
 * into the other three tabs), per the approved mockup's "keep it simple, we
 * can iterate" call. Deliberately cheap: plain head:true counts, no joins,
 * no thumbnail rendering (unlike the Documents tab's own data layer) — this
 * page should stay fast even as the org's document/activity history grows.
 */
export default async function AdminOverviewPage() {
  const supabase = await createCrmServerClient();

  const [
    { count: teamCount },
    { count: activeTeamCount },
    { count: rcCount },
    { count: bolCount },
    { count: openTaskCount },
  ] = await Promise.all([
    supabase.from("crm_profiles").select("id", { count: "exact", head: true }),
    supabase.from("crm_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("crm_rate_confirmations").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("crm_bills_of_lading").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("crm_tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const documentCount = (rcCount ?? 0) + (bolCount ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatLinkTile href="/crm/admin/accounts" label="Team accounts" value={`${activeTeamCount ?? 0} active`} />
        <StatLinkTile href="/crm/admin/documents" label="Operational documents" value={String(documentCount)} />
        <StatLinkTile href="/crm/admin/activity" label="Open tasks org-wide" value={String(openTaskCount ?? 0)} />
      </div>

      <Card>
        <CardHead title="Admin Account" hint="Owner-only elevated area of the CRM" />
        <div className="space-y-2 px-5 py-4 text-[13.5px] leading-relaxed text-fg-muted">
          <p>
            {teamCount ?? 0} total team {teamCount === 1 ? "account" : "accounts"} on this org. Use{" "}
            <span className="font-semibold text-fg">Accounts</span> to review a teammate&rsquo;s access
            level and account controls, <span className="font-semibold text-fg">Activity</span> to see
            what&rsquo;s happening across every company, and{" "}
            <span className="font-semibold text-fg">Documents</span> to browse every Rate Confirmation and
            Bill of Lading generated across every shipment.
          </p>
        </div>
      </Card>
    </div>
  );
}
