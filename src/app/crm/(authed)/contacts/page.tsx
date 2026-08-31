import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import {
  getCompanyVisibility,
  getVisibleAccountIds,
  applyCompanyVisibility,
} from "../_shell/companyVisibility";
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
  starred_at: string | null;
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
  searchParams: Promise<{ q?: string; dm?: string; starred?: string }>;
}) {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  // SCOPED TO THE COMPANIES YOU OWN (Brent, 2026-08-25). Same rule and same
  // module as the Companies list — a contact belongs to a company, so who may
  // see the contact follows who may see the company. `null` means "don't
  // narrow", which is how an unrestricted caller still gets the whole
  // directory. The org-wide view lives at /crm/admin/contacts, owner-gated.
  const visibility = await getCompanyVisibility(user);
  const visibleAccountIds = await getVisibleAccountIds(visibility);

  const sp = await searchParams;
  const initialQuery = (sp.q ?? "").trim();
  // "Decision Makers" is crm_contacts.is_decision_maker, full stop — the same
  // column the dashboard's Decision Makers counter tile counts
  // (crm/(authed)/page.tsx) before deep-linking here with ?dm=1. The chip in
  // the toolbar filters on the identical flag; there is no second definition.
  const initialDecisionMakers = sp.dm === "1";

  let contactsQuery = supabase
    .from("crm_contacts")
    .select(
      "id, name, title, email, phone, mobile, extension, is_decision_maker, next_followup_at, account_id, role_category, last_contacted_at, current_mood, starred_at",
    )
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  // A contact whose company is one you can't see is one you can't see. A
  // contact with NO company has no company to inherit visibility from, so it
  // is out too — .in() never matches a null account_id. Those surface on
  // Admin -> Contacts.
  /* ── THE ONE DELIBERATE WIDENING, AND WHY IT IS NOT A LEAK ──────────
   *
   * Brent, 2026-08-31, on the Favourites view: "Admins see every star
   * across the org."
   *
   * That collides with a rule set on 2026-08-25 and written up in
   * companyVisibility.ts: ROLE IS NOT PART OF THE AGENT-FACING VISIBILITY
   * RULE. Both owners currently have can_view_all_companies FALSE — that
   * is deliberate, so Kartik sees every company under /crm/admin and only
   * his own in the workspace. Under the plain rule an owner opening
   * Favourites would see stars on three companies, which is not what was
   * asked for.
   *
   * Resolved narrowly rather than by weakening the rule: the widening
   * applies ONLY when the starred filter is on, ONLY for role === 'owner',
   * and it is enforced HERE in the loader rather than by hiding rows in
   * the client — the standing rule after the Activity exposure. Every
   * other view on this page, for every caller including an owner, still
   * goes through getVisibleAccountIds untouched. RLS still scopes to the
   * caller's org, so "org-wide" means their org and no further.
   *
   * A member's Favourites shows the starred people on the companies they
   * can already see, which is the correct answer for them. */
  const starredOnly = sp.starred === "1";
  const orgWideStars = starredOnly && user.role === "owner";
  if (starredOnly) contactsQuery = contactsQuery.not("starred_at", "is", null);
  if (visibleAccountIds !== null && !orgWideStars) {
    contactsQuery = contactsQuery.in("account_id", visibleAccountIds);
  }
  const { data } = await contactsQuery;

  const contacts = ((data ?? []) as ContactRow[]).map((c) => ({ ...c, name: titleCaseWords(c.name) }));

  const accountIds = [...new Set(contacts.map((c) => c.account_id).filter(Boolean) as string[])];
  const { data: accountsData } = accountIds.length
    ? await supabase.from("crm_accounts").select("id, name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };
  const accountName = new Map(((accountsData ?? []) as { id: string; name: string }[]).map((a) => [a.id, titleCaseWords(a.name)]));

  // The Add-contact / Add-company dialogs' company picker, narrowed the same
  // way — offering a company you can't otherwise see would be a way around
  // the filter above.
  let companyOptionsQuery = supabase
    .from("crm_accounts")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  companyOptionsQuery = applyCompanyVisibility(companyOptionsQuery, visibility);
  const { data: companyOptionsData } = await companyOptionsQuery;
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
    starred: (c as { starred_at?: string | null }).starred_at != null,
  }));

  return (
    <PageShell
      title="Contacts"
      subtitle={
        starredOnly
          ? `${cards.length} ${cards.length === 1 ? "person" : "people"} who get freight moved${
              orgWideStars ? ", across every company in the org." : "."
            }`
          : visibility.restricted
            ? `${cards.length} contact${cards.length === 1 ? "" : "s"} at the companies you own.`
            : `${cards.length} contact${cards.length === 1 ? "" : "s"} across every company.`
      }
      // Add contact leads here, Add company leads on /crm/accounts — each
      // page's primary creates the thing that page is about. These two were
      // the wrong way round: Contacts led with "Add company" while Companies
      // had no company action at all. Both are kept on both pages, because
      // the cross-link is genuinely useful; only the order changed.
      actions={
        <>
          <AddContactDialog companies={companyOptions} />
          <AddCompany reps={reps} variant="secondary" />
        </>
      }
    >
      <ContactsDirectory
        contacts={cards}
        companies={companyOptions}
        restricted={visibility.restricted}
        initialQuery={initialQuery}
        initialDecisionMakers={initialDecisionMakers}
        initialStarred={starredOnly}
        orgWideStars={orgWideStars}
      />
    </PageShell>
  );
}
