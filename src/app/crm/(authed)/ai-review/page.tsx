import { redirect } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState, ZEBRA_ROWS } from "../_shell/ui";
import { IconAiReview } from "../_shell/icons";
import { ReviewCard, type AiReviewLead } from "./ReviewCard";
import { titleCaseWords, upperCaseState } from "../_shell/format";

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
  commodities: string | null;
  source: string | null;
  created_at: string;
};

/**
 * AI Review queue — owner-only. Every crm_account still awaiting a human
 * look (ai_status='pending_review'), whether it came from the AI-agent
 * research process (source='ai_agent') or an admin's Field Capture session
 * (source='field_capture') — both land here so nothing new reaches the team
 * unreviewed. Non-owners are redirected server-side, same enforcement point
 * as the settings admin gate: RLS only scopes rows to the org, not by role.
 */
export default async function AiReviewPage() {
  const user = await requireCrmUser();
  if (user.role !== "owner") redirect("/crm");

  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select(
      "id, name, address, city, state, zip, website, phone, industry, commodities, source, created_at",
    )
    .in("source", ["ai_agent", "field_capture"])
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
          .is("deleted_at", null)
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

  // Name/address/city/state are title-cased/uppercased for display here —
  // same helpers and same "read-boundary" pattern used everywhere else in
  // the CRM, applied per Brent's follow-up request. Phone stays exactly as
  // scraped (formatPhone in ReviewCard.tsx already just reformats digits,
  // it doesn't touch the field itself).
  const reviewLeads: AiReviewLead[] = leads.map((l) => ({
    id: l.id,
    name: titleCaseWords(l.name),
    address: titleCaseWords(l.address) || null,
    city: titleCaseWords(l.city) || null,
    state: upperCaseState(l.state) || null,
    zip: l.zip,
    website: l.website,
    phone: l.phone,
    industry: l.industry,
    commodities: l.commodities,
    source: l.source,
    contactCount: contactCountByAccount.get(l.id) ?? 0,
    notePreview: noteByAccount.get(l.id) ?? null,
    createdAt: l.created_at,
  }));

  return (
    <PageShell title="AI Review">
      <Card>
        <CardHead
          title="AI Review queue"
          hint={reviewLeads.length ? `${reviewLeads.length} pending` : undefined}
        />
        {reviewLeads.length === 0 ? (
          <EmptyState
            icon={<IconAiReview />}
            title="Nothing to review"
            body="New AI-researched leads will show up here before they reach the team."
          />
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {reviewLeads.map((lead) => (
              <ReviewCard key={lead.id} lead={lead} />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
