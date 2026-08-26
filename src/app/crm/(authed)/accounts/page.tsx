import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { getCompanyVisibility, applyCompanyVisibility } from "../_shell/companyVisibility";
import { PageShell, Card, EmptyState } from "../_shell/ui";
import { IconCompanies } from "../_shell/icons";
import { AccountsFilters } from "./AccountsFilters";
import { CompanyListCard, type CompanyCardData } from "./CompanyListCard";
import { CompanyTable } from "./CompanyTable";
import { firstName, titleCaseWords } from "../_shell/format";
import { parsePhones } from "../_shell/contactFields";
import type { RepOption } from "./CompanyDialog";
import type { CrmTag } from "./tags";
import { AddContactDialog } from "../contacts/AddContactDialog";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import { excludeUnclaimedProspects } from "../_shell/unclaimedCompanies";
import { contactCountByAccount } from "@/lib/crm/contactCount";
import { lastContactByAccount } from "@/lib/crm/lastContact";
import { serverNow } from "@/lib/crm/serverNow";

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
  let companyOptionsQuery = supabase
    .from("crm_accounts")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  if (!visibility.includeUnassigned) companyOptionsQuery = excludeUnclaimedProspects(companyOptionsQuery);
  companyOptionsQuery = applyCompanyVisibility(companyOptionsQuery, visibility);
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
    // Anything still awaiting review must not leak into Companies. Kept as a
    // defensive filter after /crm/ai-review was deleted (2026-08-25): nothing
    // writes ai_status='pending_review' today and there are 0 such rows, but
    // the column and value are live data other code reads, so this stays
    // rather than assuming none will ever appear again. Written as an OR
    // (rather than .neq) so NULL ai_status rows (the majority) still pass:
    // `column <> value` in SQL is NULL, not true, for NULL columns, which
    // would silently hide every ordinary company.
    .or("ai_status.is.null,ai_status.neq.pending_review");

  // Released-but-unassigned companies are held back from the roster until
  // somebody owns them. NOT the exact complement of the assign pool any
  // more — the pool is every unowned company as of 2026-08-26, and this
  // stayed narrower deliberately, because widening it would hide companies
  // rather than surface them. See unclaimedCompanies.ts.
  // YIELDS to an explicit "Show unassigned" grant. This exclusion hides
  // released-but-unassigned companies from the roster (they live in the
  // assign pool). Someone whose profile says they may see the unowned
  // pile has been given exactly those rows on purpose, so silently keeping 17
  // of them back would make the flag under-deliver against its own promise.
  // For everyone else it behaves exactly as before.
  if (!visibility.includeUnassigned) query = excludeUnclaimedProspects(query);

  if (stage) query = query.eq("lifecycle_status", stage);
  // A restricted caller sees only what their profile flags allow — this
  // OVERRIDES the `rep` URL param entirely rather than combining with it,
  // since that param is client-submitted and must never be trusted to narrow
  // (or widen) what a restricted caller can reach.
  if (visibility.restricted) {
    query = applyCompanyVisibility(query, visibility);
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

  const [tagLinkRes, contactCounts] = await Promise.all([
    accountIds.length
      ? supabase.from("crm_account_tags").select("account_id, tag_id").in("account_id", accountIds)
      : Promise.resolve({ data: [] as { account_id: string; tag_id: string }[] }),
    contactCountByAccount(supabase, accountIds),
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


  // Last contact — THE shared definition (lib/crm/lastContact.ts), not a
  // local reduce. Six readers used to carry their own copy of this query
  // pair; they now all call the same helper.
  const lastContactMsByAccount = await lastContactByAccount(supabase, accountIds);

  if (sort === "stale") {
    // Coldest (or never-contacted) first, so stale accounts surface at the
    // top rather than requiring a scroll through everything else.
    accounts.sort((a, b) => {
      const am = lastContactMsByAccount.get(a.id) ?? -Infinity;
      const bm = lastContactMsByAccount.get(b.id) ?? -Infinity;
      return am - bm;
    });
  }

  // ONE server instant for every temperature on this page — the React
  // Compiler rejects serverNow() during render, and a per-row clock would let
  // two rows disagree about what "today" means anyway.
  const renderedAt = serverNow();

  const cards: CompanyCardData[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    stage: a.lifecycle_status,
    city: a.city,
    state: a.state,
    primaryTag: tagsByAccount.get(a.id)?.[0] ?? null,
    contactCount: contactCounts.get(a.id) ?? 0,
    lastContactMs: lastContactMsByAccount.get(a.id) ?? null,
    phone: parsePhones(a.phones)[0]?.number || a.phone,
  }));

  const filtersActive = Boolean(q || stage || rep || tagFilter || sort);

  return (
    <PageShell
      title="Companies"
      subtitle={
        visibility.restricted
          ? visibility.includeUnassigned
            ? "Showing companies assigned to you, plus any with no owner."
            : "Showing only companies assigned to you."
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
          ) : visibility.restricted ? (
            /* NOT the same empty as "the org has none" (2026-08-25). A
               restricted caller with nothing assigned to them was being told
               "No companies yet — companies come in through the BOL and
               prospect workflow", which reads as "the database is empty" when
               in fact 60 companies exist and none are theirs. Say which it
               actually is, and where the ones they can't see live. */
            <EmptyState
              icon={<IconCompanies />}
              title="Nothing assigned to you yet"
              body="This list only shows companies you own. An admin assigns them from Admin → Companies."
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
              <CompanyListCard key={c.id} company={c} companyOptions={companyOptions} now={renderedAt} />
            ))}
          </div>

          {/* Desktop table — bare Card, no nested title bar (the page's own
              H1 already says "Companies"; a second "Companies" CardHead
              inside the card was redundant and isn't how crm-design's
              Companies table is composed). Breakpoint moved md -> lg to
              match the prototype's card/table switch point. */}
          <Card className="hidden lg:block">
            <div className="overflow-x-auto">
              <CompanyTable companies={cards} companyOptions={companyOptions} now={renderedAt} />
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
