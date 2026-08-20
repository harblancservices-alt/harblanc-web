import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import { IconContacts } from "../_shell/icons";
import { firstName, titleCaseWords } from "../_shell/format";
import { ContactsSearch } from "./ContactsSearch";
import { AddContactDialog } from "./AddContactDialog";
import { ContactListCard, type ContactCardData } from "./ContactListCard";
import { ContactTable } from "./ContactTable";
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
  role_category: string | null;
  last_contacted_at: string | null;
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
 * rebuilt into the same mobile-first card grid as the Companies list
 * (CompanyListCard.tsx), each linked to its own profile (surface 4) rather
 * than the old table's "only navigate if there's a company" fallback — every
 * contact has a real detail page now, company or not. RLS-scoped to the org.
 * Search matches name / email / title / phone via ilike.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dm?: string }>;
}) {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const safe = sanitize(q);
  // Dashboard's "Decision Makers" counter tile deep-links here with dm=1 —
  // the org-wide filtered view the recommendations audit called for
  // (crm_contacts.is_decision_maker already exists and is already badged on
  // every card below; this just adds a way to see ONLY those at once).
  const decisionMakersOnly = sp.dm === "1";

  let query = supabase
    .from("crm_contacts")
    .select(
      "id, name, title, email, phone, mobile, extension, is_decision_maker, next_followup_at, account_id, role_category, last_contacted_at",
    )
    .is("deleted_at", null);

  if (decisionMakersOnly) query = query.eq("is_decision_maker", true);

  if (safe.length >= 1) {
    const like = `%${safe}%`;
    query = query.or(
      [`name.ilike.${like}`, `email.ilike.${like}`, `title.ilike.${like}`, `phone.ilike.${like}`, `mobile.ilike.${like}`].join(","),
    );
  }

  const { data } = await query.order("name", { ascending: true }).limit(300);
  const contacts = ((data ?? []) as ContactRow[]).map((c) => ({ ...c, name: titleCaseWords(c.name) }));

  const accountIds = [...new Set(contacts.map((c) => c.account_id).filter(Boolean) as string[])];
  const { data: accountsData } = accountIds.length
    ? await supabase.from("crm_accounts").select("id, name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };
  const accountName = new Map(((accountsData ?? []) as { id: string; name: string }[]).map((a) => [a.id, titleCaseWords(a.name)]));

  const { data: companyOptionsData } = await supabase
    .from("crm_accounts")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  const companyOptions = (companyOptionsData ?? []) as CompanyOption[];

  const { data: profilesData } = await supabase.from("crm_profiles").select("id, full_name, email, is_active");
  const profiles = (profilesData ?? []) as { id: string; full_name: string | null; email: string | null; is_active: boolean }[];
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: firstName(p.full_name, p.email) || "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const searching = q.length > 0;

  const cards: ContactCardData[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    email: c.email,
    phone: c.phone || c.mobile,
    extension: c.phone ? c.extension : null,
    isDecisionMaker: c.is_decision_maker,
    nextFollowupAt: c.next_followup_at,
    accountId: c.account_id,
    companyName: c.account_id ? accountName.get(c.account_id) ?? null : null,
    roleCategory: c.role_category,
    lastContactedAt: c.last_contacted_at,
  }));

  return (
    <PageShell
      title="Contacts"
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

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconContacts />}
            title={searching ? "No contacts match" : "No contacts yet"}
            body={searching ? "Try a different search, or clear it to see every contact." : "Add your first contact above, or from any company profile."}
            action={searching ? undefined : <AddContactDialog companies={companyOptions} />}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:hidden">
            {cards.map((c) => (
              <ContactListCard key={c.id} contact={c} />
            ))}
          </div>

          <Card className="hidden md:block">
            <CardHead title="Contacts" hint={`${cards.length} ${cards.length === 1 ? "contact" : "contacts"}`} />
            <div className="overflow-x-auto">
              <ContactTable contacts={cards} />
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
