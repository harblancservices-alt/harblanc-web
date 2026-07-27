import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState } from "../_shell/ui";
import { IconContacts } from "../_shell/icons";
import { formatDateTime } from "../_shell/format";
import { ContactsSearch } from "./ContactsSearch";

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
  const contacts = (data ?? []) as ContactRow[];

  // Resolve each contact's company name for the "Company" column.
  const accountIds = [
    ...new Set(contacts.map((c) => c.account_id).filter(Boolean) as string[]),
  ];
  const { data: accountsData } = accountIds.length
    ? await supabase.from("crm_accounts").select("id, name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };
  const accountName = new Map(
    ((accountsData ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
  );

  const searching = q.length > 0;

  return (
    <PageShell
      eyebrow="People"
      title="Contacts"
      subtitle={
        contacts.length
          ? `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}${searching ? " matched" : ""}`
          : "Decision-makers across your companies."
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
                : "Add contacts from any company profile — they'll all show up here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  <th className="px-5 py-3 font-semibold">Contact</th>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => {
                  const company = c.account_id ? accountName.get(c.account_id) : null;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-line last:border-0 transition-colors hover:bg-inset"
                    >
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg">{c.name}</span>
                          {c.is_decision_maker && (
                            <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
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
                            {c.phone || c.mobile}
                            {c.phone && c.extension ? ` ×${c.extension}` : ""}
                          </>
                        ) : (
                          <span className="font-sans text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-fg-muted">
                        {c.next_followup_at ? (
                          formatDateTime(c.next_followup_at)
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
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
