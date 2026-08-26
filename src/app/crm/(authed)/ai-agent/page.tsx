import { contactCountByAccount } from "@/lib/crm/contactCount";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState } from "../_shell/ui";
import { IconAiAgent } from "../_shell/icons";
import { LeadCard, type AiAgentLead } from "./LeadCard";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  commodities: string | null;
  created_at: string;
};

/**
 * Prospects tab (route: /crm/ai-agent) — unclaimed leads only. Every
 * crm_account released (ai_status='released') that nobody has claimed yet
 * (assigned_user_id IS NULL), from ANY intake pipeline — see ./queue.ts for
 * why the gate is source-agnostic.
 * The moment a lead is claimed it drops out of this query entirely — it
 * still lives on as an ordinary company in /crm/accounts, and claiming is in
 * fact what makes it appear there. Visible to every CRM user, newest-first.
 */
export default async function AiAgentPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, commodities, created_at")
    .eq("ai_status", "released")
    .is("assigned_user_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const leads = (data ?? []) as AccountRow[];
  const ids = leads.map((l) => l.id);

  const contactCounts = await contactCountByAccount(supabase, ids);

  const agentLeads: AiAgentLead[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    state: l.state,
    commodities: l.commodities,
    contactCount: contactCounts.get(l.id) ?? 0,
  }));

  return (
    <PageShell
      title="Prospects"
      subtitle={
        agentLeads.length
          ? `${agentLeads.length} unclaimed ${agentLeads.length === 1 ? "lead" : "leads"} · released, not yet claimed`
          : undefined
      }
    >
      {agentLeads.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconAiAgent />}
            title="No unclaimed leads"
            body="Every released lead has been claimed. Newly released leads — from BOL Center or OTR — will show up here for the team to claim."
          />
        </Card>
      ) : (
        // Card grid, not a Card-wrapped table — matches crm-design's
        // Prospects page exactly (same grid-cols-2/3 breakpoints, no
        // redundant CardHead repeating the page's own H1 "Prospects").
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agentLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
