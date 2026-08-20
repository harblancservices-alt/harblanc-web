import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState, ZEBRA_ROWS } from "../_shell/ui";
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
 * Prospects tab (route: /crm/ai-agent) — unclaimed leads only. Every crm_account the AI-agent or
 * Field Capture research process produced that an admin has released
 * (ai_status='released') AND nobody has claimed yet (assigned_user_id IS
 * NULL); pending-review leads live only in /crm/ai-review until then. The
 * moment a lead is claimed it drops out of this query entirely — it still
 * lives on as an ordinary company in /crm/accounts, just not here. Visible
 * to every CRM user, newest-first.
 */
export default async function AiAgentPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, commodities, created_at")
    .in("source", ["ai_agent", "field_capture"])
    .eq("ai_status", "released")
    .is("assigned_user_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const leads = (data ?? []) as AccountRow[];
  const ids = leads.map((l) => l.id);

  const { data: contactRows } = ids.length
    ? await supabase
        .from("crm_contacts")
        .select("account_id")
        .in("account_id", ids)
        .is("deleted_at", null)
    : { data: [] as { account_id: string }[] };

  const contactCountByAccount = new Map<string, number>();
  for (const c of (contactRows ?? []) as { account_id: string }[]) {
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
  }

  const agentLeads: AiAgentLead[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    state: l.state,
    commodities: l.commodities,
    contactCount: contactCountByAccount.get(l.id) ?? 0,
  }));

  return (
    <PageShell title="Prospects">
      <Card>
        <CardHead
          title="Prospects"
          hint={agentLeads.length ? `${agentLeads.length} unclaimed ${agentLeads.length === 1 ? "lead" : "leads"}` : undefined}
        />
        {agentLeads.length === 0 ? (
          <EmptyState
            icon={<IconAiAgent />}
            title="No unclaimed leads"
            body="Every released AI-researched lead has been claimed. Newly released leads will show up here for the team to claim."
          />
        ) : (
          <div className={`grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 ${ZEBRA_ROWS}`}>
            {agentLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
