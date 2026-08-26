import { createCrmServerClient, type CrmUser } from "@/lib/crm/auth";
import { CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { timestampMs } from "../_shell/format";
import { normalizePriority } from "../tasks/priority";
import type { AgentTask, AgentCompany } from "./agentWork";

/**
 * Server-side reads for the agent dashboard — everything scoped to ONE
 * person, the signed-in agent.
 *
 * The scoping is the point of the screen: `assigned_user_id = user.id` on
 * both queries, with no org-wide fallback and no unowned pool. An agent's
 * home page shows their work and their companies; there is nothing here to
 * browse out of.
 *
 * LAST CONTACT is the EXISTING definition, the same one Admin -> Companies
 * and the Companies list use: the later of the account's last logged call
 * and its last CONTACT-kind activity (CRM_CONTACT_ACTIVITY_KINDS is what
 * stops an AI-research run or a record-created event reading as "someone
 * talked to them"). Not re-derived here.
 */

export type AgentDashboardData = {
  tasks: AgentTask[];
  companies: AgentCompany[];
  /** Server clock, passed to the client so every date label is computed
   * against ONE instant — the same hydration guard the assignment board uses. */
  now: number;
};

export async function getAgentDashboardData(user: CrmUser): Promise<AgentDashboardData> {
  const supabase = await createCrmServerClient();

  const [tasksRes, accountsRes] = await Promise.all([
    supabase
      .from("crm_tasks")
      .select("id, title, due_at, task_type, account_id, contact_id, priority")
      .eq("status", "open")
      .eq("assigned_user_id", user.id)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),

    supabase
      .from("crm_accounts")
      .select("id, name, city, state, lifecycle_status")
      .eq("assigned_user_id", user.id)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(1000),
  ]);

  const accounts = accountsRes.data ?? [];
  const accountIds = accounts.map((a) => a.id as string);
  const nameById = new Map(accounts.map((a) => [a.id as string, (a.name as string) || "Unnamed company"]));

  const [callsRes, activitiesRes] = accountIds.length
    ? await Promise.all([
        supabase
          .from("crm_calls")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(2000),
        supabase
          .from("crm_activities")
          .select("account_id, occurred_at")
          .in("account_id", accountIds)
          .in("kind", CRM_CONTACT_ACTIVITY_KINDS)
          .order("occurred_at", { ascending: false })
          .limit(2000),
      ])
    : [
        { data: [] as { account_id: string; occurred_at: string }[] },
        { data: [] as { account_id: string; occurred_at: string }[] },
      ];

  const lastContactMsByAccount = new Map<string, number>();
  for (const r of [...(callsRes.data ?? []), ...(activitiesRes.data ?? [])]) {
    const ms = timestampMs(r.occurred_at as string);
    if (ms === null) continue;
    const id = r.account_id as string;
    const current = lastContactMsByAccount.get(id);
    if (current === undefined || ms > current) lastContactMsByAccount.set(id, ms);
  }

  // A task can point at a company this agent does NOT own — an admin can send
  // one about anything, and the ownership of a company can move while a task
  // on it stays put. Those names are resolved with a second lookup rather
  // than left blank: a task row reading "Research + first outreach · No
  // company" is not a task anybody can act on. Nothing is being leaked by
  // doing so — the agent restriction is a filter on the company LIST, not on
  // whether a specific company can be opened.
  const taskAccountIds = [
    ...new Set(
      (tasksRes.data ?? [])
        .map((t) => (t.account_id as string | null) ?? null)
        .filter((id): id is string => id !== null && !nameById.has(id)),
    ),
  ];
  if (taskAccountIds.length) {
    const { data: extra } = await supabase
      .from("crm_accounts")
      .select("id, name")
      .in("id", taskAccountIds)
      .is("deleted_at", null);
    for (const a of extra ?? []) {
      nameById.set(a.id as string, (a.name as string) || "Unnamed company");
    }
  }

  // Contact names for the rows — one lookup for the ids actually used.
  const contactIds = [
    ...new Set(
      (tasksRes.data ?? [])
        .map((t) => (t.contact_id as string | null) ?? null)
        .filter((id): id is string => id !== null),
    ),
  ];
  const contactNameById = new Map<string, string>();
  if (contactIds.length) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, name")
      .in("id", contactIds)
      .is("deleted_at", null);
    for (const c of data ?? []) contactNameById.set(c.id as string, c.name as string);
  }

  const tasks: AgentTask[] = (tasksRes.data ?? []).map((t) => {
    const accountId = (t.account_id as string | null) ?? null;
    const linked = accountId !== null && nameById.has(accountId);
    // crm_tasks.task_type is open-ended human text ("Follow-up call",
    // "Research prospect" — see tasks/taskType.ts), so it is shown verbatim
    // rather than mapped through a second vocabulary that would drift from
    // whatever someone actually typed.
    const type = ((t.task_type as string | null) ?? "").trim();
    return {
      id: t.id as string,
      title: (t.title as string) || "Untitled task",
      dueAt: (t.due_at as string | null) ?? null,
      accountId: linked ? accountId : null,
      companyName: linked ? (nameById.get(accountId) ?? null) : null,
      hint: type.length ? type.toLowerCase() : null,
      contactName: t.contact_id ? (contactNameById.get(t.contact_id as string) ?? null) : null,
      isHigh: normalizePriority(t.priority as string | null) === "high",
    };
  });

  const companies: AgentCompany[] = accounts.map((a) => ({
    id: a.id as string,
    name: (a.name as string) || "Unnamed company",
    city: (a.city as string | null) ?? null,
    state: (a.state as string | null) ?? null,
    stage: (a.lifecycle_status as string | null) ?? null,
    lastContactMs: lastContactMsByAccount.get(a.id as string) ?? null,
  }));

  return { tasks, companies, now: Date.now() };
}
