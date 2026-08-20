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
    { count: pendingReviewCount },
    { count: otrCount },
    { count: bolEntryCount },
  ] = await Promise.all([
    supabase.from("crm_profiles").select("id", { count: "exact", head: true }),
    supabase.from("crm_profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("crm_rate_confirmations").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("crm_bills_of_lading").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("crm_tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
    // Same predicate as /crm/ai-review itself and the old nav badge it used
    // to carry (../_shell/layout.tsx) — AI Review moved here, not deleted.
    supabase
      .from("crm_accounts")
      .select("id", { count: "exact", head: true })
      .in("source", ["ai_agent", "field_capture"])
      .eq("ai_status", "pending_review")
      .is("deleted_at", null),
    // Errors (e.g. the migration hasn't been applied yet) resolve to
    // count=null, not a thrown error — see crm_otr_entries.sql's header.
    supabase.from("crm_otr_entries").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("crm_bol_entries").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);

  const documentCount = (rcCount ?? 0) + (bolCount ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatLinkTile href="/crm/admin/bol-center" label="BOL Center" value={bolEntryCount === null ? "—" : String(bolEntryCount)} />
        <StatLinkTile href="/crm/admin/otr" label="OTR" value={otrCount === null ? "—" : String(otrCount)} />
        <StatLinkTile href="/crm/ai-review" label="AI Review — pending" value={String(pendingReviewCount ?? 0)} />
        <StatLinkTile href="/crm/admin/accounts" label="Team accounts" value={`${activeTeamCount ?? 0} active`} />
        <StatLinkTile href="/crm/admin/activity" label="Open tasks org-wide" value={String(openTaskCount ?? 0)} />
        <StatLinkTile href="/crm/admin/documents" label="Master templates" value={String(documentCount)} />
        <StatLinkTile href="/crm/admin/organization" label="Organization" value="Edit" />
      </div>

      <Card>
        <CardHead title="Admin Account" hint="Owner-only elevated area of the CRM" />
        <div className="space-y-2 px-5 py-4 text-[13.5px] leading-relaxed text-fg-muted">
          <p>
            {teamCount ?? 0} total team {teamCount === 1 ? "account" : "accounts"} on this org.{" "}
            <span className="font-semibold text-fg">BOL Center</span> and{" "}
            <span className="font-semibold text-fg">OTR</span> are the two prospect-intake funnels this
            section is designed around. <span className="font-semibold text-fg">OTR</span> tracks
            companies named to Brent over the phone, with no document at all — releasing an entry creates
            a real company. <span className="font-semibold text-fg">BOL Center</span> tracks bills of
            lading Brent has already worked, researched into shipper/consignee/route detail.{" "}
            <span className="font-semibold text-fg">AI Review</span> is the pending-review
            queue for AI-sourced and Field Capture leads — moved here from the primary sales nav since
            it&rsquo;s an owner/admin gate, not a sales-agent destination. Use{" "}
            <span className="font-semibold text-fg">Accounts</span> to review a
            teammate&rsquo;s access level and account controls,{" "}
            <span className="font-semibold text-fg">Activity</span> to see what&rsquo;s happening across
            every company (the CRM&rsquo;s real sales-activity feed — not yet a separate admin audit trail),{" "}
            <span className="font-semibold text-fg">Documents</span> to open the org&rsquo;s two blank
            master templates (Rate Confirmation and Bill of Lading) — not a per-shipment archive; every
            shipment&rsquo;s own generated documents live on that shipment&rsquo;s own record instead — and{" "}
            <span className="font-semibold text-fg">Organization</span> to edit the brokerage letterhead
            every generated document reads from.
          </p>
        </div>
      </Card>
    </div>
  );
}
