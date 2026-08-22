import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { firstName, titleCaseWords } from "../_shell/format";
import { AddContactDialog } from "./AddContactDialog";
import { ContactsDirectory } from "./ContactsDirectory";
import type { ContactCardData } from "./ContactListCard";
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
  current_mood: string | null;
};

/**
 * Global Contacts — every contact across the caller's org in one directory.
 *
 * 2026-08-22 rebuild (Brent approved the mockup): this page is now a PURE
 * DATA LOADER. It fetches the org's contacts once, whole, and hands them to
 * ContactsDirectory, which does all the searching, chip filtering, grouping,
 * and sorting on the client — so search narrows the list as you type instead
 * of the old Search-button round trip. That's viable because the directory
 * is ~61 rows today and hard-capped at 1000 below; if it ever outgrows that,
 * server-side filtering comes back, not a bigger client payload.
 *
 * Only serializable props cross the RSC boundary (plain arrays of plain
 * objects — no callbacks, no component props). This area has crashed on
 * exactly that mistake before; see the CRM RSC trigger-boundary rule.
 *
 * `?q=` and `?dm=1` are still honoured as SEEDS for the client state so the
 * dashboard's "Decision Makers" tile deep-link and any bookmarked search URL
 * keep working — the filtering itself no longer happens here.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dm?: string }>;
}) {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const sp = await searchParams;
  const initialQuery = (sp.q ?? "").trim();
  // "Decision Makers" is crm_contacts.is_decision_maker, full stop — the same
  // column the dashboard's Decision Makers counter tile counts
  // (crm/(authed)/page.tsx) before deep-linking here with ?dm=1. The chip in
  // the toolbar filters on the identical flag; there is no second definition.
  const initialDecisionMakers = sp.dm === "1";

  const { data } = await supabase
    .from("crm_contacts")
    .select(
      "id, name, title, email, phone, mobile, extension, is_decision_maker, next_followup_at, account_id, role_category, last_contacted_at, current_mood",
    )
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);

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
    currentMood: c.current_mood,
  }));

  return (
    <PageShell
      title="Contacts"
      subtitle={`${cards.length} contact${cards.length === 1 ? "" : "s"} across every company.`}
      actions={
        <>
          <AddCompany reps={reps} />
          <AddContactDialog companies={companyOptions} />
        </>
      }
    >
      <ContactsDirectory
        contacts={cards}
        companies={companyOptions}
        initialQuery={initialQuery}
        initialDecisionMakers={initialDecisionMakers}
      />
    </PageShell>
  );
}
