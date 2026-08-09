import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, ZEBRA_ROWS } from "./_shell/ui";
import {
  formatDate,
  timestampMs,
  firstName as profileFirstName,
  centralDayRange,
  titleCaseWords,
} from "./_shell/format";
import { parsePhones } from "./_shell/contactFields";
import { TaskRow, type CrmTaskItem } from "./tasks/TaskRow";
import type { RepOption } from "./accounts/CompanyDialog";
import {
  QuickAddContactButton,
  QuickAddCompanyButton,
  QuickLogCallButton,
  QuickAddTaskButton,
  HeaderAddCompanyButton,
} from "./QuickActions";
import { DashboardSearch, type SearchContactOption } from "./DashboardSearch";
import { NextUpFollowupCard, type CallListContact } from "./NextUpFollowupCard";
import { RecentActivityCard, type RecentActivityItem } from "./RecentActivityCard";
import { PipelineSection, type PipelineCounts } from "./PipelineSection";
import { NeedsAttentionRow, type NeedsAttentionCompany } from "./NeedsAttentionRow";
import { SELECTABLE_LIFECYCLE_STAGES, normalizeStage, type LifecycleStage } from "./accounts/lifecycle";
import { CRM_ACTIVITY, CRM_CONTACT_ACTIVITY_KINDS } from "@/lib/crm/activity";
import { callOutcomeLabel } from "./calls/outcomes";

export const dynamic = "force-dynamic";

const CENTRAL_TZ = "America/Chicago";
const DAY_MS = 86_400_000;

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

type AccountRow = {
  id: string;
  name: string;
  phone: string | null;
  phones: unknown;
  lifecycle_status: string | null;
  created_at: string;
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
 * The CRM dashboard — rebuilt around Brent's approved mockup: NO KPI stat
 * cards. Order top to bottom: header (greeting + due count + search + Add),
 * a button cockpit (the primary quick actions, replacing the KPI row),
 * What's next (today's due tasks + follow-ups, merged into one queue),
 * Recent activity (org-wide calls/notes/timeline events), Pipeline (company
 * count per lifecycle stage), and Needs attention (companies gone quiet).
 * Everything RLS-scoped to the caller's org; force-dynamic keeps it live.
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

  const [
    followupContactsRes,
    openTasksRes,
    profilesRes,
    companyOptionsRes,
    orgContactsRes,
    allAccountsRes,
    recentCallsRes,
    recentNotesRes,
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
    // Assignee/author names for tasks + recent activity, and the rep roster
    // for the quick-action dialogs' "Assigned rep" picker.
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    // Company roster for the quick-action dialogs.
    supabase
      .from("crm_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(1000),
    // Contact roster for the quick-task/quick-call dialogs' contact pickers.
    supabase
      .from("crm_contacts")
      .select("id, name, account_id")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(2000),
    // Every non-deleted, released company — the shared source for BOTH the
    // Pipeline stage counts and the Needs-attention staleness ranking, so
    // that data is fetched exactly once.
    supabase
      .from("crm_accounts")
      .select("id, name, phone, phones, lifecycle_status, created_at")
      .is("deleted_at", null)
      .or("ai_status.is.null,ai_status.neq.pending_review")
      .limit(500),
    // Recent activity feed — latest calls...
    supabase
      .from("crm_calls")
      .select("id, account_id, contact_id, outcome, summary, occurred_at, user_id")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(8),
    // ...latest human notes...
    supabase
      .from("crm_notes")
      .select("id, account_id, contact_id, body, is_ai, created_at, user_id")
      .is("deleted_at", null)
      .eq("is_ai", false)
      .order("created_at", { ascending: false })
      .limit(8),
    // ...and other timeline events (stage moves, contacts added, etc.) —
    // calls/notes are excluded here since they're already covered above.
    supabase
      .from("crm_activities")
      .select("id, account_id, contact_id, kind, summary, occurred_at, user_id")
      .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`)
      .order("occurred_at", { ascending: false })
      .limit(8),
  ]);

  const followupRows = (followupContactsRes.data ?? []) as FollowupContactRow[];
  const openTaskRows = (openTasksRes.data ?? []) as TaskRowData[];
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileNameById = new Map(
    profiles.map((p) => [p.id, profileFirstName(p.full_name, p.email) || "Unnamed rep"]),
  );
  const allAccounts = (allAccountsRes.data ?? []) as AccountRow[];

  // ── Quick-action data ──
  const companyOptions = ((companyOptionsRes.data ?? []) as { id: string; name: string }[]).map(
    (a) => ({ id: a.id, name: titleCaseWords(a.name) }),
  );
  const orgContacts = (orgContactsRes.data ?? []) as {
    id: string;
    name: string;
    account_id: string | null;
  }[];
  const quickTaskContacts = orgContacts.map((c) => ({
    id: c.id,
    name: titleCaseWords(c.name),
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

  // Resolve company names — the "all accounts" roster already covers almost
  // everything; a small fallback query fills in anything it doesn't (a
  // pending-review AI lead with a task attached, for instance).
  const nameById = new Map(allAccounts.map((a) => [a.id, titleCaseWords(a.name)]));
  const companyPhoneById = new Map(
    allAccounts.map((a) => [a.id, parsePhones(a.phones)[0]?.number || a.phone || null]),
  );
  const missingNameIds = [
    ...new Set(
      [
        ...openTaskRows.map((t) => t.account_id),
        ...followupRows.map((c) => c.account_id),
        ...((recentCallsRes.data ?? []) as { account_id: string | null }[]).map((r) => r.account_id),
        ...((recentNotesRes.data ?? []) as { account_id: string | null }[]).map((r) => r.account_id),
        ...((recentActivitiesRes.data ?? []) as { account_id: string | null }[]).map((r) => r.account_id),
      ].filter((id): id is string => Boolean(id) && !nameById.has(id as string)),
    ),
  ];
  if (missingNameIds.length) {
    const { data: extraRows } = await supabase
      .from("crm_accounts")
      .select("id, name, phone, phones")
      .in("id", missingNameIds);
    for (const a of (extraRows ?? []) as { id: string; name: string; phone: string | null; phones: unknown }[]) {
      nameById.set(a.id, titleCaseWords(a.name));
      companyPhoneById.set(a.id, parsePhones(a.phones)[0]?.number || a.phone || null);
    }
  }

  // Search-box rosters — same orgContacts roster as the quick-task picker,
  // just carrying a resolved company name for display instead of a raw id.
  const searchContacts: SearchContactOption[] = quickTaskContacts.map((c) => ({
    id: c.id,
    name: c.name,
    companyName: c.accountId ? (nameById.get(c.accountId) ?? null) : null,
  }));

  // ── What's next — merge follow-up contacts + open tasks into one queue,
  // sorted overdue-first, then due-today, then everything else. ──
  const callList: CallListContact[] = followupRows.map((c) => {
    const ms = timestampMs(c.next_followup_at);
    return {
      id: c.id,
      name: titleCaseWords(c.name),
      account_id: c.account_id,
      companyName: c.account_id ? (nameById.get(c.account_id) ?? null) : null,
      next_followup_at: c.next_followup_at,
      notes: c.notes,
      phone: parsePhones(c.phones)[0]?.number || c.phone || null,
      overdue: ms !== null && ms < todayStart,
    };
  });

  const allOpenTasks: CrmTaskItem[] = openTaskRows.map((t) => ({
    ...t,
    companyName: t.account_id ? (nameById.get(t.account_id) ?? null) : null,
    assigneeName: t.assigned_user_id ? (profileNameById.get(t.assigned_user_id) ?? null) : null,
    companyPhone: t.account_id ? (companyPhoneById.get(t.account_id) ?? null) : null,
  }));
  const taskDueBucket = (t: CrmTaskItem) => {
    const ms = timestampMs(t.due_at);
    if (ms !== null && ms < todayStart) return 0; // overdue
    if (ms !== null && ms <= todayEnd) return 1; // due today
    return 2; // no due date, or a future one
  };
  const dueTodayCount = allOpenTasks.filter((t) => taskDueBucket(t) === 1).length;
  const overdueTaskCount = allOpenTasks.filter((t) => taskDueBucket(t) === 0).length;
  const overdueFollowupCount = callList.filter((c) => c.overdue).length;

  type NextItem = { bucket: number; ms: number; node: React.ReactNode };
  const nextItems: NextItem[] = [
    ...callList.map((c) => ({
      bucket: c.overdue ? 0 : 1,
      ms: timestampMs(c.next_followup_at) ?? Number.POSITIVE_INFINITY,
      node: <NextUpFollowupCard key={`followup-${c.id}`} contact={c} />,
    })),
    ...allOpenTasks.map((t) => ({
      bucket: taskDueBucket(t),
      ms: timestampMs(t.due_at) ?? Number.POSITIVE_INFINITY,
      node: (
        <TaskRow
          key={`task-${t.id}`}
          task={t}
          showCompany
          linkTo={t.account_id ? `/crm/accounts/${t.account_id}` : "/crm/tasks"}
          accounts={companyOptions}
          contacts={quickTaskContacts}
          reps={reps}
          canAssignOthers={canAssignOthers}
          currentUser={currentUser}
        />
      ),
    })),
  ].sort((a, b) => a.bucket - b.bucket || a.ms - b.ms);

  // ── Recent activity — latest calls/notes/timeline events, org-wide. ──
  type MergedActivity = {
    id: string;
    kind: RecentActivityItem["kind"];
    accountId: string | null;
    occurredAt: string;
    userId: string | null;
    detail: string;
  };
  const callActivity: MergedActivity[] = (
    (recentCallsRes.data ?? []) as {
      id: string;
      account_id: string | null;
      outcome: string | null;
      summary: string | null;
      occurred_at: string;
      user_id: string | null;
    }[]
  ).map((c) => ({
    id: c.id,
    kind: "call",
    accountId: c.account_id,
    occurredAt: c.occurred_at,
    userId: c.user_id,
    detail: `${callOutcomeLabel(c.outcome)}${c.summary ? `: ${c.summary}` : ""}`,
  }));
  const noteActivity: MergedActivity[] = (
    (recentNotesRes.data ?? []) as {
      id: string;
      account_id: string | null;
      body: string;
      created_at: string;
      user_id: string | null;
    }[]
  ).map((n) => ({
    id: n.id,
    kind: "note",
    accountId: n.account_id,
    occurredAt: n.created_at,
    userId: n.user_id,
    detail: n.body.length > 140 ? `${n.body.slice(0, 140)}…` : n.body,
  }));
  const timelineActivity: MergedActivity[] = (
    (recentActivitiesRes.data ?? []) as {
      id: string;
      account_id: string | null;
      summary: string | null;
      occurred_at: string;
      user_id: string | null;
    }[]
  ).map((a) => ({
    id: a.id,
    kind: "activity",
    accountId: a.account_id,
    occurredAt: a.occurred_at,
    userId: a.user_id,
    detail: a.summary || "Activity",
  }));
  const recentActivityItems: RecentActivityItem[] = [...callActivity, ...noteActivity, ...timelineActivity]
    .sort((a, b) => (timestampMs(b.occurredAt) ?? 0) - (timestampMs(a.occurredAt) ?? 0))
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      accountId: m.accountId,
      companyName: m.accountId ? (nameById.get(m.accountId) ?? null) : null,
      detail: m.detail,
      occurredAt: m.occurredAt,
      author: m.userId ? (profileNameById.get(m.userId) ?? null) : null,
    }));

  // ── Pipeline — company count per lifecycle stage. ──
  const pipelineCounts = Object.fromEntries(
    SELECTABLE_LIFECYCLE_STAGES.map((s) => [s, 0]),
  ) as PipelineCounts;
  for (const a of allAccounts) {
    const stage = normalizeStage(a.lifecycle_status);
    if (stage in pipelineCounts) pipelineCounts[stage as LifecycleStage] += 1;
  }

  // ── Needs attention — companies gone quiet: the longest since a logged
  // call or a genuine contact-kind activity (matching the Companies list'
  // "last contact" computation), excluding terminal stages (already dead,
  // nothing to chase) and brand-new leads that simply haven't been worked
  // yet (created within the last 3 days with no contact logged). ──
  const accountIds = allAccounts.map((a) => a.id);
  const [lastCallsRes, lastActivitiesRes] = accountIds.length
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
      ])
    : [{ data: [] as { account_id: string; occurred_at: string }[] }, { data: [] as { account_id: string; occurred_at: string }[] }];

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

  const STALE_THRESHOLD_DAYS = 7;
  const NEW_LEAD_GRACE_DAYS = 3;
  const needsAttention: NeedsAttentionCompany[] = allAccounts
    .filter((a) => {
      const stage = normalizeStage(a.lifecycle_status);
      if (stage === "lost" || stage === "inactive") return false;
      const ms = lastContactMsByAccount.get(a.id);
      if (ms === undefined) {
        const createdMs = timestampMs(a.created_at);
        return createdMs === null || now.getTime() - createdMs >= NEW_LEAD_GRACE_DAYS * DAY_MS;
      }
      return now.getTime() - ms >= STALE_THRESHOLD_DAYS * DAY_MS;
    })
    .sort((a, b) => (lastContactMsByAccount.get(a.id) ?? -Infinity) - (lastContactMsByAccount.get(b.id) ?? -Infinity))
    .slice(0, 5)
    .map((a) => {
      const ms = lastContactMsByAccount.get(a.id);
      return {
        id: a.id,
        name: titleCaseWords(a.name),
        phone: parsePhones(a.phones)[0]?.number || a.phone || null,
        daysSinceContact: ms === undefined ? null : Math.floor((now.getTime() - ms) / DAY_MS),
      };
    });

  const hour = centralHour(now);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = profileFirstName(user.fullName, user.email) || "there";

  return (
    <PageShell>
      {/* Header — greeting + date (CST) + due-today count + search + Add. */}
      <Card>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[19px] font-bold text-fg">
                {greeting}, {displayName}
              </h1>
              <p className="mt-0.5 text-[13px] text-fg-muted">{formatDate(now.toISOString())}</p>
            </div>
            <p
              className={`shrink-0 text-[13px] font-semibold ${dueTodayCount > 0 ? "text-warn" : "text-fg-muted"}`}
            >
              {dueTodayCount > 0
                ? `${dueTodayCount} task${dueTodayCount === 1 ? "" : "s"} due today`
                : "No tasks due today"}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <DashboardSearch companies={companyOptions} contacts={searchContacts} />
            <HeaderAddCompanyButton reps={reps} />
          </div>
        </div>
      </Card>

      {/* Button cockpit — the primary quick actions, top of page (replaces
          the old KPI stat-tile row). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLogCallButton accounts={companyOptions} contacts={quickTaskContacts} />
        <QuickAddTaskButton
          accounts={companyOptions}
          contacts={quickTaskContacts}
          reps={reps}
          canAssignOthers={canAssignOthers}
          currentUser={currentUser}
        />
        <QuickAddCompanyButton reps={reps} />
        <QuickAddContactButton companies={companyOptions} />
      </div>

      {/* What's next — today's due follow-ups + tasks, merged, overdue first. */}
      <Card id="next-up" className="scroll-mt-20">
        <CardHead
          title="What's next · Today"
          hint={nextItems.length ? `${nextItems.length} due` : "Nothing due"}
          right={<LateBadge count={overdueTaskCount + overdueFollowupCount} />}
        />
        {nextItems.length === 0 ? (
          <Empty text="Nothing due today. You're all caught up." />
        ) : (
          <ul className="flex flex-col gap-2.5 p-3">{nextItems.map((item) => item.node)}</ul>
        )}
      </Card>

      {/* Recent activity — latest calls/notes/timeline events, org-wide. */}
      <RecentActivityCard items={recentActivityItems} />

      {/* Pipeline — company count per lifecycle stage. */}
      <PipelineSection counts={pipelineCounts} />

      {/* Needs attention — companies gone quiet. */}
      <Card>
        <CardHead
          title="Needs attention"
          hint={needsAttention.length ? `${needsAttention.length} gone quiet` : undefined}
        />
        {needsAttention.length === 0 ? (
          <Empty text="Nothing needs attention. Every account is being worked." />
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {needsAttention.map((c) => (
              <NeedsAttentionRow key={c.id} company={c} />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

/** Red "N late" badge for the What's-next card header — only counts OVERDUE
 *  items (not due-today), so it reads as an alert rather than a generic total. */
function LateBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-6 shrink-0 items-center justify-center bg-bad px-2.5 text-[12px] font-bold tabular-nums text-white shadow-e1">
      {count} late
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-[13px] text-fg-muted">{text}</p>;
}
