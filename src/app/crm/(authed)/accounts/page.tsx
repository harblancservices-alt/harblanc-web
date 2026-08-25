import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { getCompanyVisibility } from "../_shell/companyVisibility";
import { PageShell, Card, EmptyState } from "../_shell/ui";
import { IconCompanies } from "../_shell/icons";
import { AccountsFilters } from "./AccountsFilters";
import { CompanyListCard, type CompanyCardData } from "./CompanyListCard";
import { CompanyTable } from "./CompanyTable";
import { firstName, titleCaseWords, timestampMs } from "../_shell/format";
import { parsePhones } from "../_shell/contactFields";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import type { RepOption } from "./CompanyDialog";
import type { CrmTag } from "./tags";
import { AddContactDialog } from "../contacts/AddContactDialog";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import { excludeUnclaimedProspects } from "../ai-agent/queue";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  lifecycle_status: string | null;
  assigned_user_id: string | null;
  phone: string | null;
  phones: unknown;
  created_at: string;
};

/**
 * Turn free-text search into a `simple`-config prefix tsquery for the
 * crm_accounts.search_tsv GIN index (name/industry/city/state/carrier/DOT/MC).
 * Non-alphanumerics are stripped so a stray operator can never produce an
 * invalid tsquery; each surviving token matches as a prefix. Empty ⇒ no search.
 */
function toPrefixQuery(input: string): string {
  return input
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}:*`)
    .join(" & ");
}

/**
 * Companies list — SURFACE 2 of the Company/Contact rebuild, rebuilt from
 * the old table into a mobile-first card grid matching the design system
 * the Company detail page (surface 1) established: LIFECYCLE_TONE stage
 * pills, BTN_ACTION for the tap-to-call action, square corners. Reads
 * crm_accounts for the caller's org ONLY (RLS-scoped). Full-text search over
 * search_tsv plus lifecycle / rep / tag filters and a sort control, all
 * driven from the URL so any view is shareable. Each card shows exactly the
 * fields Brent specified — stage, city/state, one tag, last-contact, contact
 * count, call button — never a table row's worth of dense columns.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; rep?: string; tag?: string; sort?: string }>;
}) {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const visibility = await getCompanyVisibility(user);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const stage = (sp.stage ?? "").trim();
  const rep = (sp.rep ?? "").trim();
  const tagFilter = (sp.tag ?? "").trim();
  const sort = (sp.sort ?? "").trim();

  // Filter-option rosters (RLS-scoped to the caller's org).
  const [tagsRes, profilesRes] = await Promise.all([
    supabase.from("crm_tags").select("id, label, color").order("label"),
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
  ]);

  const allTags = (tagsRes.data ?? []) as CrmTag[];
  const tagById = new Map(allTags.map((t) => [t.id, t]));

  const profiles = (profilesRes.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    is_active: boolean;
  }[];
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: firstName(p.full_name, p.email) || "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // The org roster (id/name only) for the "Add contact" dialog's company
  // combobox — independent of the filtered/paginated `accounts` list below.
  // Restricted the same way the main list is when the caller can't see every
  // company (see getCompanyVisibility) — otherwise a restricted agent could
  // still pick any company by name through this dropdown.
  let companyOptionsQuery = excludeUnclaimedProspects(
    supabase
      .from("crm_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(1000),
  );
  if (visibility.restricted) companyOptionsQuery = companyOptionsQuery.eq("assigned_user_id", visibility.userId);
  const { data: companyOptionsData } = await companyOptionsQuery;
  const companyOptions = ((companyOptionsData ?? []) as CompanyOption[]).map((a) => ({
    id: a.id,
    name: titleCaseWords(a.name),
  }));

  // A tag filter requires a join crm_accounts doesn't carry directly — first
  // resolve which accounts actually have the selected tag.
  let tagFilterAccountIds: string[] | null = null;
  if (tagFilter) {
    const { data: tagAccountRows } = await supabase
      .from("crm_account_tags")
      .select("account_id")
      .eq("tag_id", tagFilter);
    tagFilterAccountIds = ((tagAccountRows ?? []) as { account_id: string }[]).map((r) => r.account_id);
  }

  let query = supabase
    .from("crm_accounts")
    .select("id, name, city, state, lifecycle_status, assigned_user_id, phone, phones, created_at")
    .is("deleted_at", null)
    // Pending-review AI leads live in the admin review queue (/crm/ai-review)
    // until released — they must not leak into Companies before that. Written
    // as an OR (rather than .neq) so NULL ai_status rows (every non-AI
    // company) still pass: `column <> value` in SQL is NULL, not true, for
    // NULL columns, which would silently hide every ordinary company.
    .or("ai_status.is.null,ai_status.neq.pending_review");

  // Released-but-unclaimed prospects live in the claim queue (/crm/ai-agent)
  // only — claiming one is what surfaces it here. Exact complement of that
  // queue's predicate; see excludeUnclaimedProspects' comment for why it's a
  // negated OR and why it's narrower than "assigned_user_id IS NULL" (the
  // "Unassigned" rep filter below still works for never-assigned companies).
  query = excludeUnclaimedProspects(query);

  if (stage) query = query.eq("lifecycle_status", stage);
  // A restricted agent (can_view_all_companies=false) only ever sees their
  // own companies — this OVERRIDES the `rep` URL param entirely rather than
  // combining with it, since that param is client-submitted and must never
  // be trusted to narrow (or widen) what a restricted caller can reach.
  if (visibility.restricted) {
    query = query.eq("assigned_user_id", visibility.userId);
  } else if (rep === "unassigned") {
    query = query.is("assigned_user_id", null);
  } else if (rep) {
    query = query.eq("assigned_user_id", rep);
  }
  if (tagFilterAccountIds !== null) {
    query = tagFilterAccountIds.length ? query.in("id", tagFilterAccountIds) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const ts = q ? toPrefixQuery(q) : "";
  if (ts) query = query.textSearch("search_tsv", ts, { config: "simple" });

  if (sort === "name") query = query.order("name", { ascending: true });
  else query = query.order("created_at", { ascending: false });

  const { data } = await query.limit(200);
  const accounts = (data ?? []) as AccountRow[];

  const accountIds = accounts.map((a) => a.id);

  const [tagLinkRes, contactsRes, lastCallsRes, lastActivitiesRes] = await Promise.all([
    accountIds.length
      ? supabase.from("crm_account_tags").select("account_id, tag_id").in("account_id", accountIds)
      : Promise.resolve({ data: [] as { account_id: string; tag_id: string }[] }),
    accountIds.length
      ? supabase.from("crm_contacts").select("id, account_id").in("account_id", accountIds).is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; account_id: string }[] }),
    // Last-contact column: newest-first rows from each source, capped well
    // above what 200 companies' worth of recent history could need — reduced
    // to a single MAX(occurred_at) per company below.
    accountIds.length
      ? supabase
          .from("crm_calls")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] as { account_id: string; occurred_at: string }[] }),
    accountIds.length
      ? supabase
          .from("crm_activities")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          // Only kinds that represent a human actually reaching the company
          // — see CRM_CONTACT_ACTIVITY_KINDS. Without this, an AI-research
          // run or any other system/automated event reads as "contacted."
          .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
          .order("occurred_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] as { account_id: string; occurred_at: string }[] }),
  ]);

  const tagsByAccount = new Map<string, CrmTag[]>();
  for (const link of (tagLinkRes.data ?? []) as { account_id: string; tag_id: string }[]) {
    const t = tagById.get(link.tag_id);
    if (!t) continue;
    const list = tagsByAccount.get(link.account_id) ?? [];
    list.push(t);
    tagsByAccount.set(link.account_id, list);
  }
  for (const list of tagsByAccount.values()) list.sort((a, b) => a.label.localeCompare(b.label));

  const contactCountByAccount = new Map<string, number>();
  for (const c of (contactsRes.data ?? []) as { id: string; account_id: string }[]) {
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
  }

  // Last-contact — the more recent of the account's last logged call and its
  // last CONTACT-kind timeline activity (a call already lands in
  // crm_activities too, but a note/stage-change/contact-add with no call
  // should still count as contact). The activities query above is filtered
  // to CRM_CONTACT_ACTIVITY_KINDS, so system/automated rows (AI research, AI
  // suggestions, record creation, etc.) never inflate this.
  const lastContactMsByAccount = new Map<string, number>();
  for (const row of [
    ...((lastCallsRes.data ?? []) as { account_id: string; occurred_at: string }[]),
    ...((lastActivitiesRes.data ?? []) as { account_id: string; occurred_at: string }[]),
  ]) {
    const ms = timestampMs(row.occurred_at);
    if (ms === null) continue;
    const current = lastContactMsByAccount.get(row.account_id);
    if (current === undefined || ms > current) lastContactMsByAccount.set(row.account_id, ms);
  }

  if (sort === "stale") {
    // Coldest (or never-contacted) first, so stale accounts surface at the
    // top rather than requiring a scroll through everything else.
    accounts.sort((a, b) => {
      const am = lastContactMsByAccount.get(a.id) ?? -Infinity;
      const bm = lastContactMsByAccount.get(b.id) ?? -Infinity;
      return am - bm;
    });
  }

  const cards: CompanyCardData[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    stage: a.lifecycle_status,
    city: a.city,
    state: a.state,
    primaryTag: tagsByAccount.get(a.id)?.[0] ?? null,
    contactCount: contactCountByAccount.get(a.id) ?? 0,
    lastContactMs: lastContactMsByAccount.get(a.id) ?? null,
    phone: parsePhones(a.phones)[0]?.number || a.phone,
  }));

  const filtersActive = Boolean(q || stage || rep || tagFilter || sort);

  return (
    <PageShell
      title="Companies"
      subtitle={
        visibility.restricted
          ? "Showing only companies assigned to you."
          : `${cards.length} compan${cards.length === 1 ? "y" : "ies"} in your org.`
      }
      actions={<AddContactDialog companies={companyOptions} />}
    >
      <Card className="p-4">
        <AccountsFilters q={q} stage={stage} rep={rep} tag={tagFilter} sort={sort} reps={reps} tags={allTags} />
      </Card>

      {cards.length === 0 ? (
        <Card>
          {filtersActive ? (
            <EmptyState
              icon={<IconCompanies />}
              title="No companies match"
              body="Try a different search or clear the filters to see every company."
            />
          ) : (
            <EmptyState
              icon={<IconCompanies />}
              title="No companies yet"
              body="Companies come in through the BOL and prospect workflow."
            />
          )}
        </Card>
      ) : (
        <>
          {/* Mobile cards — single-column stack, matching /crm-design's
              CompaniesPage exactly (was a 2/3/4-col grid below `md`). */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {cards.map((c) => (
              <CompanyListCard key={c.id} company={c} companyOptions={companyOptions} />
            ))}
          </div>

          {/* Desktop table — bare Card, no nested title bar (the page's own
              H1 already says "Companies"; a second "Companies" CardHead
              inside the card was redundant and isn't how crm-design's
              Companies table is composed). Breakpoint moved md -> lg to
              match the prototype's card/table switch point. */}
          <Card className="hidden lg:block">
            <div className="overflow-x-auto">
              <CompanyTable companies={cards} companyOptions={companyOptions} />
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
