import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { timestampMs } from "../../_shell/format";

/**
 * Server-side read for Admin → Contacts — every crm_contacts row in the org,
 * whoever owns the company behind it.
 *
 * NO VISIBILITY GATE, deliberately, exactly like its sibling
 * ../companies/companies-data.ts. _shell/companyVisibility.ts exists to keep
 * an agent inside their own book; applying it on the admin surface would hide
 * from the admin the very rows this screen is for. The gate is
 * requireCrmAdmin() on the section layout instead.
 *
 * LAST ACTIVITY is the EXISTING definition, lifted rather than re-derived:
 * the later of the CONTACT's own last logged call and its last CONTACT-kind
 * activity. CRM_CONTACT_ACTIVITY_KINDS is what stops an AI-research run or a
 * record-created event reading as "someone talked to them". Note this is the
 * PER-CONTACT clock, not the company's — the company column shows who owns
 * the account, and a company can be warm while one of its contacts has never
 * been reached.
 */

export type AdminContactRow = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isDecisionMaker: boolean;
  /** crm_contacts.account_id — null when the contact has no company at all. */
  accountId: string | null;
  companyName: string | null;
  /** Display name of the company's owner, or null when nobody owns it. */
  ownerName: string | null;
  /** Epoch ms of this contact's most recent real human contact, or null. */
  lastContactMs: number | null;
};

export type AdminContactsData = {
  rows: AdminContactRow[];
  /** Every ACTIVE member's display name, so the filter row can show a person
   * with zero contacts rather than omitting them — same reasoning as Admin →
   * Companies' per-agent tabs: "nobody has given Brent anything" is
   * information, and a tab that vanishes at zero hides it. */
  ownerNames: string[];
};

export async function getAdminContactsData(): Promise<AdminContactsData> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [contactsRes, accountsRes, profilesRes] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id, name, title, email, phone, mobile, is_decision_maker, account_id")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(2000),
    supabase
      .from("crm_accounts")
      .select("id, name, assigned_user_id")
      .is("deleted_at", null)
      .limit(5000),
    supabase
      .from("crm_profiles")
      .select("id, full_name, email")
      .eq("org_id", user.orgId)
      .eq("is_active", true),
  ]);

  const contacts = contactsRes.data ?? [];
  const contactIds = contacts.map((c) => c.id as string);

  const [callsRes, activitiesRes] = contactIds.length
    ? await Promise.all([
        supabase
          .from("crm_calls")
          .select("contact_id, occurred_at")
          .in("contact_id", contactIds)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(3000),
        supabase
          .from("crm_activities")
          .select("contact_id, occurred_at")
          .in("contact_id", contactIds)
          .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
          .order("occurred_at", { ascending: false })
          .limit(3000),
      ])
    : [
        { data: [] as { contact_id: string; occurred_at: string }[] },
        { data: [] as { contact_id: string; occurred_at: string }[] },
      ];

  const nameByUser = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    const name =
      ((p.full_name as string | null) ?? "").trim() || ((p.email as string | null) ?? "") || "Unnamed";
    nameByUser.set(p.id as string, name);
  }

  const account = new Map(
    (accountsRes.data ?? []).map((a) => [
      a.id as string,
      {
        name: (a.name as string) || "Unnamed company",
        ownerId: (a.assigned_user_id as string | null) ?? null,
      },
    ]),
  );

  // Reduced to a single MAX(occurred_at) per contact.
  const lastContactMsByContact = new Map<string, number>();
  for (const r of [...(callsRes.data ?? []), ...(activitiesRes.data ?? [])]) {
    const id = r.contact_id as string | null;
    if (!id) continue;
    const ms = timestampMs(r.occurred_at as string);
    if (ms === null) continue;
    const current = lastContactMsByContact.get(id);
    if (current === undefined || ms > current) lastContactMsByContact.set(id, ms);
  }

  const rows: AdminContactRow[] = contacts.map((c) => {
    const accountId = (c.account_id as string | null) ?? null;
    const acc = accountId ? account.get(accountId) : undefined;
    return {
      id: c.id as string,
      name: (c.name as string) || "Unnamed contact",
      title: (c.title as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: ((c.phone as string | null) || (c.mobile as string | null)) ?? null,
      isDecisionMaker: Boolean(c.is_decision_maker),
      accountId,
      // A contact can point at a company that has since been deleted; that is
      // worth SEEING on the admin screen rather than silently showing blank,
      // so it reads as "no company" the same as a genuinely unlinked one and
      // the Unlinked filter finds both.
      companyName: acc?.name ?? null,
      ownerName: acc?.ownerId ? (nameByUser.get(acc.ownerId) ?? "Former teammate") : null,
      lastContactMs: lastContactMsByContact.get(c.id as string) ?? null,
    };
  });

  return { rows, ownerNames: [...nameByUser.values()].sort((a, b) => a.localeCompare(b)) };
}
