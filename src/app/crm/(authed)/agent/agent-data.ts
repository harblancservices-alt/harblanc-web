import { timestampMs, centralDayRange } from "../_shell/format";
import { createCrmServerClient, type CrmUser } from "@/lib/crm/auth";
import { contactCountByAccount } from "@/lib/crm/contactCount";
import { primaryContactByAccount } from "@/lib/crm/primaryContact";
import { lastContactByAccount } from "@/lib/crm/lastContact";
import { normalizePriority } from "../tasks/priority";
import type { AgentTask, AgentCompany } from "./agentWork";
import type { CompletenessInput } from "./completeness";

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
  /** Everything needed to DERIVE completeness gaps at render time. Not
   * stored, not queried separately — the same company rows above, plus a
   * contact count. See completeness.ts for why these are never task rows. */
  completeness: CompletenessInput[];
  /** Calls this agent logged TODAY, and how many of them reached somebody.
   * The dashboard's "Logged today" metric — the one figure on the strip
   * that measures effort rather than backlog. */
  callsToday: number;
  reachedToday: number;
  /** Server clock, passed to the client so every date label is computed
   * against ONE instant — the same hydration guard the assignment board uses. */
  now: number;
};

/**
 * Call outcomes that mean a conversation actually happened.
 *
 * Deliberately narrow. "Voicemail" and "No Answer" are dials, not
 * conversations, and counting them as reached would make the number on the
 * dashboard flattering and useless. `reached` is the plain one added for
 * the company file's one-click row; the other three are outcomes that can
 * only be known BY talking to somebody.
 */
const REACHED_OUTCOMES = [
  "reached",
  "interested",
  "meeting_scheduled",
  "quote_requested",
] as const;

export async function getAgentDashboardData(user: CrmUser): Promise<AgentDashboardData> {
  const supabase = await createCrmServerClient();

  const [tasksRes, accountsRes] = await Promise.all([
    supabase
      .from("crm_tasks")
      .select("id, title, due_at, task_type, account_id, contact_id, priority, notes, definition_of_done")
      .eq("status", "open")
      .eq("assigned_user_id", user.id)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),

    supabase
      .from("crm_accounts")
      .select("id, name, city, state, lifecycle_status, address, industry, source, stage_changed_at, primary_contact_id, created_at")
      .eq("assigned_user_id", user.id)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(1000),
  ]);

  const accounts = accountsRes.data ?? [];
  const accountIds = accounts.map((a) => a.id as string);
  const nameById = new Map(accounts.map((a) => [a.id as string, (a.name as string) || "Unnamed company"]));

  // Last contact — the shared definition (lib/crm/lastContact.ts).
  const lastContactMsByAccount = await lastContactByAccount(supabase, accountIds);

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
      brief: ((t.notes as string | null) ?? "").trim() || null,
      doneWhen: ((t.definition_of_done as string | null) ?? "").trim() || null,
    };
  });

  const contactCounts = await contactCountByAccount(supabase, accountIds);

  const completeness: CompletenessInput[] = accounts.map((a) => ({
    id: a.id as string,
    name: (a.name as string) || "Unnamed company",
    city: (a.city as string | null) ?? null,
    state: (a.state as string | null) ?? null,
    address: (a.address as string | null) ?? null,
    industry: (a.industry as string | null) ?? null,
    contactCount: contactCounts.get(a.id as string) ?? 0,
  }));

  // Who to call, by the shared rule (lib/crm/primaryContact.ts).
  const primaryIdByAccount = new Map<string, string>();
  for (const a of accounts) {
    const pid = a.primary_contact_id as string | null;
    if (pid) primaryIdByAccount.set(a.id as string, pid);
  }
  const contactByAccount = await primaryContactByAccount(supabase, accountIds, primaryIdByAccount);

  // Open tasks per company, for the card's "is anything already moving here".
  const openTaskByAccount = new Map<string, number>();
  for (const t of tasks) {
    if (t.accountId) openTaskByAccount.set(t.accountId, (openTaskByAccount.get(t.accountId) ?? 0) + 1);
  }

  const companies: AgentCompany[] = accounts.map((a) => ({
    id: a.id as string,
    name: (a.name as string) || "Unnamed company",
    city: (a.city as string | null) ?? null,
    state: (a.state as string | null) ?? null,
    stage: (a.lifecycle_status as string | null) ?? null,
    source: (a.source as string | null) ?? null,
    stageChangedMs: timestampMs(a.stage_changed_at as string | null),
    lastContactMs: lastContactMsByAccount.get(a.id as string) ?? null,
    contactName: contactByAccount.get(a.id as string)?.name ?? null,
    contactTitle: contactByAccount.get(a.id as string)?.title ?? null,
    contactPhone: contactByAccount.get(a.id as string)?.phone ?? null,
    openTasks: openTaskByAccount.get(a.id as string) ?? 0,
    createdMs: timestampMs(a.created_at as string | null),
  }));

  /**
   * Today's calls, counted in CENTRAL time rather than UTC.
   *
   * A day boundary matters here: at 8pm Central it is already tomorrow in
   * UTC, so a UTC-bounded query would zero the agent's counter mid-evening
   * while they were still working. centralDayRange is the same helper every
   * other "today" in this CRM uses.
   */
  const { startMs, endMs } = centralDayRange(new Date());
  const { data: callRows } = await supabase
    .from("crm_calls")
    .select("outcome")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .gte("occurred_at", new Date(startMs).toISOString())
    .lt("occurred_at", new Date(endMs).toISOString());

  const callsToday = (callRows ?? []).length;
  const reachedToday = (callRows ?? []).filter((c) =>
    (REACHED_OUTCOMES as readonly string[]).includes((c.outcome as string | null) ?? ""),
  ).length;

  return { tasks, companies, completeness, callsToday, reachedToday, now: Date.now() };
}
