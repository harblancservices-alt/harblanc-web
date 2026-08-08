import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState, LIST_HEAD_ROW, ZEBRA_ROWS } from "../_shell/ui";
import { ClickableRow } from "../_shell/ClickableRow";
import { IconCompanies } from "../_shell/icons";
import { AddCompany } from "./AddCompany";
import { AccountsFilters } from "./AccountsFilters";
import { stageLabel, stageTone } from "./lifecycle";
import { firstName, lastContactStatus, timestampMs, titleCaseWords, upperCaseState } from "../_shell/format";
import type { RepOption } from "./CompanyDialog";
import type { CrmTag } from "./tags";
import { AddContactDialog } from "../contacts/AddContactDialog";
import type { CompanyOption } from "../contacts/CompanyCombobox";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  lifecycle_status: string | null;
  assigned_user_id: string | null;
  primary_contact_id: string | null;
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
 * Companies list — reads crm_accounts for the caller's org ONLY (RLS-scoped;
 * no dispatch table is ever queried). Full-text search over search_tsv plus
 * lifecycle / rep filters, all driven from the URL so any view is shareable.
 * Each row shows the company, lifecycle badge, city/state, primary contact,
 * and its tags (tags are display-only here — there's no tag filter or editor
 * anymore, see tags.ts).
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; rep?: string; sort?: string }>;
}) {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const stage = (sp.stage ?? "").trim();
  const rep = (sp.rep ?? "").trim();
  const sortStale = (sp.sort ?? "").trim() === "stale";

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

  // The full org roster (id/name only) for the "Add contact" dialog's company
  // combobox — independent of the filtered/paginated `accounts` list below.
  const { data: companyOptionsData } = await supabase
    .from("crm_accounts")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  const companyOptions = ((companyOptionsData ?? []) as CompanyOption[]).map((a) => ({
    id: a.id,
    name: titleCaseWords(a.name),
  }));

  let query = supabase
    .from("crm_accounts")
    .select(
      "id, name, industry, city, state, lifecycle_status, assigned_user_id, primary_contact_id, created_at",
    )
    .is("deleted_at", null)
    // Pending-review AI leads live in the admin review queue (/crm/ai-review)
    // until released — they must not leak into Companies before that. Written
    // as an OR (rather than .neq) so NULL ai_status rows (every non-AI
    // company) still pass: `column <> value` in SQL is NULL, not true, for
    // NULL columns, which would silently hide every ordinary company.
    .or("ai_status.is.null,ai_status.neq.pending_review");

  if (stage) query = query.eq("lifecycle_status", stage);
  if (rep === "unassigned") query = query.is("assigned_user_id", null);
  else if (rep) query = query.eq("assigned_user_id", rep);

  const ts = q ? toPrefixQuery(q) : "";
  if (ts) query = query.textSearch("search_tsv", ts, { config: "simple" });

  const { data } = await query.order("created_at", { ascending: false }).limit(200);
  const accounts = (data ?? []) as AccountRow[];

  // Stitch in primary-contact names and tags for the visible rows.
  const accountIds = accounts.map((a) => a.id);
  const primaryIds = [
    ...new Set(accounts.map((a) => a.primary_contact_id).filter(Boolean) as string[]),
  ];

  const [primaryRes, tagLinkRes, lastCallsRes, lastActivitiesRes] = await Promise.all([
    primaryIds.length
      ? supabase.from("crm_contacts").select("id, name").in("id", primaryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    accountIds.length
      ? supabase
          .from("crm_account_tags")
          .select("account_id, tag_id")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as { account_id: string; tag_id: string }[] }),
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
          .order("occurred_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] as { account_id: string; occurred_at: string }[] }),
  ]);

  const primaryName = new Map(
    ((primaryRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  const tagsByAccount = new Map<string, CrmTag[]>();
  for (const link of (tagLinkRes.data ?? []) as {
    account_id: string;
    tag_id: string;
  }[]) {
    const t = tagById.get(link.tag_id);
    if (!t) continue;
    const list = tagsByAccount.get(link.account_id) ?? [];
    list.push(t);
    tagsByAccount.set(link.account_id, list);
  }

  // Last-contact — the more recent of the account's last logged call and its
  // last timeline activity (a call already lands in crm_activities too, but a
  // note/stage-change/contact-add with no call should still count as contact).
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

  if (sortStale) {
    // Coldest (or never-contacted) first, so stale accounts surface at the
    // top rather than requiring a scroll through everything else.
    accounts.sort((a, b) => {
      const am = lastContactMsByAccount.get(a.id) ?? -Infinity;
      const bm = lastContactMsByAccount.get(b.id) ?? -Infinity;
      return am - bm;
    });
  }

  const filtersActive = Boolean(q || stage || rep);
  const sortHref = (() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    if (rep) params.set("rep", rep);
    if (!sortStale) params.set("sort", "stale");
    const qs = params.toString();
    return qs ? `/crm/accounts?${qs}` : "/crm/accounts";
  })();

  return (
    <PageShell
      actions={
        <>
          <AddCompany reps={reps} />
          <AddContactDialog companies={companyOptions} />
        </>
      }
    >
      <Card className="p-4">
        <AccountsFilters q={q} stage={stage} rep={rep} reps={reps} />
      </Card>

      <Card>
        {accounts.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={<IconCompanies />}
              title="No companies match"
              body="Try a different search or clear the filters to see every company."
            />
          ) : (
            <EmptyState
              icon={<IconCompanies />}
              title="No companies yet"
              body="Add your first carrier or shipper to start building your pipeline."
              action={<AddCompany reps={reps} />}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13.5px]">
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th className="px-5 py-2 font-semibold">Company</th>
                  <th className="px-5 py-2 font-semibold">Stage</th>
                  <th className="px-5 py-2 font-semibold">Location</th>
                  <th className="px-5 py-2 font-semibold">Primary contact</th>
                  <th className="px-5 py-2 font-semibold">
                    <Link
                      href={sortHref}
                      prefetch={false}
                      className="inline-flex items-center gap-1 hover:text-fg"
                      title={sortStale ? "Showing coldest first" : "Sort by last contact"}
                    >
                      Last contact{sortStale ? " ↑" : ""}
                    </Link>
                  </th>
                  <th className="px-5 py-2 font-semibold">Tags</th>
                </tr>
              </thead>
              <tbody className={ZEBRA_ROWS}>
                {accounts.map((a) => {
                  const stageValue = a.lifecycle_status;
                  const location = [titleCaseWords(a.city), upperCaseState(a.state)]
                    .filter(Boolean)
                    .join(", ");
                  const contact = a.primary_contact_id
                    ? primaryName.get(a.primary_contact_id)
                    : null;
                  const rowTags = tagsByAccount.get(a.id) ?? [];
                  return (
                    <ClickableRow
                      key={a.id}
                      href={`/crm/accounts/${a.id}`}
                      className="border-b border-line-strong last:border-0"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/crm/accounts/${a.id}`}
                          prefetch={false}
                          className="font-semibold text-fg hover:text-accent"
                        >
                          {titleCaseWords(a.name)}
                        </Link>
                        {a.industry && (
                          <div className="text-[12px] text-fg-subtle">{a.industry}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(stageValue)}`}
                        >
                          {stageLabel(stageValue)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-fg-muted">{location || "—"}</td>
                      <td className="px-5 py-3 text-fg-muted">
                        {contact ? titleCaseWords(contact) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <LastContactBadge ms={lastContactMsByAccount.get(a.id) ?? null} />
                      </td>
                      <td className="px-5 py-3">
                        {rowTags.length ? (
                          <div className="flex flex-wrap gap-1">
                            {rowTags.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center gap-1 rounded-full border border-line bg-inset py-0.5 pl-1.5 pr-2 text-[11.5px] font-medium text-fg"
                              >
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: t.color || "var(--fg-subtle)" }}
                                />
                                {t.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}

/** Freshness tiers use the CRM's fixed status tints (never theme-dependent
 *  grey) so a cold or never-contacted company reads as an alert, not a
 *  quiet label — "fresh" is plain readable text since there's nothing to
 *  flag. */
const FRESHNESS_CLASS: Record<"aging" | "cold" | "never", string> = {
  aging: "bg-warn-bg text-warn",
  cold: "bg-bad-bg text-bad",
  never: "bg-bad-bg text-bad",
};

function LastContactBadge({ ms }: { ms: number | null }) {
  const { text, freshness } = lastContactStatus(ms);

  if (freshness === "fresh") {
    return <span className="text-[13px] font-medium text-fg-muted">{text}</span>;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${FRESHNESS_CLASS[freshness]}`}
    >
      {text}
    </span>
  );
}
