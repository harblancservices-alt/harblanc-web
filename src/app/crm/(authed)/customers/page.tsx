import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import { IconCustomers } from "../_shell/icons";
import { firstName, titleCaseWords, upperCaseState, timestampMs } from "../_shell/format";
import { parsePhones } from "../_shell/contactFields";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { CustomerListCard, type CustomerCardData } from "./CustomerListCard";
import { CustomerTable } from "./CustomerTable";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  commodities: string | null;
  assigned_user_id: string | null;
  phone: string | null;
  phones: unknown;
};

type ContactRow = {
  id: string;
  account_id: string;
  name: string;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  is_decision_maker: boolean;
};

/**
 * Active Customers — every crm_account marked lifecycle_status='customer'
 * via the profile's chevron stage tracker (accounts/[id]/StageTracker.tsx →
 * updateLifecycleStatus). Purely a read view: there is no write path here —
 * moving a company in or out of this list is done on its profile, which
 * already exists. Visible to every CRM user, org-scoped by RLS. Sorted
 * alphabetically, since this is a directory to scan for a specific customer
 * rather than a work queue like the dashboard.
 *
 * Rebuilt onto the same CompanyListCard/CompanyTable-style responsive
 * treatment as Companies/Contacts: mobile card grid, desktop table with a
 * real column-header row. Last-contact uses the identical crm_calls +
 * crm_activities(CRM_CONTACT_ACTIVITY_KINDS) rollup Companies already computes,
 * so "recently contacted" means the same thing everywhere in the CRM.
 */
export default async function ActiveCustomersPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, industry, commodities, assigned_user_id, phone, phones")
    .eq("lifecycle_status", "customer")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);

  const accounts = ((data ?? []) as AccountRow[]).map((a) => ({
    ...a,
    name: titleCaseWords(a.name),
    city: titleCaseWords(a.city) || null,
    state: upperCaseState(a.state) || null,
  }));
  const ids = accounts.map((a) => a.id);

  const assigneeIds = [...new Set(accounts.map((a) => a.assigned_user_id).filter(Boolean) as string[])];

  const [contactsRes, profilesRes, lastCallsRes, lastActivitiesRes] = await Promise.all([
    ids.length
      ? supabase
          .from("crm_contacts")
          .select("id, account_id, name, title, phone, mobile, is_decision_maker")
          .in("account_id", ids)
          .is("deleted_at", null)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as ContactRow[] }),
    assigneeIds.length
      ? supabase.from("crm_profiles").select("id, full_name, email").in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    // Last-contact rollup — identical shape to accounts/page.tsx's Companies
    // list, so "recently contacted" reads the same across both lists.
    ids.length
      ? supabase
          .from("crm_calls")
          .select("account_id, occurred_at")
          .in("account_id", ids)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] as { account_id: string; occurred_at: string }[] }),
    ids.length
      ? supabase
          .from("crm_activities")
          .select("account_id, occurred_at")
          .in("account_id", ids)
          .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
          .order("occurred_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] as { account_id: string; occurred_at: string }[] }),
  ]);

  const contactsByAccount = new Map<string, ContactRow[]>();
  for (const c of (contactsRes.data ?? []) as ContactRow[]) {
    const list = contactsByAccount.get(c.account_id) ?? [];
    list.push({ ...c, name: titleCaseWords(c.name) });
    contactsByAccount.set(c.account_id, list);
  }
  // Decision-makers surface first so "primary contact" reads as the actual
  // point of contact rather than whoever happens to sort first alphabetically.
  for (const list of contactsByAccount.values()) {
    list.sort((a, b) => Number(b.is_decision_maker) - Number(a.is_decision_maker));
  }

  const repName = new Map(
    (
      (profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]
    ).map((p) => [p.id, firstName(p.full_name, p.email) || "Unnamed rep"]),
  );

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

  const cards: CustomerCardData[] = accounts.map((a) => {
    const primaryContact = contactsByAccount.get(a.id)?.[0] ?? null;
    return {
      id: a.id,
      name: a.name,
      city: a.city,
      state: a.state,
      industry: a.industry,
      commodities: a.commodities,
      repName: a.assigned_user_id ? repName.get(a.assigned_user_id) ?? null : null,
      primaryContactName: primaryContact?.name ?? null,
      primaryContactTitle: primaryContact?.title ?? null,
      phone: primaryContact?.phone || primaryContact?.mobile || parsePhones(a.phones)[0]?.number || a.phone || null,
      lastContactMs: lastContactMsByAccount.get(a.id) ?? null,
    };
  });

  return (
    <PageShell>
      {cards.length === 0 ? (
        <Card>
          <CardHead title="Active Customers" />
          <EmptyState
            icon={<IconCustomers />}
            title="No active customers yet"
            body='Mark a company "Customer" on its profile to see it here.'
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:hidden">
            {cards.map((c) => (
              <CustomerListCard key={c.id} customer={c} />
            ))}
          </div>

          <Card className="hidden md:block">
            <CardHead
              title="Active Customers"
              hint={`${cards.length} ${cards.length === 1 ? "customer" : "customers"}`}
            />
            <div className="overflow-x-auto">
              <CustomerTable customers={cards} />
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
