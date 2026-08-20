import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, EmptyState } from "../../_shell/ui";
import { AddOtrEntryButton } from "./AddOtrEntryButton";
import { OtrEntryCard, type OtrEntryData } from "./OtrEntryCard";
import type { OtrStatus } from "./actions";

export const dynamic = "force-dynamic";

type OtrRow = {
  id: string;
  company_name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  notes: string | null;
  sales_relevance: "high" | "medium" | "low" | null;
  status: OtrStatus;
  released_account_id: string | null;
};

/**
 * OTR — the document-less prospect-intake funnel's real backend (see
 * ./actions.ts and the crm_otr_entries migration's header comment). A single
 * page/card-list, not a list+detail pair — deliberately leaner than BOL
 * Center, matching crm-design's own "there's simply less to review" call
 * (DESIGN_DECISIONS.md §12).
 */
export default async function AdminOtrPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_otr_entries")
    .select("id, company_name, city, state, industry, notes, sales_relevance, status, released_account_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const entries = (data ?? []) as OtrRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} — companies {user.fullName || "Brent"} names over the phone, with no document at all.
        </p>
        <AddOtrEntryButton />
      </div>

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            title="No OTR entries yet"
            body="Add a company Brent dispatched verbally — no BOL, no scan, just what he said and what turns up in research."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((e) => (
            <OtrEntryCard
              key={e.id}
              otr={{
                id: e.id,
                companyName: e.company_name,
                city: e.city,
                state: e.state,
                industry: e.industry,
                notes: e.notes,
                salesRelevance: e.sales_relevance,
                status: e.status,
                releasedAccountId: e.released_account_id,
              } satisfies OtrEntryData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
