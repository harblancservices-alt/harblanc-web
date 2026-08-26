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
 *   moved on — already contacted/quoting/researching, so the next act is a
 *              follow-up, not a first call.
 *   else     — nobody has spoken to them yet.
 *
 * BOL used to be its own case ("Match the companies on this bill of lading"),
 * pointing the agent at BOL Center. That page was retired on 2026-08-26 —
 * nothing in the app ever wrote crm_bol_entries — so the instruction named a
 * screen that no longer exists. The 15 companies carrying source='bol' are
 * ordinary companies whose provenance happens to be a bill of lading, and
 * they now get the same stage-based task as anything else. sourceBucket still
 * reports 'bol' for the Source column: where a company came from is still
 * true, it just no longer implies a task.
 */
export function assignmentTaskSpec(
  source: string | null | undefined,
  stage: string | null | undefined,
): AssignmentTaskSpec {
  if (sourceBucket(source) === "otr") return RESEARCH;
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

// DEFAULT_DUE_DAYS / defaultDueDate / dueDateToInstant lived here until
// 2026-08-25. Assignment no longer sets a due date at all — assigned work
// lands undated in the agent's Inbox and they plan it — so all three lost
// their only callers and went rather than sitting here unused.
