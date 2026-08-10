import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, EmptyState } from "../_shell/ui";
import { IconCustomers } from "../_shell/icons";
import { firstName, timestampMs, titleCaseWords } from "../_shell/format";
import { parsePhones } from "../_shell/contactFields";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { CompanyListCard, type CompanyCardData } from "../accounts/CompanyListCard";
import { CompanyTable } from "../accounts/CompanyTable";
import { ActiveCustomerRowActions } from "./ActiveCustomerRowActions";
import type { CrmTag } from "../accounts/tags";
import type { CompanyOption } from "../contacts/CompanyCombobox";
import type { RepOption } from "../accounts/CompanyDialog";
import type { TaskContactOption } from "../tasks/TaskDialog";

type AccountRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  phones: unknown;
};

/**
 * Active Customers — every crm_account marked lifecycle_status='active_customer'
 * (the funnel's final stage — see accounts/lifecycle.ts) via the profile's
 * chevron stage tracker (accounts/[id]/StageTracker.tsx → updateLifecycleStatus).
 * Purely a read view: there is no write path here —
 * moving a company in or out of this list is done on its profile, which
 * already exists.
 *
 * Deliberately the SAME grid as Companies (Brent's approved mockup) — reuses
 * CompanyListCard/CompanyTable/CompanyCardData directly rather than a parallel
 * set of components, just pre-filtered to customers and with no filter bar
 * (every row here already shares one stage, so there's nothing to filter by).
 *
 * Extracted out of customers/page.tsx (which still renders this at
 * /crm/customers) so the /crm/active-customers hub's "Active Customers" tab
 * can render the exact same panel without duplicating the query logic.
 */
export async function ActiveCustomersPanel() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, phone, phones")
    .eq("lifecycle_status", "active_customer")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);

  const accounts = ((data ?? []) as AccountRow[]).map((a) => ({ ...a, lifecycle_status: "active_customer" as const }));
  const accountIds = accounts.map((a) => a.id);

  // Full org roster for CompanyRowActions' "Add contact" dialog combobox —
  // independent of the customer-only `accounts` list above, same as the
  // Companies page's companyOptions.
  const { data: companyOptionsData } = await supabase
    .from("crm_accounts")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  const companyOptions: CompanyOption[] = ((companyOptionsData ?? []) as CompanyOption[]).map((a) => ({
    id: a.id,
    name: titleCaseWords(a.name),
  }));

  const [profilesRes, tagsRes, tagLinkRes, contactsRes, lastCallsRes, lastActivitiesRes] = await Promise.all([
    supabase.from("crm_profiles").select("id, full_name, email, is_active, role"),
    supabase.from("crm_tags").select("id, label, color").order("label"),
    accountIds.length
      ? supabase.from("crm_account_tags").select("account_id, tag_id").in("account_id", accountIds)
      : Promise.resolve({ data: [] as { account_id: string; tag_id: string }[] }),
    accountIds.length
      ? supabase.from("crm_contacts").select("id, name, account_id").in("account_id", accountIds).is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; name: string; account_id: string }[] }),
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
          .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
          .order("occurred_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] as { account_id: string; occurred_at: string }[] }),
  ]);

  const tagById = new Map(((tagsRes.data ?? []) as CrmTag[]).map((t) => [t.id, t]));
  const tagsByAccount = new Map<string, CrmTag[]>();
  for (const link of (tagLinkRes.data ?? []) as { account_id: string; tag_id: string }[]) {
    const t = tagById.get(link.tag_id);
    if (!t) continue;
    const list = tagsByAccount.get(link.account_id) ?? [];
    list.push(t);
    tagsByAccount.set(link.account_id, list);
  }
  for (const list of tagsByAccount.values()) list.sort((a, b) => a.label.localeCompare(b.label));

  const contactRows = (contactsRes.data ?? []) as { id: string; name: string; account_id: string }[];
  const contactCountByAccount = new Map<string, number>();
  const contactOptionsByAccount = new Map<string, TaskContactOption[]>();
  for (const c of contactRows) {
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
    const list = contactOptionsByAccount.get(c.account_id) ?? [];
    list.push({ id: c.id, name: titleCaseWords(c.name) });
    contactOptionsByAccount.set(c.account_id, list);
  }

  const reps: RepOption[] = ((profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null; is_active: boolean; role: string }[])
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: firstName(p.full_name, p.email) || "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const canAssignOthers = user.role === "owner";
  const currentUser = { id: user.id, label: firstName(user.fullName, user.email) || "You" };

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

  const cards: CompanyCardData[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    stage: a.lifecycle_status,
    city: a.city,
    state: a.state,
    primaryTag: tagsByAccount.get(a.id)?.[0] ?? null,
    contactCount: contactCountByAccount.get(a.id) ?? 0,
    lastContactMs: lastContactMsByAccount.get(a.id) ?? null,
    phone: parsePhones(a.phones)[0]?.number || a.phone,
  }));

  if (cards.length === 0) {
    return (
      <Card>
        <CardHead title="Active Customers" />
        <EmptyState
          icon={<IconCustomers />}
          title="No active customers yet"
          body='Mark a company "Customer" on its profile to see it here.'
        />
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:hidden">
        {cards.map((c) => (
          <CompanyListCard
            key={c.id}
            company={c}
            companyOptions={companyOptions}
            renderActions={(company, variant) => (
              <ActiveCustomerRowActions
                company={company}
                contacts={contactOptionsByAccount.get(company.id) ?? []}
                reps={reps}
                canAssignOthers={canAssignOthers}
                currentUser={currentUser}
                variant={variant}
              />
            )}
          />
        ))}
      </div>

      <Card className="hidden md:block">
        <CardHead
          title="Active Customers"
          hint={`${cards.length} ${cards.length === 1 ? "customer" : "customers"}`}
        />
        <div className="overflow-x-auto">
          <CompanyTable
            companies={cards}
            companyOptions={companyOptions}
            renderActions={(company, variant) => (
              <ActiveCustomerRowActions
                company={company}
                contacts={contactOptionsByAccount.get(company.id) ?? []}
                reps={reps}
                canAssignOthers={canAssignOthers}
                currentUser={currentUser}
                variant={variant}
              />
            )}
          />
        </div>
      </Card>
    </>
  );
}
