import { taskDueBucket, daysLate, type TaskDueBucket } from "@/lib/crm/taskUrgency";
import { lastContactStatus, timestampMs, centralDayRange } from "../_shell/format";
import { normalizeStage, STALE_DAYS_BY_STAGE } from "../accounts/lifecycle";
import type { CompanyCardData } from "../_shell/companyCardModel";

/**
 * The agent dashboard's row shapes and every pure derivation over them.
 *
 * A PLAIN module — no React, no DB — same contract as admin/workItem.ts,
 * admin/companies/companyRow.ts and operations/loads/loadRow.ts. The server
 * page builds these arrays from the existing data layer and hands them to a
 * client component; everything in between is testable without a browser.
 *
 * NOTHING here defines a new rule. Due/overdue comes from
 * lib/crm/taskUrgency.ts (the same module the global Tasks page and the
 * owner dashboard use), "last activity" comes from format.ts's
 * lastContactStatus, and "gone quiet" comes from accounts/lifecycle.ts's
 * STALE_DAYS_BY_STAGE. This file only arranges them.
 */

export type AgentTask = {
  id: string;
  title: string;
  /** ISO due_at, or null for an undated task. */
  dueAt: string | null;
  /** crm_tasks.account_id — the company the task hangs off, if any. */
  accountId: string | null;
  companyName: string | null;
  /** Short trailing hint next to the company ("from OTR", "gone quiet"). */
  hint: string | null;
  /** Who to speak to at the company — enough to act without opening it. */
  contactName: string | null;
  /** crm_tasks.priority = 'high'. One quiet marker or nothing. */
  isHigh: boolean;
};

/**
 * An agent's company IS the shared company card (see _shell/companyCard.ts).
 * The dashboard and the pipeline board show the same facts about a company,
 * so they share one type rather than two that drift apart.
 */
export type AgentCompany = CompanyCardData;

/** The mockup's three headed groups, in order, plus everything past them. */
export type AgentWorkGroups = {
  overdue: AgentTask[];
  today: AgentTask[];
  thisWeek: AgentTask[];
  /**
   * Due beyond the week, or undated. Not given a heading of its own — it is
   * the "+ N more" tail. Kept as rows, not just a count, so expanding is a
   * client-side reveal rather than another round trip.
   */
  later: AgentTask[];
};

/** Sort inside a group: soonest due first, undated last, then by title so
 * the order is stable across renders rather than however Postgres felt. */
function byDue(a: AgentTask, b: AgentTask): number {
  const am = timestampMs(a.dueAt);
  const bm = timestampMs(b.dueAt);
  if (am === null && bm === null) return a.title.localeCompare(b.title);
  if (am === null) return 1;
  if (bm === null) return -1;
  if (am !== bm) return am - bm;
  return a.title.localeCompare(b.title);
}

/**
 * Split an agent's open tasks into the dashboard's groups.
 *
 * "later" collects BOTH far-future and undated tasks. An undated task is
 * still the agent's work and must not vanish off their screen — it just has
 * nothing to sort it by, so it sits at the bottom of the tail.
 */
export function groupAgentWork(tasks: AgentTask[], now: Date = new Date()): AgentWorkGroups {
  const groups: AgentWorkGroups = { overdue: [], today: [], thisWeek: [], later: [] };
  for (const task of tasks) {
    const bucket: TaskDueBucket = taskDueBucket(task.dueAt, now);
    if (bucket === "overdue") groups.overdue.push(task);
    else if (bucket === "today") groups.today.push(task);
    else if (bucket === "this_week") groups.thisWeek.push(task);
    else groups.later.push(task);
  }
  groups.overdue.sort(byDue);
  groups.today.sort(byDue);
  groups.thisWeek.sort(byDue);
  groups.later.sort(byDue);
  return groups;
}

/**
 * What to print in a task row's due column.
 *
 * Overdue reads as lateness ("4 days late") rather than a date, because the
 * number an agent needs there is how far behind they are, not which Tuesday
 * it was. Everything inside the week reads as a weekday, and anything past
 * it falls back to a date.
 */
export function dueLabel(dueAt: string | null, now: Date = new Date()): string {
  const bucket = taskDueBucket(dueAt, now);
  if (bucket === "none") return "no date";
  if (bucket === "today") return "today";
  if (bucket === "overdue") {
    const late = daysLate(dueAt, now);
    return late === 1 ? "1 day late" : `${late} days late`;
  }
  const ms = timestampMs(dueAt);
  if (ms === null) return "no date";
  const date = new Date(ms);
  if (bucket === "this_week") {
    // Tomorrow gets named rather than abbreviated — "Tue" a day out reads as
    // further off than it is.
    const { endMs } = centralDayRange(now);
    if (ms <= endMs + 86_400_000) return "tomorrow";
    return date.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short" });
  }
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  });
}

/** Row tint for the due column — the same three tiers the rest of the CRM
 * colours urgency with. */
export type DueTint = "late" | "now" | "soon" | "calm";

export function dueTint(dueAt: string | null, now: Date = new Date()): DueTint {
  const bucket = taskDueBucket(dueAt, now);
  if (bucket === "overdue") return "late";
  if (bucket === "today") return "now";
  if (bucket === "this_week") return "soon";
  return "calm";
}

/**
 * A company's "why is this on my list" flag.
 *
 * "new" — never contacted at all. "quiet" — contacted, but longer ago than
 * this stage's own patience allows (STALE_DAYS_BY_STAGE). A stage with no
 * configured threshold (a won customer, a lost account) never flags: it has
 * nothing to chase, which is exactly what that table already encodes.
 */
export type CompanyFlag = "new" | "quiet" | null;

export function companyFlag(company: AgentCompany, now: Date = new Date()): CompanyFlag {
  if (company.lastContactMs === null) return "new";
  const threshold = STALE_DAYS_BY_STAGE[normalizeStage(company.stage)];
  if (threshold === undefined) return null;
  const days = Math.floor((now.getTime() - company.lastContactMs) / 86_400_000);
  return days >= threshold ? "quiet" : null;
}

/**
 * The last-activity readout — the TEXT is delegated whole to the Companies
 * list's own helper so both screens say the same thing about the same
 * company.
 *
 * The TONE is not lastContactStatus's `freshness`, though. That scale is a
 * flat one (a week is "fresh" for everybody), and against real data it
 * produced rows reading green while carrying a red "quiet" flag two pixels
 * below — a company 8 days quiet at the Contacted stage is 3 days past what
 * that stage allows, and calling it fresh contradicts the flag. So the flag
 * leads: if this company is flagged, the number is coloured to match it, and
 * only an unflagged company falls back to the generic freshness scale.
 */
export type ActivityTone = "good" | "warn" | "bad" | "plain";

export function activityStatus(
  company: AgentCompany,
  now: Date = new Date(),
): { text: string; tone: ActivityTone } {
  const { text, freshness } = lastContactStatus(company.lastContactMs, now);
  const flag = companyFlag(company, now);
  if (flag === "new") return { text, tone: "bad" };
  if (flag === "quiet") return { text, tone: "warn" };
  if (freshness === "fresh") return { text, tone: "good" };
  if (freshness === "aging") return { text, tone: "warn" };
  return { text, tone: freshness === "cold" ? "bad" : "plain" };
}

/**
 * Order for "Your companies": the ones needing attention first.
 *
 * Never-contacted is the worst case, so it sorts as colder than any
 * contacted company rather than sinking to the bottom as a missing value —
 * the same rule Admin -> Companies sorts by (companyRow.ts::sortForAdmin),
 * minus its unassigned-first tier, which is meaningless here since every row
 * on this screen is already owned by the viewer.
 */
export function sortAgentCompanies(companies: AgentCompany[]): AgentCompany[] {
  return [...companies].sort((a, b) => {
    const am = a.lastContactMs ?? -Infinity;
    const bm = b.lastContactMs ?? -Infinity;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name);
  });
}
