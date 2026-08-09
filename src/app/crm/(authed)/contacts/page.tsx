import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState, LIST_HEAD_ROW, ZEBRA_ROWS } from "../_shell/ui";
import { ClickableRow } from "../_shell/ClickableRow";
import { IconContacts } from "../_shell/icons";
import { firstName } from "../_shell/format";
import { DueCountdown } from "../_shell/DueCountdown";
import { formatPhone } from "@/lib/domain/phone";
import { titleCaseWords } from "../_shell/format";
import { ContactsSearch } from "./ContactsSearch";
import { AddContactDialog } from "./AddContactDialog";
import { ContactRowActions } from "./ContactRowActions";
import type { CompanyOption } from "./CompanyCombobox";
import { AddCompany } from "../accounts/AddCompany";
import type { RepOption } from "../accounts/CompanyDialog";

export const dynamic = "force-dynamic";

type ContactRow = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  extension: string | null;
  is_decision_maker: boolean;
  next_followup_at: string | null;
  account_id: string | null;
};

/**
 * PostgREST parses `.or()` as a comma-separated list, so a raw user string
 * containing , ( ) . or an ilike wildcard (% _ \) would corrupt the filter.
 * All become spaces — a name/email/title is letters, digits and the usual
 * separators, so nothing searchable is lost.
 */
function sanitize(q: string): string {
  return q.replace(/[,()%_\\*."':]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Global Contacts — every contact across the caller's org in one directory,
 * each linked back to its company. RLS-scoped to the org (no dispatch table is
 * ever touched). Search matches name / email / title / phone via ilike.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const safe = sanitize(q);

  let query = supabase
    .from("crm_contacts")
    .select(
      "id, name, title, email, phone, mobile, extension, is_decision_maker, next_followup_at, account_id",
    )
    .is("deleted_at", null);

  if (safe.length >= 1) {
    const like = `%${safe}%`;
    query = query.or(
      [
        `name.ilike.${like}`,
        `email.ilike.${like}`,
        `title.ilike.${like}`,
        `phone.ilike.${like}`,
        `mobile.ilike.${like}`,
      ].join(","),
    );
  }

  const { data } = await query.order("name", { ascending: true }).limit(300);
  // Title-cased once here, right at the read boundary, so pre-existing
  // not-quite-capitalized data displays clean too (new writes are already
  // clean via contacts/actions.ts and accounts/actions.ts).
  const contacts = ((data ?? []) as ContactRow[]).map((c) => ({
    ...c,
    name: titleCaseWords(c.name),
  }));

  // Resolve each contact's company name for the "Company" column.
  const accountIds = [
    ...new Set(contacts.map((c) => c.account_id).filter(Boolean) as string[]),
  ];
  const { data: accountsData } = accountIds.length
    ? await supabase.from("crm_accounts").select("id, name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };
  const accountName = new Map(
    ((accountsData ?? []) as { id: string; name: string }[]).map((a) => [
      a.id,
      titleCaseWords(a.name),
    ]),
  );

  // The full org roster (id/name only) for the "Add contact" dialog's company
  // combobox — fetched once here and handed down as plain data so the client
  // component can autocomplete locally instead of round-tripping per keystroke.
  const { data: companyOptionsData } = await supabase
    .from("crm_accounts")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  const companyOptions = (companyOptionsData ?? []) as CompanyOption[];

  // The active rep roster for the "Add company" dialog's assigned-rep select.
  const { data: profilesData } = await supabase
    .from("crm_profiles")
    .select("id, full_name, email, is_active");
  const profiles = (profilesData ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    is_active: boolean;
  }[];
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: firstName(p.full_name, p.email) || "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const searching = q.length > 0;

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
        <ContactsSearch q={q} />
      </Card>

      <Card>
        {contacts.length === 0 ? (
          <EmptyState
            icon={<IconContacts />}
            title={searching ? "No contacts match" : "No contacts yet"}
            body={
              searching
                ? "Try a different search, or clear it to see every contact."
                : "Add your first contact above, or from any company profile."
            }
            action={searching ? undefined : <AddContactDialog companies={companyOptions} />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13.5px]">
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th className="px-5 py-2 font-semibold">Contact</th>
                  <th className="px-5 py-2 font-semibold">Company</th>
                  <th className="px-5 py-2 font-semibold">Email</th>
                  <th className="px-5 py-2 font-semibold">Phone</th>
                  <th className="px-5 py-2 font-semibold">Follow-up</th>
                  <th className="px-5 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className={ZEBRA_ROWS}>
                {contacts.map((c) => {
                  const company = c.account_id ? accountName.get(c.account_id) : null;
                  const cells = (
                    <>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg">{c.name}</span>
                          {c.is_decision_maker && (
                            <span className="bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                              Decision-maker
                            </span>
                          )}
                        </div>
                        {c.title && (
                          <div className="text-[12px] text-fg-subtle">{c.title}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {c.account_id && company ? (
                          <Link
                            href={`/crm/accounts/${c.account_id}`}
                            prefetch={false}
                            className="text-fg-muted hover:text-accent"
                          >
                            {company}
                          </Link>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="text-accent hover:underline"
                          >
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-fg-muted">
                        {c.phone || c.mobile ? (
                          <>
                            {formatPhone(c.phone || c.mobile)}
                            {c.phone && c.extension ? ` ×${c.extension}` : ""}
                          </>
                        ) : (
                          <span className="font-sans text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {c.next_followup_at ? (
                          <DueCountdown iso={c.next_followup_at} />
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <ContactRowActions
                          accountId={c.account_id}
                          contactId={c.id}
                          contactName={c.name}
                        />
                      </td>
                    </>
                  );

                  // Only navigate when the contact has a company to open —
                  // there's no standalone contact profile page to fall back to.
                  return c.account_id ? (
                    <ClickableRow
                      key={c.id}
                      href={`/crm/accounts/${c.account_id}`}
                      className="border-b border-line-strong last:border-0"
                    >
                      {cells}
                    </ClickableRow>
                  ) : (
                    <tr
                      key={c.id}
                      className="border-b border-line-strong last:border-0 transition-colors hover:bg-fg/[0.04]"
                    >
                      {cells}
                    </tr>
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
