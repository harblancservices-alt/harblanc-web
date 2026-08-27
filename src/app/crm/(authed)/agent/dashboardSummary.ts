import { daysLate } from "@/lib/crm/taskUrgency";
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
