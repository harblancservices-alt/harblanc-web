import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState, LIST_HEAD_ROW, ZEBRA_ROWS } from "../_shell/ui";
import { ClickableRow } from "../_shell/ClickableRow";
import { IconCompanies } from "../_shell/icons";
import { AddCompany } from "./AddCompany";
import { AccountsFilters } from "./AccountsFilters";
import { stageLabel, stageTone } from "./lifecycle";
import { firstName } from "../_shell/format";
import type { RepOption } from "./CompanyDialog";
import type { CrmTag } from "./tags";

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
 * lifecycle / tag / rep filters, all driven from the URL so any view is
 * shareable. Each row shows the company, lifecycle badge, city/state, primary
 * contact, and its tags.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; tag?: string; rep?: string }>;
}) {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const stage = (sp.stage ?? "").trim();
  const tag = (sp.tag ?? "").trim();
  const rep = (sp.rep ?? "").trim();

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

  // A tag filter narrows to the accounts carrying that tag (pre-resolved to ids).
  let tagAccountIds: string[] | null = null;
  if (tag) {
    const { data: links } = await supabase
      .from("crm_account_tags")
      .select("account_id")
      .eq("tag_id", tag);
    tagAccountIds = ((links ?? []) as { account_id: string }[]).map((r) => r.account_id);
  }

  let accounts: AccountRow[] = [];
  // If a tag filter matched nothing, skip the query entirely (empty result).
  if (!(tagAccountIds && tagAccountIds.length === 0)) {
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
    if (tagAccountIds) query = query.in("id", tagAccountIds);

    const ts = q ? toPrefixQuery(q) : "";
    if (ts) query = query.textSearch("search_tsv", ts, { config: "simple" });

    const { data } = await query
      .order("created_at", { ascending: false })
      .limit(200);
    accounts = (data ?? []) as AccountRow[];
  }

  // Stitch in primary-contact names and tags for the visible rows.
  const accountIds = accounts.map((a) => a.id);
  const primaryIds = [
    ...new Set(accounts.map((a) => a.primary_contact_id).filter(Boolean) as string[]),
  ];

  const [primaryRes, tagLinkRes] = await Promise.all([
    primaryIds.length
      ? supabase.from("crm_contacts").select("id, name").in("id", primaryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    accountIds.length
      ? supabase
          .from("crm_account_tags")
          .select("account_id, tag_id")
          .in("account_id", accountIds)
      : Promise.resolve({ data: [] as { account_id: string; tag_id: string }[] }),
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

  const filtersActive = Boolean(q || stage || tag || rep);

  return (
    <PageShell actions={<AddCompany reps={reps} />}>
      <Card className="p-4">
        <AccountsFilters
          q={q}
          stage={stage}
          tag={tag}
          rep={rep}
          tags={allTags}
          reps={reps}
        />
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
            <table className="w-full min-w-[720px] text-left text-[13.5px]">
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Stage</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Primary contact</th>
                  <th className="px-5 py-3 font-semibold">Tags</th>
                </tr>
              </thead>
              <tbody className={ZEBRA_ROWS}>
                {accounts.map((a) => {
                  const stageValue = a.lifecycle_status;
                  const location = [a.city, a.state].filter(Boolean).join(", ");
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
                          {a.name}
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
                        {contact || <span className="text-fg-subtle">—</span>}
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
