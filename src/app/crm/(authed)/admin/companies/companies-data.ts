import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { initialsOf } from "../../_shell/format";
import { lastContactByAccount } from "@/lib/crm/lastContact";
import { primaryContactByAccount } from "@/lib/crm/primaryContact";
import type { CompanyRow } from "./companyRow";

/**
 * Server-side read for Admin → Companies — every crm_accounts row in the org,
 * whoever owns it.
 *
 * NO agent visibility gate. _shell/unclaimedCompanies.ts's CLAIMED_COMPANIES_OR_FILTER
 * exists to hide unclaimed work from agents; applying it here would hide from
 * the admin exactly the rows this screen is for. That is a deliberate
 * difference, not an oversight.
 *
 * LAST CONTACT is the EXISTING definition, lifted from accounts/page.tsx
 * rather than re-derived: the later of the account's last logged call and its
 * last CONTACT-kind activity, where "contact kind" is
 * CRM_CONTACT_ACTIVITY_KINDS. That filter is what stops an AI-research run or
 * a record-created event reading as "someone talked to them". A second
 * definition of "last activity" is exactly the drift the audits keep finding.
 */

export type CompanyAgent = { id: string; name: string; initials: string };

export type CompaniesData = {
  rows: CompanyRow[];
  agents: CompanyAgent[];
};


export async function getCompaniesData(): Promise<CompaniesData> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: accountData } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, assigned_user_id, source, lifecycle_status, phone, primary_contact_id")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const accounts = accountData ?? [];
  const accountIds = accounts.map((a) => a.id as string);

  const [profilesRes, tasksRes] = await Promise.all([
    supabase
      .from("crm_profiles")
      .select("id, full_name, email")
      .eq("org_id", user.orgId)
      .eq("is_active", true),

    supabase
      .from("crm_tasks")
      .select("account_id")
      .eq("status", "open")
      .is("deleted_at", null)
      .not("account_id", "is", null),
  ]);

  const nameByUser = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    const name = ((p.full_name as string | null) ?? "").trim() || ((p.email as string | null) ?? "") || "Unnamed";
    nameByUser.set(p.id as string, name);
  }

  // Last contact — the shared definition (lib/crm/lastContact.ts).
  const lastContactMsByAccount = await lastContactByAccount(supabase, accountIds);

  /** WHO TO CALL, from the one shared definition (lib/crm/primaryContact).
   * The phone list needs a person's name and number per company: only 23 of
   * 99 companies have a number of their own, while 25 more have a contact
   * who does — so naming the contact roughly doubles what is callable. */
  const primaryByAccount = await primaryContactByAccount(
    supabase,
    accountIds,
    new Map(
      accounts
        .filter((a) => a.primary_contact_id)
        .map((a) => [a.id as string, a.primary_contact_id as string]),
    ),
  );

  const openWorkByAccount = new Map<string, number>();
  for (const t of tasksRes.data ?? []) {
    const id = t.account_id as string | null;
    if (id) openWorkByAccount.set(id, (openWorkByAccount.get(id) ?? 0) + 1);
  }

  const rows: CompanyRow[] = accounts.map((a) => {
    const ownerId = (a.assigned_user_id as string | null) ?? null;
    return {
      id: a.id as string,
      name: (a.name as string) || "Unnamed company",
      city: (a.city as string | null) ?? null,
      state: (a.state as string | null) ?? null,
      ownerId,
      ownerName: ownerId ? (nameByUser.get(ownerId) ?? "Former teammate") : null,
      source: (a.source as string | null) ?? null,
      stage: (a.lifecycle_status as string | null) ?? null,
      lastContactMs: lastContactMsByAccount.get(a.id as string) ?? null,
      contactName: primaryByAccount.get(a.id as string)?.name ?? null,
      // The company's own line first, then the person's — same precedence
      // the company profile uses, so the number here is the number there.
      callPhone:
        ((a.phone as string | null) || null) ??
        primaryByAccount.get(a.id as string)?.phone ??
        null,
      openWork: openWorkByAccount.get(a.id as string) ?? 0,
    };
  });

  const agents: CompanyAgent[] = (profilesRes.data ?? [])
    .map((p) => {
      const name = ((p.full_name as string | null) ?? "").trim() || ((p.email as string | null) ?? "") || "Unnamed";
      return { id: p.id as string, name, initials: initialsOf(name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { rows, agents };
}
