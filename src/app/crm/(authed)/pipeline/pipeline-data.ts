import { createCrmServerClient, type CrmUser } from "@/lib/crm/auth";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { timestampMs } from "../_shell/format";
import {
  getCompanyVisibility,
  applyCompanyVisibility,
} from "../_shell/companyVisibility";
import type { PipelineCard } from "./pipeline";

/**
 * Server-side read for Workspace → Pipeline.
 *
 * SCOPED BY THE SHARED RULE, not a new one. It runs the company query through
 * applyCompanyVisibility exactly like the Companies list and Active Customers
 * do, so an agent sees their own book here and nothing else — and a change to
 * that rule reaches this board without anyone remembering to update it.
 *
 * LAST CONTACT is the EXISTING definition: the later of the account's last
 * logged call and its last CONTACT-kind activity. CRM_CONTACT_ACTIVITY_KINDS
 * is what stops an AI-research run or a record-created event reading as
 * "someone talked to them".
 */

export type PipelineData = {
  cards: PipelineCard[];
  /** True when this caller only sees their own companies — changes what the
   * empty state is allowed to claim. */
  restricted: boolean;
  now: number;
};

export async function getPipelineData(user: CrmUser): Promise<PipelineData> {
  const supabase = await createCrmServerClient();
  const visibility = await getCompanyVisibility(user);

  let query = supabase
    .from("crm_accounts")
    .select("id, name, city, state, lifecycle_status")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(1000);
  query = applyCompanyVisibility(query, visibility);

  const { data: accountData } = await query;
  const accounts = accountData ?? [];
  const accountIds = accounts.map((a) => a.id as string);

  const [callsRes, activitiesRes, tasksRes] = accountIds.length
    ? await Promise.all([
        supabase
          .from("crm_calls")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(3000),
        supabase
          .from("crm_activities")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
          .order("occurred_at", { ascending: false })
          .limit(3000),
        supabase
          .from("crm_tasks")
          .select("account_id")
          .in("account_id", accountIds)
          .eq("status", "open")
          .is("deleted_at", null),
      ])
    : [
        { data: [] as { account_id: string; occurred_at: string }[] },
        { data: [] as { account_id: string; occurred_at: string }[] },
        { data: [] as { account_id: string }[] },
      ];

  const lastContactMsByAccount = new Map<string, number>();
  for (const r of [...(callsRes.data ?? []), ...(activitiesRes.data ?? [])]) {
    const ms = timestampMs(r.occurred_at as string);
    if (ms === null) continue;
    const id = r.account_id as string;
    const current = lastContactMsByAccount.get(id);
    if (current === undefined || ms > current) lastContactMsByAccount.set(id, ms);
  }

  const openTasksByAccount = new Map<string, number>();
  for (const t of tasksRes.data ?? []) {
    const id = t.account_id as string | null;
    if (id) openTasksByAccount.set(id, (openTasksByAccount.get(id) ?? 0) + 1);
  }

  const cards: PipelineCard[] = accounts.map((a) => ({
    id: a.id as string,
    name: (a.name as string) || "Unnamed company",
    city: (a.city as string | null) ?? null,
    state: (a.state as string | null) ?? null,
    stage: (a.lifecycle_status as string | null) ?? null,
    lastContactMs: lastContactMsByAccount.get(a.id as string) ?? null,
    openTasks: openTasksByAccount.get(a.id as string) ?? 0,
  }));

  return { cards, restricted: visibility.restricted, now: Date.now() };
}
