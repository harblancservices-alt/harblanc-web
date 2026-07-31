import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import {
  firstName,
  formatDateTime,
  timestampMs,
  centralDateKey,
} from "../_shell/format";
import { callOutcomeLabel } from "../calls/outcomes";
import { CalendarView, type CalendarItem } from "./CalendarView";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  task_type: string | null;
  due_at: string | null;
  status: string;
  account_id: string | null;
  assigned_user_id: string | null;
};

type ContactRow = {
  id: string;
  name: string;
  account_id: string | null;
  next_followup_at: string | null;
};

type CallRow = {
  id: string;
  account_id: string | null;
  contact_id: string | null;
  occurred_at: string;
  outcome: string | null;
};

type AccountRow = { id: string; name: string };
type ProfileRow = { id: string; full_name: string | null; email: string | null };

/**
 * Company-wide calendar — every time-based item across the whole org
 * (org-wide, not filtered to the viewer): task due dates, contact
 * follow-ups, and logged calls. RLS already scopes every query to the
 * caller's org; nothing here filters by assigned_user_id/user_id, matching
 * the Tasks page and dashboard's "shared, org-wide" convention. All bucketing
 * and display goes through the Central-time helpers in _shell/format.ts, so
 * a day turns over at Central midnight regardless of the server's own zone.
 */
export default async function CrmCalendarPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [tasksRes, contactsRes, callsRes, accountsRes, profilesRes] = await Promise.all([
    supabase
      .from("crm_tasks")
      .select("id, title, task_type, due_at, status, account_id, assigned_user_id")
      .not("due_at", "is", null)
      .is("deleted_at", null)
      .order("due_at", { ascending: true })
      .limit(1000),
    // Every contact (not just ones with a follow-up due) so call rows below
    // can resolve a contact name too, in one query.
    supabase
      .from("crm_contacts")
      .select("id, name, account_id, next_followup_at")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(3000),
    supabase
      .from("crm_calls")
      .select("id, account_id, contact_id, occurred_at, outcome")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(1000),
    supabase.from("crm_accounts").select("id, name").is("deleted_at", null).limit(3000),
    supabase.from("crm_profiles").select("id, full_name, email"),
  ]);

  const accountNameById = new Map(
    ((accountsRes.data ?? []) as AccountRow[]).map((a) => [a.id, a.name]),
  );
  const profileNameById = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [
      p.id,
      firstName(p.full_name, p.email) || "Unnamed rep",
    ]),
  );
  const contactRows = (contactsRes.data ?? []) as ContactRow[];
  const contactNameById = new Map(contactRows.map((c) => [c.id, c.name]));

  const now = Date.now();

  const taskItems: CalendarItem[] = ((tasksRes.data ?? []) as TaskRow[])
    .map((t): CalendarItem | null => {
      const dateKey = centralDateKey(t.due_at);
      if (!dateKey) return null;
      const ms = timestampMs(t.due_at) ?? 0;
      const overdue = t.status !== "completed" && ms < now;
      const companyName = t.account_id ? accountNameById.get(t.account_id) ?? null : null;
      const assigneeName = t.assigned_user_id
        ? profileNameById.get(t.assigned_user_id) ?? null
        : null;
      return {
        id: `task-${t.id}`,
        type: "task",
        dateKey,
        sortMs: ms,
        timeLabel: formatDateTime(t.due_at),
        label: `${t.task_type ? `${t.task_type}: ` : ""}${t.title}`,
        sub: [companyName ?? "No company", assigneeName ? `Assigned: ${assigneeName}` : null]
          .filter(Boolean)
          .join(" · "),
        href: t.account_id ? `/crm/accounts/${t.account_id}` : "/crm/tasks",
        overdue,
      };
    })
    .filter((x): x is CalendarItem => x !== null);

  const followupItems: CalendarItem[] = contactRows
    .filter((c) => c.next_followup_at)
    .map((c): CalendarItem => {
      const dateKey = centralDateKey(c.next_followup_at)!;
      const ms = timestampMs(c.next_followup_at) ?? 0;
      const companyName = c.account_id ? accountNameById.get(c.account_id) ?? null : null;
      return {
        id: `followup-${c.id}`,
        type: "followup",
        dateKey,
        sortMs: ms,
        timeLabel: formatDateTime(c.next_followup_at),
        label: `Follow up: ${c.name}`,
        sub: companyName ?? "No company",
        href: c.account_id ? `/crm/accounts/${c.account_id}` : "/crm/contacts",
        overdue: false,
      };
    });

  const callItems: CalendarItem[] = ((callsRes.data ?? []) as CallRow[])
    .map((c): CalendarItem | null => {
      const dateKey = centralDateKey(c.occurred_at);
      if (!dateKey) return null;
      const ms = timestampMs(c.occurred_at) ?? 0;
      const contactName = c.contact_id ? contactNameById.get(c.contact_id) ?? null : null;
      const outcomeLabel = callOutcomeLabel(c.outcome);
      const companyName = c.account_id ? accountNameById.get(c.account_id) ?? null : null;
      return {
        id: `call-${c.id}`,
        type: "call",
        dateKey,
        sortMs: ms,
        timeLabel: formatDateTime(c.occurred_at),
        label: `Call: ${contactName ?? outcomeLabel}`,
        sub: [companyName ?? "No company", contactName ? outcomeLabel : null]
          .filter(Boolean)
          .join(" · "),
        href: c.account_id ? `/crm/accounts/${c.account_id}` : "/crm/contacts",
        overdue: false,
      };
    })
    .filter((x): x is CalendarItem => x !== null);

  const items = [...taskItems, ...followupItems, ...callItems].sort(
    (a, b) => a.sortMs - b.sortMs,
  );

  const todayKey = centralDateKey(new Date().toISOString())!;

  return (
    <PageShell>
      <CalendarView items={items} todayKey={todayKey} />
    </PageShell>
  );
}
