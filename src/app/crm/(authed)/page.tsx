import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, StatTile } from "./_shell/ui";
import { IconTasks } from "./_shell/icons";
import { DueBell } from "./DueBell";
import { formatDateTime } from "./_shell/format";
import { TaskRow, type CrmTaskItem } from "./tasks/TaskRow";
import { callOutcomeLabel, callOutcomeTone } from "./calls/outcomes";
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_LABEL,
  LIFECYCLE_TONE,
  stageLabel,
  stageTone,
} from "./accounts/lifecycle";

export const dynamic = "force-dynamic";

/** Active-pursuit stages — the ones that can go "stale" if left untouched. */
const ACTIVE_STAGES = ["lead", "researching", "contacted", "qualified"] as const;
/** A company with no activity in this many days (and no open task) is stale. */
const STALE_DAYS = 14;

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

/**
 * The CRM "What's next" dashboard — the rep's live work queue. It answers one
 * question: what should I do next? Overdue and due-today work sits up top, then
 * follow-ups, then the leads to warm (new/hot) and the ones going cold (stale).
 * A KPI strip frames the week. Everything is RLS-scoped to the caller's org and
 * every card is tappable straight to the company. force-dynamic keeps it live.
 */
export default async function CrmDashboardPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const todayStart = startOfToday.getTime();
  const todayEnd = endOfToday.getTime();
  const endOfTodayISO = endOfToday.toISOString();
  const weekAgoISO = weekAgo.toISOString();
  const staleCutoffISO = staleCutoff.toISOString();

  const [
    newLeadsRes,
    callsWeekRes,
    myTasksRes,
    callbacksRes,
    followupsRes,
    recentAccountsRes,
    stageTallyRes,
    activeAccountsRes,
    recentActivityRes,
    openTaskAcctsRes,
    newAiLeadsRes,
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
      .gte("occurred_at", weekAgoISO),
    // My open tasks (drives the Open-tasks KPI + the Overdue / Due-today queues).
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, due_at, priority, status, completed_at, reminder_at, account_id, assigned_user_id",
      )
      .eq("assigned_user_id", user.id)
      .eq("status", "open")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),
    // Call-back reminders due on or before today.
    supabase
      .from("crm_calls")
      .select("id, account_id, outcome, reminder_at, summary")
      .eq("followup_required", true)
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
    // Lifecycle breakdown (tallied in JS).
    supabase
      .from("crm_accounts")
      .select("lifecycle_status")
      .is("deleted_at", null)
      .limit(2000),
    // Staleness inputs: the active companies…
    supabase
      .from("crm_accounts")
      .select("id, name, lifecycle_status, city, state, created_at")
      .is("deleted_at", null)
      .in("lifecycle_status", ACTIVE_STAGES as unknown as string[])
      .order("created_at", { ascending: true })
      .limit(300),
    // …the accounts touched recently…
    supabase
      .from("crm_activities")
      .select("account_id")
      .gte("occurred_at", staleCutoffISO)
      .limit(2000),
    // …and the accounts with an open task (org-wide — anyone's task counts).
    supabase
      .from("crm_tasks")
      .select("account_id")
      .eq("status", "open")
      .limit(2000),
    // Unclaimed released AI leads — the alert. Once assigned_user_id is set
    // (claimed) a lead drops out of this query, and out of the bell/nav badge
    // that share the same predicate (see layout.tsx and _shell/nav.ts).
    supabase
      .from("crm_accounts")
      .select("id, name, city, state, commodities, created_at")
      .eq("source", "ai_agent")
      .eq("ai_status", "released")
      .is("assigned_user_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const myTasks = (myTasksRes.data ?? []) as TaskRowData[];
  const callbacks = (callbacksRes.data ?? []) as Callback[];
  const followups = (followupsRes.data ?? []) as Followup[];
  const recentAccounts = (recentAccountsRes.data ?? []) as AccountLite[];
  const activeAccounts = (activeAccountsRes.data ?? []) as AccountLite[];
  const newAiLeads = (newAiLeadsRes.data ?? []) as NewAiLead[];

  // Resolve company names for the rows that only carry an account_id.
  const nameIds = [
    ...new Set(
      [
        ...myTasks.map((t) => t.account_id),
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

  // ── Task buckets (mine) ──
  const tasks: CrmTaskItem[] = myTasks.map((t) => ({
    ...t,
    companyName: t.account_id ? nameById.get(t.account_id) ?? null : null,
  }));
  const overdueTasks = tasks.filter(
    (t) => t.due_at && new Date(t.due_at).getTime() < todayStart,
  );
  const dueTodayTasks = tasks.filter((t) => {
    if (!t.due_at) return false;
    const ms = new Date(t.due_at).getTime();
    return ms >= todayStart && ms <= todayEnd;
  });

  // ── Call-back buckets ──
  const overdueCallbacks = callbacks.filter(
    (c) => c.reminder_at && new Date(c.reminder_at).getTime() < todayStart,
  );
  const todayCallbacks = callbacks.filter(
    (c) => c.reminder_at && new Date(c.reminder_at).getTime() >= todayStart,
  );

  // ── Staleness ──
  const recentSet = new Set(
    ((recentActivityRes.data ?? []) as { account_id: string | null }[])
      .map((r) => r.account_id)
      .filter(Boolean) as string[],
  );
  const openTaskSet = new Set(
    ((openTaskAcctsRes.data ?? []) as { account_id: string | null }[])
      .map((r) => r.account_id)
      .filter(Boolean) as string[],
  );
  const staleAccounts = activeAccounts
    .filter((a) => !recentSet.has(a.id) && !openTaskSet.has(a.id))
    .slice(0, 8);

  // ── Lifecycle tally ──
  const tally = new Map<string, number>();
  for (const r of (stageTallyRes.data ?? []) as { lifecycle_status: string | null }[]) {
    const key = (r.lifecycle_status ?? "lead").toLowerCase();
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const customerCount = tally.get("customer") ?? 0;

  const firstName = (user.fullName || "there").split(" ")[0];
  // Total due-work count — the SAME buckets the queue below renders (overdue
  // tasks + overdue call-backs + due-today tasks + today call-backs + contact
  // follow-ups + unclaimed released AI leads). Reused for the "What's next"
  // card bell, its bucket pills and the caught-up state, so the number the
  // bell shows can never drift from the list underneath it — and there is no
  // second query for it.
  const dueCount =
    overdueTasks.length +
    overdueCallbacks.length +
    dueTodayTasks.length +
    todayCallbacks.length +
    followups.length +
    newAiLeads.length;
  const hasActionable = dueCount > 0;

  return (
    <PageShell
      eyebrow="Hello Hotshot CRM"
      title={`What's next, ${firstName}`}
      subtitle="Your live work queue — the next moves across your book of business."
    >
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="New leads · 7d" value={String(newLeadsRes.count ?? 0)} />
        <StatTile label="Open tasks" value={String(tasks.length)} />
        <StatTile label="Calls · 7d" value={String(callsWeekRes.count ?? 0)} />
        <StatTile label="Customers" value={String(customerCount)} />
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

      {/* Pipeline by stage */}
      <Card>
        <CardHead title="Pipeline by stage" hint="Companies by lifecycle" />
        <div className="flex flex-wrap gap-2 p-4">
          {LIFECYCLE_STAGES.map((s) => (
            <Link
              key={s}
              href={`/crm/accounts?stage=${s}`}
              prefetch={false}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-opacity hover:opacity-80 ${LIFECYCLE_TONE[s]}`}
            >
              {LIFECYCLE_LABEL[s]}
              <span className="font-mono tabular-nums">{tally.get(s) ?? 0}</span>
            </Link>
          ))}
        </div>
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
          />
          {overdueTasks.length > 0 && (
            <ul className="divide-y divide-line">
              {overdueTasks.map((t) => (
                <TaskRow key={t.id} task={t} showCompany />
              ))}
            </ul>
          )}
          {overdueCallbacks.length > 0 && (
            <ul className="divide-y divide-line border-t border-line first:border-t-0">
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
            hint="Tasks and call-backs due today"
          />
          {dueTodayTasks.length > 0 && (
            <ul className="divide-y divide-line">
              {dueTodayTasks.map((t) => (
                <TaskRow key={t.id} task={t} showCompany />
              ))}
            </ul>
          )}
          {todayCallbacks.length > 0 && (
            <ul className="divide-y divide-line border-t border-line first:border-t-0">
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
          <ul className="divide-y divide-line">
            {newAiLeads.map((l) => (
              <NewAiLeadRow key={l.id} lead={l} />
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
          <ul className="divide-y divide-line">
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

      {/* Leads to warm + leads going cold */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Hot & new leads" hint="Most recently added" />
          {recentAccounts.length === 0 ? (
            <Empty text="No active leads yet. Add a company to get started." />
          ) : (
            <ul className="divide-y divide-line">
              {recentAccounts.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead
            title="Stale leads"
            hint={`No touch in ${STALE_DAYS}d · no open task`}
          />
          {staleAccounts.length === 0 ? (
            <Empty text="Nothing going cold — every active lead has recent activity or a task." />
          ) : (
            <ul className="divide-y divide-line">
              {staleAccounts.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </ul>
          )}
        </Card>
      </div>
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
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
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
    </li>
  );
}

function FollowupRow({
  followup,
  companyName,
}: {
  followup: Followup;
  companyName: string | null;
}) {
  const overdue = followup.next_followup_at
    ? new Date(followup.next_followup_at).getTime() < Date.now()
    : false;
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
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
    </li>
  );
}

function NewAiLeadRow({ lead }: { lead: NewAiLead }) {
  const location = [lead.city, lead.state].filter(Boolean).join(", ");
  return (
    <li>
      <Link
        href={`/crm/accounts/${lead.id}`}
        prefetch={false}
        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-inset"
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

function AccountRow({ account }: { account: AccountLite }) {
  const location = [account.city, account.state].filter(Boolean).join(", ");
  return (
    <li>
      <Link
        href={`/crm/accounts/${account.id}`}
        prefetch={false}
        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-inset"
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
