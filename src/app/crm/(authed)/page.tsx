import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, ZEBRA_ROWS } from "./_shell/ui";
import { DueBell } from "./DueBell";
import {
  formatDate,
  timestampMs,
  firstName as profileFirstName,
  centralDayRange,
} from "./_shell/format";
import { parsePhones } from "./_shell/contactFields";
import { TaskRow, type CrmTaskItem } from "./tasks/TaskRow";
import { ActivityTimeline, type CrmActivity } from "./accounts/[id]/ActivityTimeline";
import type { RepOption } from "./accounts/CompanyDialog";
import { QuickAddContactButton, QuickLogCallButton, QuickAddTaskButton } from "./QuickActions";
import { CallListRow, type CallListContact } from "./CallListRow";
import { NewLeadRow, type NewLead } from "./NewLeadRow";

export const dynamic = "force-dynamic";

const CENTRAL_TZ = "America/Chicago";

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
  assigned_user_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
};

type FollowupContactRow = {
  id: string;
  name: string;
  account_id: string | null;
  next_followup_at: string | null;
  notes: string | null;
  phone: string | null;
  phones: unknown;
};

type ActivityRow = {
  id: string;
  kind: string;
  summary: string | null;
  body: string | null;
  occurred_at: string;
  user_id: string | null;
};

/** Central-time hour (0-23) for a moment — drives the header's time-of-day
 * greeting. Some engines format midnight as "24" with hour12:false. */
function centralHour(date: Date): number {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CENTRAL_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
  return h === 24 ? 0 : h;
}

/**
 * The CRM dashboard — a salesman-first command center. Order: quick actions,
 * then the Call list (contacts due today/overdue — the top priority), Tasks
 * (every open task org-wide, overdue-first), New leads to claim (unclaimed
 * released AI leads), and — owner only — Recent activity. Everything
 * RLS-scoped to the caller's org; force-dynamic keeps it live.
 */
export default async function CrmDashboardPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const now = new Date();
  // Day boundaries are Central calendar-day boundaries — "today" turns over
  // at Central midnight regardless of the server's own zone (Vercel runs
  // UTC), matching every other overdue/due-today split in the CRM.
  const { startMs: todayStart, endMs: todayEnd } = centralDayRange(now);
  const endOfTodayISO = new Date(todayEnd).toISOString();

  const isOwner = user.role === "owner";

  const [
    followupContactsRes,
    openTasksRes,
    newAiLeadsRes,
    profilesRes,
    companyOptionsRes,
    orgContactsRes,
    recentActivitiesRes,
  ] = await Promise.all([
    // Call list — contacts whose next_followup_at is due today or overdue.
    supabase
      .from("crm_contacts")
      .select("id, name, account_id, next_followup_at, notes, phone, phones")
      .is("deleted_at", null)
      .not("next_followup_at", "is", null)
      .lte("next_followup_at", endOfTodayISO)
      .order("next_followup_at", { ascending: true })
      .limit(100),
    // Tasks queue — EVERY open task org-wide (not just the viewer's own
    // assignments), regardless of due date. Sorted overdue-first client-side
    // below since a plain due_at order would bury undated tasks awkwardly.
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, task_type, due_at, priority, status, completed_at, reminder_at, account_id, assigned_user_id",
      )
      .eq("status", "open")
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),
    // Unclaimed released AI leads — the alert. Once assigned_user_id is set
    // (claimed) a lead drops out of this query, matching /crm/ai-agent.
    supabase
      .from("crm_accounts")
      .select("id, name, city, state, commodities, created_at")
      .in("source", ["ai_agent", "field_capture"])
      .eq("ai_status", "released")
      .is("assigned_user_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    // Assignee/author names for tasks + recent activity, and the rep roster
    // for the quick-task dialog's "Assigned rep" picker.
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    // Company roster for the quick-action dialogs (Quick Add contact's
    // company combobox, Quick Task's Company picker, Quick Log Call's
    // company combobox).
    supabase
      .from("crm_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(1000),
    // Contact roster for Quick Task's contact picker and Quick Log Call's
    // contact picker, filtered client-side to whichever company is selected.
    supabase
      .from("crm_contacts")
      .select("id, name, account_id")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(2000),
    // Recent activity — owner-only, so skip the query entirely for reps
    // rather than fetching data that never renders (RSC boundary rule).
    isOwner
      ? supabase
          .from("crm_activities")
          .select("id, kind, summary, body, occurred_at, user_id")
          .order("occurred_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as ActivityRow[] }),
  ]);

  const followupRows = (followupContactsRes.data ?? []) as FollowupContactRow[];
  const openTaskRows = (openTasksRes.data ?? []) as TaskRowData[];
  const newAiLeads = (newAiLeadsRes.data ?? []) as NewLead[];
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileNameById = new Map(
    profiles.map((p) => [p.id, profileFirstName(p.full_name, p.email) || "Unnamed rep"]),
  );

  // ── Quick-action data ──
  const companyOptions = (companyOptionsRes.data ?? []) as { id: string; name: string }[];
  const orgContacts = (orgContactsRes.data ?? []) as {
    id: string;
    name: string;
    account_id: string | null;
  }[];
  const quickTaskContacts = orgContacts.map((c) => ({
    id: c.id,
    name: c.name,
    accountId: c.account_id,
  }));
  const canAssignOthers = user.role === "owner";
  const currentUser = {
    id: user.id,
    label: profileFirstName(user.fullName, user.email) || "You",
  };
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileNameById.get(p.id) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Resolve company names for the tasks/call-list rows, which only carry an
  // account_id (newAiLeads already carries its own name).
  const nameIds = [
    ...new Set(
      [
        ...openTaskRows.map((t) => t.account_id),
        ...followupRows.map((c) => c.account_id),
      ].filter(Boolean) as string[],
    ),
  ];
  const { data: nameRows } = nameIds.length
    ? await supabase.from("crm_accounts").select("id, name, phone, phones").in("id", nameIds)
    : { data: [] as { id: string; name: string; phone: string | null; phones: unknown }[] };
  const nameRowsTyped = (nameRows ?? []) as {
    id: string;
    name: string;
    phone: string | null;
    phones: unknown;
  }[];
  const nameById = new Map(nameRowsTyped.map((a) => [a.id, a.name]));
  const companyPhoneById = new Map(
    nameRowsTyped.map((a) => [a.id, parsePhones(a.phones)[0]?.number || a.phone || null]),
  );

  // ── Call list — contacts due today/overdue ──
  const callList: CallListContact[] = followupRows.map((c) => {
    const ms = timestampMs(c.next_followup_at);
    return {
      id: c.id,
      name: c.name,
      account_id: c.account_id,
      companyName: c.account_id ? nameById.get(c.account_id) ?? null : null,
      next_followup_at: c.next_followup_at,
      notes: c.notes,
      phone: parsePhones(c.phones)[0]?.number || c.phone || null,
      overdue: ms !== null && ms < todayStart,
    };
  });

  // ── Tasks queue — EVERY open task, org-wide. Overdue first, then due
  // today, then everything else (no due date or a future one); each bucket
  // keeps its own ascending-by-due-date order from the query above. ──
  const allOpenTasks: CrmTaskItem[] = openTaskRows.map((t) => ({
    ...t,
    companyName: t.account_id ? nameById.get(t.account_id) ?? null : null,
    assigneeName: t.assigned_user_id ? (profileNameById.get(t.assigned_user_id) ?? null) : null,
    companyPhone: t.account_id ? companyPhoneById.get(t.account_id) ?? null : null,
  }));
  const dueBucket = (t: CrmTaskItem) => {
    const ms = timestampMs(t.due_at);
    if (ms !== null && ms < todayStart) return 0; // overdue
    if (ms !== null && ms <= todayEnd) return 1; // due today
    return 2; // no due date, or a future one
  };
  const combinedTasks: CrmTaskItem[] = [...allOpenTasks].sort((a, b) => dueBucket(a) - dueBucket(b));
  const overdueTaskCount = allOpenTasks.filter((t) => dueBucket(t) === 0).length;
  const dueTodayCount = allOpenTasks.filter((t) => dueBucket(t) === 1).length;

  // ── Recent activity — owner only ──
  const recentActivities: CrmActivity[] = isOwner
    ? ((recentActivitiesRes.data ?? []) as ActivityRow[]).map((a) => ({
        id: a.id,
        kind: a.kind,
        summary: a.summary,
        body: a.body,
        occurred_at: a.occurred_at,
        author: a.user_id ? (profileNameById.get(a.user_id) ?? null) : null,
      }))
    : [];

  const hour = centralHour(now);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = profileFirstName(user.fullName, user.email) || "there";

  // Bell total — due work only (call list + tasks overdue/due-today + new
  // leads to claim), not every open task, so it stays a "due now" cue rather
  // than ballooning with tasks that aren't due yet.
  const dueCount = callList.length + overdueTaskCount + dueTodayCount + newAiLeads.length;

  return (
    <PageShell>
      {/* Header — greeting + today's date (CST) + the due-work bell, which
          jumps straight to the Call list, the top-priority queue below. */}
      <Card>
        <CardHead
          title={`${greeting}, ${displayName}`}
          hint={formatDate(now.toISOString())}
          right={<DueBell count={dueCount} targetId="call-list" />}
        />
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <QuickAddContactButton companies={companyOptions} />
        <QuickLogCallButton accounts={companyOptions} contacts={quickTaskContacts} />
        <QuickAddTaskButton
          accounts={companyOptions}
          contacts={quickTaskContacts}
          reps={reps}
          canAssignOthers={canAssignOthers}
          currentUser={currentUser}
        />
      </div>

      {/* Call list — top priority: contacts due today or overdue. */}
      <Card id="call-list" className="scroll-mt-20">
        <CardHead
          title="Call list · Today"
          hint={callList.length ? `${callList.length} due today or overdue` : "Nothing due"}
          right={<AlertCountBadge count={callList.length} />}
        />
        {callList.length === 0 ? (
          <Empty text="No follow-ups due. You're all caught up." />
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {callList.map((c) => (
              <CallListRow key={c.id} contact={c} />
            ))}
          </ul>
        )}
        <CardFooterLink href="/crm/contacts" label="View all follow-ups" />
      </Card>

      {/* Tasks — every open task, org-wide, overdue first. */}
      <Card>
        <CardHead
          title="Tasks"
          hint={combinedTasks.length ? `${combinedTasks.length} open` : "No open tasks"}
          right={<LateBadge count={overdueTaskCount} />}
        />
        {combinedTasks.length === 0 ? (
          <Empty text="No open tasks." />
        ) : (
          <ul className="flex flex-col gap-2.5 p-3">
            {combinedTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                showCompany
                linkTo={t.account_id ? `/crm/accounts/${t.account_id}` : "/crm/tasks"}
                accounts={companyOptions}
                contacts={quickTaskContacts}
                reps={reps}
                canAssignOthers={canAssignOthers}
                currentUser={currentUser}
              />
            ))}
          </ul>
        )}
        <CardFooterLink href="/crm/tasks" label="All tasks" />
      </Card>

      {/* New leads to claim — unclaimed released AI leads. */}
      {newAiLeads.length > 0 && (
        <Card>
          <CardHead
            title="New leads to claim"
            hint={`${newAiLeads.length} released by the AI agent, unclaimed`}
            right={<AlertCountBadge count={newAiLeads.length} />}
          />
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {newAiLeads.map((l) => (
              <NewLeadRow key={l.id} lead={l} />
            ))}
          </ul>
        </Card>
      )}

      {/* Recent activity — owner only. */}
      {isOwner && <ActivityTimeline activities={recentActivities} />}
    </PageShell>
  );
}

/** Red count badge for a CardHead's `right` slot. Renders nothing at zero
 *  since every caller already gates on count when it matters for tone. */
function AlertCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-bad px-2 text-[12px] font-bold tabular-nums text-white shadow-e1">
      {count}
    </span>
  );
}

/** Red "N late" badge for the Tasks card header — only counts OVERDUE tasks
 *  (not due-today), so it reads as an alert rather than a generic total. */
function LateBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-bad px-2.5 text-[12px] font-bold tabular-nums text-white shadow-e1">
      {count} late
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-[13px] text-fg-muted">{text}</p>;
}

/** "View all →" style footer link at the bottom of a queue card. */
function CardFooterLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="border-t border-line-strong px-5 py-3">
      <Link
        href={href}
        prefetch={false}
        className="text-[13px] font-semibold text-accent hover:underline"
      >
        {label} →
      </Link>
    </div>
  );
}
