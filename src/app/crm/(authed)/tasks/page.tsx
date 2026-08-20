import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../_shell/ui";
import { IconTasks } from "../_shell/icons";
import { firstName, timestampMs, centralDayRange } from "../_shell/format";
import { parsePhones } from "../_shell/contactFields";
import { TaskRow, type CrmTaskItem } from "./TaskRow";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { AddTaskButton } from "./AddTaskButton";
import type { RepOption } from "../accounts/CompanyDialog";

export const dynamic = "force-dynamic";

type TaskRowData = {
  id: string;
  title: string;
  notes: string | null;
  task_type: string | null;
  due_at: string | null;
  priority: string | null;
  status: string;
  completed_at: string | null;
  reminder_at: string | null;
  account_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
};

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean };

/**
 * Global Tasks — every task across the whole org (RLS-scoped to the org, but
 * deliberately NOT filtered to the viewer's own assignments: tasks are a
 * shared, org-wide list so everyone can see what everyone else is on). Open
 * tasks are grouped Overdue / Due today / Upcoming so the top of the page is
 * always the most urgent work; completed tasks collapse into a closed
 * disclosure. Every row links to its company, shows its assignee, and
 * completes inline. The "Add task" entry point here creates a STANDALONE
 * task — company and contact are optional and pickable, unlike the
 * company-profile Tasks section where the company is fixed.
 */
export default async function TasksPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const canAssignOthers = user.role === "owner";

  const [tasksRes, accountsRes, contactsRes, profilesRes] = await Promise.all([
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, task_type, due_at, priority, status, completed_at, reminder_at, account_id, contact_id, assigned_user_id",
      )
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),
    // Company/contact rosters for the "Add task" dialog — phone/phones and
    // email also ride along so each task row's Call/Email action can resolve
    // its linked contact's (or company's) best number without another query.
    supabase
      .from("crm_accounts")
      .select("id, name, phone, phones")
      .is("deleted_at", null)
      .order("name")
      .limit(500),
    supabase
      .from("crm_contacts")
      .select("id, name, account_id, phone, phones, email, title")
      .is("deleted_at", null)
      .order("name")
      .limit(2000),
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
  ]);

  const rows = (tasksRes.data ?? []) as TaskRowData[];

  const accounts = (accountsRes.data ?? []) as {
    id: string;
    name: string;
    phone: string | null;
    phones: unknown;
  }[];
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));
  const companyPhoneById = new Map(
    accounts.map((a) => [a.id, parsePhones(a.phones)[0]?.number || a.phone || null]),
  );

  const contactRows = (contactsRes.data ?? []) as {
    id: string;
    name: string;
    account_id: string | null;
    phone: string | null;
    phones: unknown;
    email: string | null;
    title: string | null;
  }[];
  const contactNameById = new Map(contactRows.map((c) => [c.id, c.name]));
  const contactPhoneById = new Map(
    contactRows.map((c) => [c.id, parsePhones(c.phones)[0]?.number || c.phone || null]),
  );
  const contactEmailById = new Map(contactRows.map((c) => [c.id, c.email]));
  const contactTitleById = new Map(contactRows.map((c) => [c.id, c.title]));
  const contactOptions = contactRows.map((c) => ({
    id: c.id,
    name: c.name,
    accountId: c.account_id,
  }));

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileNameById = new Map(
    profiles.map((p) => [p.id, firstName(p.full_name, p.email) || "Unnamed rep"]),
  );
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileNameById.get(p.id) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const currentUser = {
    id: user.id,
    label: firstName(user.fullName, user.email) || "You",
  };

  // Bundled TaskRow dialog props — every row's Edit/Reschedule dialog needs
  // the same company/contact/rep rosters the "Add task" button above already
  // loads, so this is passed straight through rather than each row re-deriving it.
  const dialogProps = { accounts, contacts: contactOptions, reps, canAssignOthers, currentUser };

  const tasks: CrmTaskItem[] = rows.map((r) => ({
    ...r,
    companyName: r.account_id ? nameById.get(r.account_id) ?? null : null,
    contactName: r.contact_id ? contactNameById.get(r.contact_id) ?? null : null,
    contactTitle: r.contact_id ? contactTitleById.get(r.contact_id) ?? null : null,
    assigneeName: r.assigned_user_id ? profileNameById.get(r.assigned_user_id) ?? null : null,
    contactPhone: r.contact_id ? contactPhoneById.get(r.contact_id) ?? null : null,
    contactEmail: r.contact_id ? contactEmailById.get(r.contact_id) ?? null : null,
    companyPhone: r.account_id ? companyPhoneById.get(r.account_id) ?? null : null,
  }));

  // Central calendar-day boundaries — see page.tsx (dashboard) for why.
  const { startMs: todayStart, endMs: todayEnd } = centralDayRange();

  const openTasks = tasks.filter((t) => t.status !== "completed");
  const doneTasks = tasks.filter((t) => t.status === "completed");

  const overdue = openTasks.filter((t) => {
    const ms = timestampMs(t.due_at);
    return ms !== null && ms < todayStart;
  });
  const dueToday = openTasks.filter((t) => {
    const ms = timestampMs(t.due_at);
    return ms !== null && ms >= todayStart && ms <= todayEnd;
  });
  const upcoming = openTasks.filter((t) => {
    const ms = timestampMs(t.due_at);
    return ms === null || ms > todayEnd;
  });

  const hasAny = tasks.length > 0;

  return (
    <PageShell
      title="Tasks"
      subtitle="Every open task across the org, grouped by urgency."
      actions={
        <AddTaskButton
          accounts={accounts}
          contacts={contactOptions}
          reps={reps}
          canAssignOthers={canAssignOthers}
          currentUser={currentUser}
        />
      }
    >
      {!hasAny ? (
        <Card>
          <EmptyState
            icon={<IconTasks />}
            title="No tasks yet"
            body="Add a standalone task above, or add one from any company profile."
            action={
              <AddTaskButton
                accounts={accounts}
                contacts={contactOptions}
                reps={reps}
                canAssignOthers={canAssignOthers}
                currentUser={currentUser}
              />
            }
          />
        </Card>
      ) : (
        <>
          <Group id="overdue" title="Overdue" tasks={overdue} dialogProps={dialogProps} />
          <Group id="due-today" title="Due today" tasks={dueToday} dialogProps={dialogProps} />
          <Group title="Upcoming" tasks={upcoming} dialogProps={dialogProps} />

          {doneTasks.length > 0 && (
            <Card>
              <details>
                <summary className="cursor-pointer list-none border-b border-line-strong px-5 py-3.5 text-[14px] font-semibold text-fg-subtle transition-colors hover:text-fg">
                  Done · {doneTasks.length}
                </summary>
                <ul className="grid grid-cols-1 items-start gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {doneTasks.map((t) => (
                    <TaskRow key={t.id} task={t} showCompany {...dialogProps}>
                      <DeleteTaskButton taskId={t.id} accountId={t.account_id} title={t.title} />
                    </TaskRow>
                  ))}
                </ul>
              </details>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}

type TaskDialogProps = {
  accounts: { id: string; name: string }[];
  contacts: { id: string; name: string; accountId: string | null }[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
};

function Group({
  id,
  title,
  tasks,
  dialogProps,
}: {
  id?: string;
  title: string;
  tasks: CrmTaskItem[];
  dialogProps: TaskDialogProps;
}) {
  if (tasks.length === 0) return null;
  return (
    <Card id={id} className={id ? "scroll-mt-20" : undefined}>
      <CardHead title={title} hint={`${tasks.length}`} />
      <ul className="grid grid-cols-1 items-start gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} showCompany {...dialogProps}>
            <DeleteTaskButton taskId={t.id} accountId={t.account_id} title={t.title} />
          </TaskRow>
        ))}
      </ul>
    </Card>
  );
}
