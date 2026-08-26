import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { timestampMs } from "../../_shell/format";
import type { CompanyRow } from "./companyRow";

/**
 * Server-side read for Admin → Companies — every crm_accounts row in the org,
 * whoever owns it.
 *
 * NO agent visibility gate. ai-agent/queue.ts's CLAIMED_COMPANIES_OR_FILTER
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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function getCompaniesData(): Promise<CompaniesData> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: accountData } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, assigned_user_id, source, lifecycle_status")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const accounts = accountData ?? [];
  const accountIds = accounts.map((a) => a.id as string);

  const [profilesRes, callsRes, activitiesRes, tasksRes] = await Promise.all([
    supabase
      .from("crm_profiles")
      .select("id, full_name, email")
      .eq("org_id", user.orgId)
      .eq("is_active", true),

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

  // Reduced to a single MAX(occurred_at) per company, exactly as the
  // Companies list does it.
  const lastContactMsByAccount = new Map<string, number>();
  for (const r of [...(callsRes.data ?? []), ...(activitiesRes.data ?? [])]) {
    const ms = timestampMs(r.occurred_at as string);
    if (ms === null) continue;
    const id = r.account_id as string;
    const current = lastContactMsByAccount.get(id);
    if (current === undefined || ms > current) lastContactMsByAccount.set(id, ms);
  }

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
