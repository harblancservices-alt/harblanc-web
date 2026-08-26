import { normalizeStage } from "../../accounts/lifecycle";
import { sourceBucket } from "./companyRow";

/**
 * What task to create when an admin hands a company to an agent.
 *
 * A PLAIN module — no React, no DB. The point of step 2: a company cannot be
 * overdue, a task can. Assignment stamps an owner AND puts a clock on the
 * work, so "past due" becomes a real state the Overview can report.
 *
 * task_type values come from tasks/taskType.ts's existing vocabulary rather
 * than a new set — that column is already shared by the task dialog, the
 * calendar, the dashboard and the company Tasks section, and a private
 * vocabulary here would show up as an unrecognised chip on all four.
 */

export type AssignmentTaskSpec = {
  title: string;
  /** crm_tasks.task_type — also the duplicate-guard discriminator. */
  taskType: string;
};

/**
 * NAME-FREE titles on purpose. A bulk assign creates one task per company but
 * with ONE shared title, so a title containing a company name would be wrong
 * on every row but the first. The company is already on the task via
 * account_id; the title says what to DO.
 */
const RESEARCH: AssignmentTaskSpec = {
  title: "Research and qualify this company",
  taskType: "Research prospect",
};
const MATCH_BOL: AssignmentTaskSpec = {
  title: "Match the companies on this bill of lading",
  taskType: "Research prospect",
};
const FOLLOW_UP: AssignmentTaskSpec = {
  title: "Follow up with this company",
  taskType: "Follow-up call",
};
const FIRST_CONTACT: AssignmentTaskSpec = {
  title: "Make first contact",
  taskType: "Cold call",
};

/**
 * Chooses from what the work actually is, using the source and stage that
 * already exist:
 *
 *   OTR      — a name someone gave over the phone; it needs researching.
 *   BOL      — came off a bill of lading; its parties need matching.
 *   moved on — already contacted/quoting/researching, so the next act is a
 *              follow-up, not a first call.
 *   else     — nobody has spoken to them yet.
 */
export function assignmentTaskSpec(
  source: string | null | undefined,
  stage: string | null | undefined,
): AssignmentTaskSpec {
  const bucket = sourceBucket(source);
  if (bucket === "otr") return RESEARCH;
  if (bucket === "bol") return MATCH_BOL;
  return normalizeStage(stage) === "new_lead" ? FIRST_CONTACT : FOLLOW_UP;
}

/**
 * The default for a whole selection. If every company wants the same thing,
 * use it; if the batch is mixed, fall back to first contact rather than
 * picking one source's wording and applying it to companies it is wrong for.
 * Either way the admin sees the result and can change it before confirming.
 */
export function batchTaskSpec(
  rows: { source: string | null; stage: string | null }[],
): AssignmentTaskSpec {
  if (rows.length === 0) return FIRST_CONTACT;
  const specs = rows.map((r) => assignmentTaskSpec(r.source, r.stage));
  const first = specs[0];
  return specs.every((s) => s.title === first.title) ? first : FIRST_CONTACT;
}

/** Days out the due date defaults to. Short enough that "past due" means
 * something soon, long enough not to be overdue before the agent looks. */
export const DEFAULT_DUE_DAYS = 3;

/**
 * Default due date as "YYYY-MM-DD" for a <input type="date">.
 *
 * Built from local calendar parts rather than toISOString(), which converts
 * to UTC first and can hand back yesterday's or tomorrow's date depending on
 * the offset — the CRM runs in Central.
 */
export function defaultDueDate(now: Date, days: number = DEFAULT_DUE_DAYS): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * "YYYY-MM-DD" -> an instant at local MIDDAY, matching the task composer.
 * Midday so a timezone shift can never roll the due date onto the wrong day.
 * Returns null for empty input — a task with no due date is allowed by the
 * column, it just can't go overdue.
 */
export function dueDateToInstant(date: string): string | null {
  if (!date.trim()) return null;
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
