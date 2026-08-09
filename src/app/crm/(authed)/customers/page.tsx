import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import { IconCustomers } from "../_shell/icons";
import { timestampMs } from "../_shell/format";
import { parsePhones } from "../_shell/contactFields";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { CompanyListCard, type CompanyCardData } from "../accounts/CompanyListCard";
import { CompanyTable } from "../accounts/CompanyTable";
import type { CrmTag } from "../accounts/tags";

export const dynamic = "force-dynamic";

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
 */
export default async function ActiveCustomersPage() {
  await requireCrmUser();
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

  const [tagsRes, tagLinkRes, contactsRes, lastCallsRes, lastActivitiesRes] = await Promise.all([
    supabase.from("crm_tags").select("id, label, color").order("label"),
    accountIds.length
      ? supabase.from("crm_account_tags").select("account_id, tag_id").in("account_id", accountIds)
      : Promise.resolve({ data: [] as { account_id: string; tag_id: string }[] }),
    accountIds.length
      ? supabase.from("crm_contacts").select("id, account_id").in("account_id", accountIds).is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; account_id: string }[] }),
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

  const contactCountByAccount = new Map<string, number>();
  for (const c of (contactsRes.data ?? []) as { id: string; account_id: string }[]) {
    contactCountByAccount.set(c.account_id, (contactCountByAccount.get(c.account_id) ?? 0) + 1);
  }

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
              <CompanyListCard key={c.id} company={c} />
            ))}
          </div>

          <Card className="hidden md:block">
            <CardHead
              title="Active Customers"
              hint={`${cards.length} ${cards.length === 1 ? "customer" : "customers"}`}
            />
            <div className="overflow-x-auto">
              <CompanyTable companies={cards} />
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
