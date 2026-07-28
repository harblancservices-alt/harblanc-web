import { redirect } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState } from "../_shell/ui";
import { IconAiReview } from "../_shell/icons";
import { ReviewCard, type AiReviewLead } from "./ReviewCard";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  phone: string | null;
  industry: string | null;
  fleet_size: number | null;
  current_carrier: string | null;
  commodities: string | null;
  created_at: string;
};

/**
 * AI Review queue — owner-only. Every crm_account the AI-agent research
 * process inserted (source='ai_agent') that's still awaiting a human look
 * (ai_status='pending_review'). Non-owners are redirected server-side, same
 * enforcement point as the settings admin gate: RLS only scopes rows to the
 * org, not by role.
 */
export default async function AiReviewPage() {
  const user = await requireCrmUser();
  if (user.role !== "owner") redirect("/crm");

  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select(
      "id, name, address, city, state, zip, website, phone, industry, fleet_size, current_carrier, commodities, created_at",
    )
    .eq("source", "ai_agent")
    .eq("ai_status", "pending_review")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const leads = (data ?? []) as AccountRow[];
  const ids = leads.map((l) => l.id);

  const [contactsRes, notesRes] = await Promise.all([
    ids.length
      ? supabase
          .from("crm_contacts")
          .select("account_id")
          .in("account_id", ids)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { account_id: string }[] }),
    ids.length
      ? supabase
          .from("crm_notes")
          .select("account_id, body, created_at")
          .in("account_id", ids)
          .eq("is_pinned", true)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { account_id: string; body: string; created_at: string }[] }),
  ]);

  const contactCountByAccount = new Map<string, number>();
  for (const c of (contactsRes.data ?? []) as { account_id: string }[]) {
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
  }

  // Most-recent pinned note per account (an account could in principle have
  // more than one pinned note; the preview only needs the latest).
  const noteByAccount = new Map<string, string>();
  for (const n of (notesRes.data ?? []) as { account_id: string; body: string }[]) {
    if (!noteByAccount.has(n.account_id)) noteByAccount.set(n.account_id, n.body);
  }

  const reviewLeads: AiReviewLead[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    city: l.city,
    state: l.state,
    zip: l.zip,
    website: l.website,
    phone: l.phone,
    industry: l.industry,
    fleetSize: l.fleet_size,
    currentCarrier: l.current_carrier,
    commodities: l.commodities,
    contactCount: contactCountByAccount.get(l.id) ?? 0,
    notePreview: noteByAccount.get(l.id) ?? null,
    createdAt: l.created_at,
  }));

  return (
    <PageShell
      eyebrow="Admin"
      title="AI Review Queue"
      subtitle={
        reviewLeads.length
          ? `${reviewLeads.length} lead${reviewLeads.length === 1 ? "" : "s"} awaiting review`
          : "Leads the AI agent has researched, awaiting your review."
      }
    >
      <Card>
        {reviewLeads.length === 0 ? (
          <EmptyState
            icon={<IconAiReview />}
            title="Nothing to review"
            body="New AI-researched leads will show up here before they reach the team."
          />
        ) : (
          <ul className="divide-y divide-line">
            {reviewLeads.map((lead) => (
              <ReviewCard key={lead.id} lead={lead} />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
