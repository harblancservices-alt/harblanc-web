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
  /** crm_tasks.notes — WHY this task exists. Auto-created tasks now carry a
   * brief derived from the company's real state (see
   * admin/companies/assignmentTask.ts::assignmentBrief); before that they
   * were, in Brent's word, silent. Null when there is nothing to say. */
  brief: string | null;
  /** crm_tasks.definition_of_done — what finishing looks like, where there
   * is an obvious answer. Null otherwise, deliberately. */
  doneWhen: string | null;
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
 * NEWLY ASSIGNED AND NOT YET WORKED — the dashboard's third area.
 *
 * Brent's rule (2026-08-26): the dashboard does NOT show an agent's roster.
 * That lives on the Companies page. It shows only companies handed to them
 * that they have not acted on yet, and a company LEAVES the list when the
 * agent does something meaningful with it.
 *
 * THE TRIGGER IS LOGGING A CONTACT. He left the exact action to the profile
 * redesign; a logged contact is the natural one, because it is the only
 * thing on that page that means "I have actually engaged with this
 * business" — opening a profile, reading it, or editing a field are all
 * things you can do without touching the customer. It is also already
 * defined and already shared: lastContactMs is lib/crm/lastContact.ts's
 * rule, the later of the last logged call and the last CONTACT-kind
 * activity, which is what stops a record-created event counting as work.
 *
 * So the whole rule is: assigned to me, and lastContactMs is null.
 *
 * DERIVED, NEVER STORED — same call as the completeness gaps. There is no
 * "acknowledged" flag to set, nothing to reap, and nothing that can drift
 * out of step with the calls table.
 *
 * NEWEST FIRST, because "new" is the point. Falls back to name order when
 * created_at is unavailable, so the list never reshuffles at random.
 */
/** How long a company counts as "just landed". After this it is not an
 * arrival any more — it is simply work you have not started, which is what
 * the call list and Gaps to fill are for. */
export const ARRIVAL_WINDOW_DAYS = 14;

/**
 * NEW ARRIVALS — what has landed on this agent that they have not acted on.
 *
 * Two conditions, and the second one is new: never contacted AND arrived
 * recently. Without the time bound this was an unbounded backlog wearing an
 * inbox's clothes — a company nobody ever called stayed a "new arrival"
 * forever, so the column could only ever grow and the word "new" stopped
 * being true. Now it drains: you either triage it or it ages out into the
 * ordinary working list.
 *
 * ARRIVAL TIME IS created_at, and that is a real limitation worth stating.
 * crm_accounts has no assigned_at, and assignCompanies logs no activity, so
 * there is no record of when a company landed on a particular desk. In
 * practice these arrive as BOL/OTR imports that are created and handed out
 * in the same run, so created_at is the arrival — but a company created
 * months ago and reassigned today will not appear here. Fixing that
 * properly means a new column and a backfill policy, which is a bigger
 * decision than this column.
 */
export function newlyAssigned(
  companies: AgentCompany[],
  now: Date = new Date(),
): AgentCompany[] {
  const cutoff = now.getTime() - ARRIVAL_WINDOW_DAYS * 86_400_000;
  return companies
    .filter((c) => c.lastContactMs === null)
    .filter((c) => c.createdMs != null && c.createdMs >= cutoff)
    .sort((a, b) => {
      const am = a.createdMs ?? null;
      const bm = b.createdMs ?? null;
      if (am !== null && bm !== null && am !== bm) return bm - am;
      if (am === null && bm !== null) return 1;
      if (bm === null && am !== null) return -1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Companies never contacted that have aged PAST the arrival window.
 *
 * They are not shown as arrivals any more, but they have not been dealt
 * with either, so the column says how many are waiting rather than letting
 * them vanish silently. Their work is in the call list by then.
 */
export function agedOutArrivals(
  companies: AgentCompany[],
  now: Date = new Date(),
): AgentCompany[] {
  const cutoff = now.getTime() - ARRIVAL_WINDOW_DAYS * 86_400_000;
  return companies.filter(
    (c) => c.lastContactMs === null && (c.createdMs == null || c.createdMs < cutoff),
  );
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

