import { daysLate, taskDueBucket } from "@/lib/crm/taskUrgency";
import { groupAgentWork, newlyAssigned, type AgentTask, type AgentCompany } from "./agentWork";

/**
 * THE SALES DASHBOARD'S NUMBERS AND ITS OPENING SENTENCE.
 *
 * A PLAIN module — no React, no DB. It is handed the rows the dashboard
 * already loads and derives every figure on the command header from them.
 * Nothing here queries anything, and nothing here is stored.
 *
 * ── EVERY NUMBER IS A COUNT OF REAL ROWS ──────────────────────────────
 *
 * The reference design shows a busy morning: 6 calls logged, 3 to triage,
 * 2 overdue, 4 due today, 9 this week. Those are illustrations, not data.
 * On the live database today Brent has 4 companies, 3 open tasks, none
 * overdue, none due today and no calls logged; ACROSS THE WHOLE ORG there
 * are 31 open tasks of which 27 have no due date at all, and zero overdue
 * tasks exist for anybody.
 *
 * So this module's real job is to be honest when the answer is nothing. A
 * metric with no rows behind it reads as a zero with a plain-English
 * sub-line, never as a dash, and never as a borrowed number from the
 * mockup.
 */

export type Metric = {
  key: "logged" | "triage" | "overdue" | "dueToday" | "thisWeek";
  label: string;
  value: number;
  /** The small line under the figure. Null when there is nothing true to
   * say — an empty metric says nothing rather than inventing a caption. */
  sub: string | null;
  /** Only OVERDUE ever sets this, and only when it is non-zero. It is the
   * one number on the strip that means somebody is behind. */
  alarm?: boolean;
};

export type DashboardSummary = {
  greeting: string;
  /** The sentence under the greeting, assembled from what is actually
   * true. Never empty — when there is no work it says so. */
  line: string;
  metrics: Metric[];
  /** How many items the "Work the queue" button will walk through. */
  queueCount: number;
};

/** Morning / Afternoon / Evening, in the org's own timezone rather than the
 * server's — the CRM is Central throughout. */
export function greetingFor(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Chicago",
    }).format(now),
  );
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * THE WORK QUEUE — what "Work the queue · N" actually walks through, in
 * priority order.
 *
 * The order is Brent's: admin-injected urgent first, then overdue, then a
 * new company nobody has triaged, then today, then the rest of the week. It
 * is built from the SAME task rows the panels below render, so the number on
 * the button can never disagree with what is on screen.
 *
 * Companies appear in the queue as well as tasks: a newly arrived company
 * with nobody assigned to call is work even though no task row exists for
 * it yet. That is the whole point of the triage column.
 */
export type QueueItem =
  | { kind: "task"; task: AgentTask }
  | { kind: "company"; company: AgentCompany };

export function workQueue(
  tasks: AgentTask[],
  companies: AgentCompany[],
  now: Date = new Date(),
): QueueItem[] {
  const groups = groupAgentWork(tasks, now);
  const seen = new Set<string>();
  const out: QueueItem[] = [];

  const pushTask = (t: AgentTask) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    out.push({ kind: "task", task: t });
  };

  // 1. Anything an admin marked urgent, wherever it sits in the calendar.
  for (const t of tasks) if (t.isHigh) pushTask(t);
  // 2. Late work.
  groups.overdue.forEach(pushTask);
  // 3. A company that arrived and has never been spoken to.
  for (const c of newlyAssigned(companies)) out.push({ kind: "company", company: c });
  // 4. Today, then the rest of the week.
  groups.today.forEach(pushTask);
  groups.thisWeek.forEach(pushTask);

  return out;
}

export function buildSummary(input: {
  tasks: AgentTask[];
  companies: AgentCompany[];
  /** crm_calls rows logged by this agent today. */
  callsToday: number;
  /** How many of those actually reached somebody. */
  reachedToday: number;
  now: Date;
}): DashboardSummary {
  const { tasks, companies, callsToday, reachedToday, now } = input;
  const groups = groupAgentWork(tasks, now);
  const arrivals = newlyAssigned(companies);
  const weekCount = groups.today.length + groups.thisWeek.length;

  // OVERDUE's sub-line is the oldest one, because "2 overdue" and "2
  // overdue, oldest 3 weeks late" are different problems.
  const oldestLate = groups.overdue.reduce((worst, t) => {
    const d = daysLate(t.dueAt, now);
    return d !== null && d > worst ? d : worst;
  }, 0);

  // DUE TODAY's sub-line names the next one by company and time, so the
  // strip answers "what is next" without scrolling to the queue.
  const nextToday = groups.today[0] ?? null;
  const nextLabel = nextToday
    ? `next: ${nextToday.companyName ?? nextToday.title}${
        nextToday.dueAt
          ? ` — ${new Date(nextToday.dueAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/Chicago",
            })}`
          : ""
      }`
    : null;

  // NEW TO TRIAGE names where they came from rather than asserting "BOL
  // Center & admin" — on this data most arrive as `manual` or `otr`, and
  // claiming a provenance the rows do not have is the thing to avoid.
  const sources = [...new Set(arrivals.map((c) => (c.source ?? "").trim().toLowerCase()).filter(Boolean))];
  const sourceLabel = sources.length
    ? `from ${sources.map((s) => (s === "bol" ? "BOL Center" : s === "otr" ? "OTR" : s)).join(" & ")}`
    : null;

  const metrics: Metric[] = [
    {
      key: "logged",
      label: "Logged today",
      value: callsToday,
      sub: callsToday === 0 ? "no calls yet" : `calls · ${reachedToday} reached`,
    },
    {
      key: "triage",
      label: "New to triage",
      value: arrivals.length,
      sub: arrivals.length === 0 ? "nothing waiting" : sourceLabel,
    },
    {
      key: "overdue",
      label: "Overdue",
      value: groups.overdue.length,
      sub:
        groups.overdue.length === 0
          ? "nothing late"
          : `oldest is ${plural(oldestLate, "day", "days")} late`,
      alarm: groups.overdue.length > 0,
    },
    {
      key: "dueToday",
      label: "Due today",
      value: groups.today.length,
      sub: groups.today.length === 0 ? "nothing booked" : nextLabel,
    },
    {
      key: "thisWeek",
      label: "This week",
      value: weekCount,
      sub: weekCount === 0 ? "nothing scheduled" : "touches through Friday",
    },
  ];

  // ── The sentence. Built from clauses that are each independently true,
  // so it degrades to something sensible rather than to a lie. ──
  const clauses: string[] = [];
  if (arrivals.length) clauses.push(`${plural(arrivals.length, "new arrival", "new arrivals")} to triage`);
  if (groups.overdue.length) clauses.push(`${plural(groups.overdue.length, "overdue task", "overdue tasks")}`);
  if (groups.today.length) clauses.push(`${plural(groups.today.length, "call", "calls")} today`);

  let line: string;
  if (clauses.length === 0) {
    // The honest empty case, and on this database it is the common one.
    const undated = tasks.filter((t) => t.dueAt === null).length;
    line = undated
      ? `Nothing scheduled. ${plural(undated, "task has", "tasks have")} no date on them yet.`
      : "Nothing queued. A quiet one.";
  } else {
    const joined =
      clauses.length === 1
        ? clauses[0]
        : `${clauses.slice(0, -1).join(", ")}, then ${clauses[clauses.length - 1]}`;
    line = `${joined[0].toUpperCase()}${joined.slice(1)}.`;
    if (groups.thisWeek.length === 0) line += " Nothing after today yet.";
  }

  return {
    greeting: greetingFor(now),
    line,
    metrics,
    queueCount: workQueue(tasks, companies, now).length,
  };
}

/* ══════════════════ THE CALL LIST ══════════════════════════════════════ */

/**
 * THE MIDDLE COLUMN — every open task this agent owns, in the order they
 * should be worked.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * It used to be "Today's call queue" and filtered to tasks due today. On
 * Brent's book that is legitimately empty: he has six open tasks, one of
 * which has a due date, none due today and none overdue. So five of his six
 * tasks were invisible on his own dashboard — no date means a task cannot
 * appear in Today, Overdue OR This week, and it survives only in the Tasks
 * inbox. The column was working exactly as designed against a dataset where
 * nothing is dated, which is the worst kind of broken: nothing to fix in
 * the code it lives in.
 *
 * ── WHY NOT JUST DATE THE TASKS ───────────────────────────────────────
 *
 * The other fix was to stamp a due date on assignment. Rejected, and not
 * because it is more work: a due date is a commitment a human made. Four of
 * Brent's five undated tasks are machine-created "Research prospect" rows —
 * nobody promised anything, so nothing is late. Auto-stamping them turns an
 * inbox into a wall of manufactured deadlines and, worse, makes OVERDUE —
 * the one alarm on this screen — mean "the system dated something for you"
 * instead of "you are behind". That breaks the metric rather than filling
 * the column.
 *
 * ── THE ORDER, AND THE ONE DUPLICATION ────────────────────────────────
 *
 * overdue → due today → dated later, soonest first → undated last.
 *
 * Overdue tasks appear here AND in the Overdue column to the right. That
 * duplication is deliberate and was accepted explicitly: the list an agent
 * works top-to-bottom must start with the thing that is already late, and
 * the right-hand column stays as the alarm. Undated last because a task
 * with no date is real work but nobody has committed to when.
 *
 * Buckets come from taskDueBucket — the same function groupAgentWork and
 * dueLabel use — so this cannot drift into a second opinion about what
 * "today" means.
 */
export type CallBand = "overdue" | "today" | "later" | "undated";

export type CallListItem = { task: AgentTask; band: CallBand };

const BAND_ORDER: Record<CallBand, number> = { overdue: 0, today: 1, later: 2, undated: 3 };

export function callList(
  tasks: AgentTask[],
  now: Date = new Date(),
  /**
   * Companies still sitting in New arrivals awaiting triage. Their work is
   * hidden here so the three columns have three jobs instead of two of them
   * showing the same rows.
   *
   * This exists because widening this column CREATED a duplication: before,
   * it filtered to due-today, so a newly assigned company's undated
   * "Research and qualify this company" task was invisible here and New
   * arrivals was its only home. Widening put it in both, and Brent's live
   * dashboard showed A&R Rent-A-Fence and ANJ Electric twice.
   *
   * Triage is a different verb from calling — "is this worth working at
   * all" versus "do the work" — so the company belongs in one column and
   * its tasks in the other, never both. Once triaged, or once the company
   * ages out of the arrival window, its work appears here. Nothing can hide
   * indefinitely.
   *
   * OVERDUE IS NEVER HIDDEN. Late beats tidy: if a task on an untriaged
   * company has gone past its date, it shows here anyway.
   */
  untriagedAccountIds: ReadonlySet<string> = new Set(),
): CallListItem[] {
  const items: CallListItem[] = tasks.map((task) => {
    const bucket = taskDueBucket(task.dueAt, now);
    const band: CallBand =
      bucket === "overdue"
        ? "overdue"
        : bucket === "today"
          ? "today"
          : bucket === "none"
            ? "undated"
            : "later";
    return { task, band };
  }).filter(
    (item) =>
      item.band === "overdue" ||
      !item.task.accountId ||
      !untriagedAccountIds.has(item.task.accountId),
  );

  // Stable: equal-band, equal-date rows keep the order the query returned
  // them in, so the list does not reshuffle between renders.
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const band = BAND_ORDER[a.item.band] - BAND_ORDER[b.item.band];
      if (band !== 0) return band;
      const aMs = a.item.task.dueAt ? Date.parse(a.item.task.dueAt) : null;
      const bMs = b.item.task.dueAt ? Date.parse(b.item.task.dueAt) : null;
      // Ascending within every dated band. For overdue that puts the most
      // late first, which is the same thing said the other way round.
      if (aMs !== null && bMs !== null && aMs !== bMs) return aMs - bMs;
      return a.i - b.i;
    })
    .map(({ item }) => item);
}
