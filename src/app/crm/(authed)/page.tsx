import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, StatLinkTile, ZEBRA_ROWS } from "./_shell/ui";
import { IconTasks } from "./_shell/icons";
import { ClickableListItem } from "./_shell/ClickableRow";
import { DueBell } from "./DueBell";
import {
  formatDateTime,
  timestampMs,
  firstName as profileFirstName,
  centralDayRange,
} from "./_shell/format";
import { TaskRow, type CrmTaskItem } from "./tasks/TaskRow";
import { callOutcomeLabel, callOutcomeTone } from "./calls/outcomes";
import { stageLabel, stageTone } from "./accounts/lifecycle";
import type { RepOption } from "./accounts/CompanyDialog";
import { QuickAddLeadCard, QuickAddTaskCard, QuickLogCallCard } from "./QuickActions";

export const dynamic = "force-dynamic";

/** Active-pursuit stages — feeds the "Hot & new leads" query below. */
const ACTIVE_STAGES = ["lead", "researching", "contacted", "qualified"] as const;

type TaskRowData = {
  id: string;
  title: string;
  notes: string | null;
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

type Callback = {
  id: string;
  account_id: string | null;
  outcome: string | null;
  reminder_at: string | null;
  summary: string | null;
};

type Followup = {
  id: string;
  name: string;
  account_id: string | null;
  next_followup_at: string | null;
};

type AccountLite = {
  id: string;
  name: string;
  lifecycle_status: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
};

type NewAiLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  commodities: string | null;
  created_at: string;
};

type NeedsFinalizeAccount = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  created_at: string;
};

/**
 * The CRM "What's next" dashboard — the org's live work queue (every
 * employee's tasks, not just the viewer's — see tasksRes below). It answers
 * one question: what should the team do next? Overdue and due-today work
 * sits up top, then follow-ups, then the leads to warm (new/hot). A KPI
 * strip frames the week. Everything is RLS-scoped to the caller's org and
 * every card is tappable straight to the company. force-dynamic keeps it live.
 */
export default async function CrmDashboardPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const now = new Date();
  // Day boundaries are Central calendar-day boundaries — "today" must turn
  // over at Central midnight regardless of the server's own zone (Vercel
  // runs UTC), so overdue/due-today matches what the owner sees on a clock.
  const { startMs: todayStart, endMs: todayEnd } = centralDayRange(now);
  const endOfTodayISO = new Date(todayEnd).toISOString();
  const weekAgoISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    newLeadsRes,
    callsWeekRes,
    tasksRes,
    callbacksRes,
    followupsRes,
    recentAccountsRes,
    stageTallyRes,
    newAiLeadsRes,
    needsFinalizeRes,
    profilesRes,
    companyOptionsRes,
    orgContactsRes,
  ] = await Promise.all([
    // KPI: new leads created in the last 7 days.
    supabase
      .from("crm_accounts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", weekAgoISO),
    // KPI: calls logged in the last 7 days.
    supabase
      .from("crm_calls")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("occurred_at", weekAgoISO),
    // Every open task in the org (drives the Open-tasks KPI + the Overdue /
    // Due-today queues) — NOT filtered to the viewer's own assignments, so
    // the whole team's work is visible here, matching /crm/tasks and the
    // company profile's Tasks section.
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, due_at, priority, status, completed_at, reminder_at, account_id, assigned_user_id",
      )
      .eq("status", "open")
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),
    // Call-back reminders due on or before today.
    supabase
      .from("crm_calls")
      .select("id, account_id, outcome, reminder_at, summary")
      .eq("followup_required", true)
      .is("deleted_at", null)
      .not("reminder_at", "is", null)
      .lte("reminder_at", endOfTodayISO)
      .order("reminder_at", { ascending: true })
      .limit(50),
    // Contact follow-ups due on or before today.
    supabase
      .from("crm_contacts")
      .select("id, name, account_id, next_followup_at")
      .is("deleted_at", null)
      .not("next_followup_at", "is", null)
      .lte("next_followup_at", endOfTodayISO)
      .order("next_followup_at", { ascending: true })
      .limit(50),
    // Hot / new leads — the most recently added active companies.
    supabase
      .from("crm_accounts")
      .select("id, name, lifecycle_status, city, state, created_at")
      .is("deleted_at", null)
      .in("lifecycle_status", ACTIVE_STAGES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(6),
    // Lifecycle breakdown (tallied in JS) — feeds the "Customers" KPI.
    supabase
      .from("crm_accounts")
      .select("lifecycle_status")
      .is("deleted_at", null)
      .limit(2000),
    // Unclaimed released AI leads — the alert. Once assigned_user_id is set
    // (claimed) a lead drops out of this query, out of the /crm/ai-agent tab,
    // and out of the bell/nav badge that share the same predicate (see
    // layout.tsx and _shell/nav.ts).
    supabase
      .from("crm_accounts")
      .select("id, name, city, state, commodities, created_at")
      .in("source", ["ai_agent", "field_capture"])
      .eq("ai_status", "released")
      .is("assigned_user_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    // Quick-created companies (Contacts page "type a new name" path) still
    // waiting on their full details — the finalize alert. Live/visible
    // companies, NOT the pending_review AI queue, so this is a separate
    // predicate from newAiLeadsRes above.
    supabase
      .from("crm_accounts")
      .select("id, name, city, state, created_at")
      .eq("needs_finalize", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    // Assignee names for the task rows below (every org member, not just
    // active ones — an inactive rep can still be shown as a task's owner) —
    // is_active also drives the "Assigned rep" picker in the quick-task
    // dialog (only active reps are offered, matching /crm/tasks).
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    // Company roster for the quick-action dialogs (Quick Add lead's company
    // combobox, Quick Task's Company picker, Quick Log Call's company
    // combobox) — same shape/query as contacts/page.tsx and tasks/page.tsx.
    supabase
      .from("crm_accounts")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(1000),
    // Contact roster (each carrying its own account) for Quick Task's contact
    // picker and Quick Log Call's contact picker, both filtered client-side
    // to whichever company gets selected — same pattern as tasks/page.tsx.
    supabase
      .from("crm_contacts")
      .select("id, name, account_id")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(2000),
  ]);

  const orgTasks = (tasksRes.data ?? []) as TaskRowData[];
  const callbacks = (callbacksRes.data ?? []) as Callback[];
  const followups = (followupsRes.data ?? []) as Followup[];
  const recentAccounts = (recentAccountsRes.data ?? []) as AccountLite[];
  const newAiLeads = (newAiLeadsRes.data ?? []) as NewAiLead[];
  const needsFinalizeAccounts = (needsFinalizeRes.data ?? []) as NeedsFinalizeAccount[];
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileNameById = new Map(
    profiles.map((p) => [p.id, profileFirstName(p.full_name, p.email) || "Unnamed rep"]),
  );

  // ── Quick-action data (KPI strip's first three cards) ──
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

  // Resolve company names for the rows that only carry an account_id.
  const nameIds = [
    ...new Set(
      [
        ...orgTasks.map((t) => t.account_id),
        ...callbacks.map((c) => c.account_id),
        ...followups.map((f) => f.account_id),
      ].filter(Boolean) as string[],
    ),
  ];
  const { data: nameRows } = nameIds.length
    ? await supabase.from("crm_accounts").select("id, name").in("id", nameIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map(
    ((nameRows ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
  );

  // ── Task buckets (whole org) ──
  const tasks: CrmTaskItem[] = orgTasks.map((t) => ({
    ...t,
    companyName: t.account_id ? nameById.get(t.account_id) ?? null : null,
    assigneeName: t.assigned_user_id ? (profileNameById.get(t.assigned_user_id) ?? null) : null,
  }));
  const overdueTasks = tasks.filter((t) => {
    const ms = timestampMs(t.due_at);
    return ms !== null && ms < todayStart;
  });
  const dueTodayTasks = tasks.filter((t) => {
    const ms = timestampMs(t.due_at);
    return ms !== null && ms >= todayStart && ms <= todayEnd;
  });

  // ── Call-back buckets ──
  const overdueCallbacks = callbacks.filter((c) => {
    const ms = timestampMs(c.reminder_at);
    return ms !== null && ms < todayStart;
  });
  const todayCallbacks = callbacks.filter((c) => {
    const ms = timestampMs(c.reminder_at);
    return ms !== null && ms >= todayStart;
  });

  // ── Lifecycle tally ──
  const tally = new Map<string, number>();
  for (const r of (stageTallyRes.data ?? []) as { lifecycle_status: string | null }[]) {
    const key = (r.lifecycle_status ?? "lead").toLowerCase();
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const customerCount = tally.get("customer") ?? 0;

  // Total due-work count — the SAME buckets the queue below renders (overdue
  // tasks + overdue call-backs + due-today tasks + today call-backs + contact
  // follow-ups + unclaimed released AI leads + companies needing finalize).
  // Reused for the "What's next" card bell, its bucket pills and the
  // caught-up state, so the number the bell shows can never drift from the
  // list underneath it — and there is no second query for it.
  const dueCount =
    overdueTasks.length +
    overdueCallbacks.length +
    dueTodayTasks.length +
    todayCallbacks.length +
    followups.length +
    newAiLeads.length +
    needsFinalizeAccounts.length;
  const hasActionable = dueCount > 0;

  return (
    <PageShell>
      {/* KPI strip — the first three are quick-action buttons (open a dialog on
          click, still showing their live count); Customers stays a plain link
          since there's no quick-add flow for a customer. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickAddLeadCard companies={companyOptions} count={newLeadsRes.count ?? 0} />
        <QuickAddTaskCard
          accounts={companyOptions}
          contacts={quickTaskContacts}
          reps={reps}
          canAssignOthers={canAssignOthers}
          currentUser={currentUser}
          count={tasks.length}
        />
        <QuickLogCallCard
          accounts={companyOptions}
          contacts={quickTaskContacts}
          count={callsWeekRes.count ?? 0}
        />
        <StatLinkTile href="/crm/customers" label="Customers" value={String(customerCount)} />
      </div>

      {/* What's next — the summary head of the work queue further down. The bell
          in this card's header carries the TOTAL due count and rings while
          anything is waiting; the pills below break that same total into its
          buckets, so the two can never disagree. Clicking the bell jumps to the
          queue itself. Scoped to this card on this page only. */}
      <Card>
        <CardHead
          title="What's next"
          hint={
            hasActionable
              ? `${dueCount} item${dueCount === 1 ? "" : "s"} waiting on you`
              : "Nothing due right now"
          }
          right={<DueBell count={dueCount} targetId="crm-queue" />}
        />
        {hasActionable ? (
          <div className="flex flex-wrap gap-2 p-4">
            <DuePill
              label="Overdue"
              count={overdueTasks.length + overdueCallbacks.length}
              tone="bg-bad-bg text-bad"
            />
            <DuePill
              label="Due today"
              count={dueTodayTasks.length + todayCallbacks.length}
              tone="bg-warn-bg text-warn"
            />
            <DuePill
              label="Follow-ups"
              count={followups.length}
              tone="bg-inset text-fg-muted"
            />
            <DuePill
              label="New leads"
              count={newAiLeads.length}
              tone="bg-steel-bg text-steel"
            />
            <DuePill
              label="Finalize company"
              count={needsFinalizeAccounts.length}
              tone="bg-warn-bg text-warn"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ok-bg text-ok">
              <IconTasks />
            </span>
            <p className="text-[15px] font-semibold text-fg">You're all caught up</p>
            <p className="max-w-sm text-[13px] text-fg-muted">
              No overdue work, nothing due today, no follow-ups pending, and no new
              leads waiting. Warm a lead below or log a call.
            </p>
          </div>
        )}
      </Card>

      {/* Scroll target for the "What's next" bell — the top of the work queue.
          scroll-mt clears the sticky mobile top bar so the queue isn't tucked
          under it. */}
      <div id="crm-queue" className="scroll-mt-16" aria-hidden />

      {/* Overdue */}
      {(overdueTasks.length > 0 || overdueCallbacks.length > 0) && (
        <Card>
          <CardHead
            title="Overdue"
            hint={`${overdueTasks.length + overdueCallbacks.length} past due`}
            right={<AlertCountBadge count={overdueTasks.length + overdueCallbacks.length} />}
          />
          {overdueTasks.length > 0 && (
            <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
              {overdueTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  showCompany
                  linkTo={t.account_id ? `/crm/accounts/${t.account_id}` : "/crm/tasks"}
                />
              ))}
            </ul>
          )}
          {overdueCallbacks.length > 0 && (
            <ul className={`divide-y divide-line-strong border-t border-line-strong first:border-t-0 ${ZEBRA_ROWS}`}>
              {overdueCallbacks.map((c) => (
                <CallbackRow key={c.id} callback={c} companyName={c.account_id ? nameById.get(c.account_id) ?? null : null} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Due today */}
      {(dueTodayTasks.length > 0 || todayCallbacks.length > 0) && (
        <Card>
          <CardHead
            title="Due today"
            hint={`${dueTodayTasks.length + todayCallbacks.length} tasks and call-backs due today`}
            right={<AlertCountBadge count={dueTodayTasks.length + todayCallbacks.length} />}
          />
          {dueTodayTasks.length > 0 && (
            <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
              {dueTodayTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  showCompany
                  linkTo={t.account_id ? `/crm/accounts/${t.account_id}` : "/crm/tasks"}
                />
              ))}
            </ul>
          )}
          {todayCallbacks.length > 0 && (
            <ul className={`divide-y divide-line-strong border-t border-line-strong first:border-t-0 ${ZEBRA_ROWS}`}>
              {todayCallbacks.map((c) => (
                <CallbackRow key={c.id} callback={c} companyName={c.account_id ? nameById.get(c.account_id) ?? null : null} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* New leads to claim — unclaimed released AI leads, the alert. */}
      {newAiLeads.length > 0 && (
        <Card>
          <CardHead
            title="New leads to claim"
            hint={`${newAiLeads.length} released by the AI agent, unclaimed`}
          />
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {newAiLeads.map((l) => (
              <NewAiLeadRow key={l.id} lead={l} />
            ))}
          </ul>
        </Card>
      )}

      {/* Finalize company — quick-created companies (Contacts page's "type a
          new name" combobox path) still waiting on their full details. */}
      {needsFinalizeAccounts.length > 0 && (
        <Card>
          <CardHead
            title="Finalize company (add more info)"
            hint={`${needsFinalizeAccounts.length} quick-added, missing details`}
          />
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {needsFinalizeAccounts.map((a) => (
              <NeedsFinalizeRow key={a.id} account={a} />
            ))}
          </ul>
        </Card>
      )}

      {/* Follow-ups due */}
      {followups.length > 0 && (
        <Card>
          <CardHead
            title="Follow-ups due"
            hint="Contacts flagged for follow-up"
          />
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {followups.map((f) => (
              <FollowupRow
                key={f.id}
                followup={f}
                companyName={f.account_id ? nameById.get(f.account_id) ?? null : null}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* Leads to warm */}
      <Card>
        <CardHead title="Hot & new leads" hint="Most recently added" />
        {recentAccounts.length === 0 ? (
          <Empty text="No active leads yet. Add a company to get started." />
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {recentAccounts.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

/** One bucket of the "What's next" total. Rendered only when it has items, so
 *  the row shows what is actually waiting rather than a wall of zeroes. */
function DuePill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${tone}`}
    >
      {label}
      <span className="font-mono tabular-nums">{count}</span>
    </span>
  );
}

/** Red count badge for a CardHead's `right` slot — the Overdue/Due today
 *  queue sections' at-a-glance alert, same solid `bg-bad` token DueBell and
 *  DuePill's Overdue tone already use. Renders nothing at zero since both
 *  callers already gate the whole card on count > 0. */
function AlertCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-bad px-2 text-[12px] font-bold tabular-nums text-white shadow-e1">
      {count}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-[13px] text-fg-muted">{text}</p>;
}

function CallbackRow({
  callback,
  companyName,
}: {
  callback: Callback;
  companyName: string | null;
}) {
  const content = (
    <>
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${callOutcomeTone(callback.outcome)}`}
          >
            {callOutcomeLabel(callback.outcome)}
          </span>
          <span className="text-[13px] font-medium text-fg">Call back</span>
        </div>
        {callback.summary && (
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-fg-muted">
            {callback.summary}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-fg-subtle">
          <span>{formatDateTime(callback.reminder_at)}</span>
          {companyName && callback.account_id && (
            <>
              <span>·</span>
              <Link
                href={`/crm/accounts/${callback.account_id}`}
                prefetch={false}
                className="font-medium text-accent hover:underline"
              >
                {companyName}
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (callback.account_id) {
    return (
      <ClickableListItem href={`/crm/accounts/${callback.account_id}`} className="flex items-start gap-3 px-5 py-3.5">
        {content}
      </ClickableListItem>
    );
  }
  return <li className="flex items-start gap-3 px-5 py-3.5">{content}</li>;
}

function FollowupRow({
  followup,
  companyName,
}: {
  followup: Followup;
  companyName: string | null;
}) {
  const followupMs = timestampMs(followup.next_followup_at);
  const overdue = followupMs !== null && followupMs < Date.now();
  const content = (
    <>
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-warn" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-fg">{followup.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px]">
          <span className={overdue ? "font-semibold text-bad" : "text-fg-subtle"}>
            {formatDateTime(followup.next_followup_at)}
          </span>
          {companyName && followup.account_id && (
            <>
              <span className="text-fg-subtle">·</span>
              <Link
                href={`/crm/accounts/${followup.account_id}`}
                prefetch={false}
                className="font-medium text-accent hover:underline"
              >
                {companyName}
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );

  // No standalone contact-profile page to link to — the company profile
  // (where this contact and its follow-up both live) is the meaningful
  // destination, same fallback ContactsPage's row-click already uses.
  if (followup.account_id) {
    return (
      <ClickableListItem href={`/crm/accounts/${followup.account_id}`} className="flex items-start gap-3 px-5 py-3.5">
        {content}
      </ClickableListItem>
    );
  }
  return <li className="flex items-start gap-3 px-5 py-3.5">{content}</li>;
}

function NewAiLeadRow({ lead }: { lead: NewAiLead }) {
  const location = [lead.city, lead.state].filter(Boolean).join(", ");
  return (
    <li>
      <Link
        href={`/crm/accounts/${lead.id}`}
        prefetch={false}
        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-fg/[0.04]"
      >
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg">{lead.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-fg-subtle">
            {[location, lead.commodities].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-steel-bg px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-steel">
          New
        </span>
      </Link>
    </li>
  );
}

function NeedsFinalizeRow({ account }: { account: NeedsFinalizeAccount }) {
  const location = [account.city, account.state].filter(Boolean).join(", ");
  return (
    <li>
      <Link
        href={`/crm/accounts/${account.id}`}
        prefetch={false}
        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-fg/[0.04]"
      >
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg">{account.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-fg-subtle">{location || "No location on file"}</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-warn-bg px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn">
          Needs info
        </span>
      </Link>
    </li>
  );
}

function AccountRow({ account }: { account: AccountLite }) {
  const location = [account.city, account.state].filter(Boolean).join(", ");
  return (
    <li>
      <Link
        href={`/crm/accounts/${account.id}`}
        prefetch={false}
        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-fg/[0.04]"
      >
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-fg">{account.name}</p>
          {location && (
            <p className="mt-0.5 text-[12px] text-fg-subtle">{location}</p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(account.lifecycle_status)}`}
        >
          {stageLabel(account.lifecycle_status)}
        </span>
      </Link>
    </li>
  );
}
