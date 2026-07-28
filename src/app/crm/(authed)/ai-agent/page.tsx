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
  fleet_size: number | null;
  current_carrier: string | null;
  assigned_user_id: string | null;
  created_at: string;
};

/**
 * AI Agent tab — the team's lead register. Every crm_account the AI-agent
 * research process produced that an admin has released (ai_status=
 * 'released'); pending-review leads live only in /crm/ai-review until then.
 * Visible to every CRM user. Unclaimed leads sort first, newest-first within
 * each group, so the freshest un-worked leads are the first thing a rep sees.
 */
export default async function AiAgentPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select(
      "id, name, city, state, commodities, fleet_size, current_carrier, assigned_user_id, created_at",
    )
    .eq("source", "ai_agent")
    .eq("ai_status", "released")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const leads = (data ?? []) as AccountRow[];
  const ids = leads.map((l) => l.id);

  const assigneeIds = [
    ...new Set(leads.map((l) => l.assigned_user_id).filter(Boolean) as string[]),
  ];

  const [contactsRes, profilesRes] = await Promise.all([
    ids.length
      ? supabase
          .from("crm_contacts")
          .select("account_id")
          .in("account_id", ids)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { account_id: string }[] }),
    assigneeIds.length
      ? supabase
          .from("crm_profiles")
          .select("id, full_name, email")
          .in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);

  const contactCountByAccount = new Map<string, number>();
  for (const c of (contactsRes.data ?? []) as { account_id: string }[]) {
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
  }

  const assigneeName = new Map(
    ((profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
      (p) => [p.id, p.full_name || p.email || "Unnamed rep"],
    ),
  );

  const agentLeads: AiAgentLead[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    state: l.state,
    commodities: l.commodities,
    fleetSize: l.fleet_size,
    currentCarrier: l.current_carrier,
    contactCount: contactCountByAccount.get(l.id) ?? 0,
    assigneeName: l.assigned_user_id ? assigneeName.get(l.assigned_user_id) ?? null : null,
  }));

  // Unclaimed first, newest-first within each group. The query is already
  // newest-first, and Array#filter preserves order, so this partition alone
  // is enough — no re-sort needed.
  const unclaimed = agentLeads.filter((l) => !l.assigneeName);
  const claimed = agentLeads.filter((l) => l.assigneeName);
  const ordered = [...unclaimed, ...claimed];

  return (
    <PageShell
      eyebrow="Lead register"
      title="AI Agent"
      subtitle={
        agentLeads.length
          ? `${agentLeads.length} lead${agentLeads.length === 1 ? "" : "s"}${
              unclaimed.length ? ` · ${unclaimed.length} new` : ""
            }`
          : "Leads researched and released by the AI agent."
      }
    >
      {ordered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconAiAgent />}
            title="No leads yet"
            body="Released AI-researched leads will show up here for the team to claim and work."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
