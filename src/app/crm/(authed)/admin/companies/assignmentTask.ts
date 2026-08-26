import { normalizeStage, stageRank, LIFECYCLE_LABEL, type LifecycleStage } from "../../accounts/lifecycle";

/**
 * What task to create when an admin hands a company to an agent.
 *
 * A PLAIN module — no React, no DB. The point of step 2: a company cannot be
 * overdue, a task can. Assignment stamps an owner AND puts a clock on the
 * work, so "past due" becomes a real state the Overview can report.
 *
 * STAGE DECIDES, NOT SOURCE (2026-08-26). This used to branch on `source`
 * first — an OTR company got "Research and qualify this company" and
 * everything else fell through to a stage check. That was backwards, and it
 * produced a real bug against Brent's rule that an assigned company lands in
 * the agent's inbox as a New Lead with research to do: a New Lead sourced
 * from `manual`, `bol` or NULL got "Make first contact" instead, telling the
 * agent to phone a company nobody had looked into yet.
 *
 * So the question is now only "where is this company", which is the thing
 * that actually determines what to do next. Source no longer changes the
 * task at all — it is provenance, still shown in the Source column, and it
 * never had any business deciding work. An OTR company still gets research,
 * because an OTR company is a New Lead.
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
const BY_STAGE: Record<LifecycleStage, AssignmentTaskSpec> = {
  // Brent's rule, verbatim: a company lands in the agent's inbox as a New
  // Lead with research as the first task. Research is not a stage here — it
  // is this.
  new_lead: { title: "Research and qualify this company", taskType: "Research prospect" },
  // Qualified means the research is done and somebody decided they are worth
  // chasing. The next act is the first call, not more research.
  qualified: { title: "Make first contact", taskType: "Cold call" },
  contacted: { title: "Follow up with this company", taskType: "Follow-up call" },
  engaged: { title: "Keep this conversation moving", taskType: "Follow-up call" },
  quoting: { title: "Follow up on the quote", taskType: "Follow-up call" },
  setup: { title: "Get them set up", taskType: "Onboarding" },
  active: { title: "Check in with this customer", taskType: "Check-in" },
  dormant: { title: "Re-engage this customer", taskType: "Follow-up call" },
  // Assigning a company at a terminal stage is unusual but legitimate — it is
  // how a win-back gets an owner. The task says what the work actually is
  // rather than pretending the company is fresh.
  lost: { title: "Reach back out and see if anything changed", taskType: "Follow-up call" },
  // Disqualified is never chased. If somebody is assigning one, the work is
  // deciding whether that call still stands — not selling.
  disqualified: { title: "Review whether this company should stay disqualified", taskType: "Reminder" },
};

/**
 * The task for one company, chosen from where it currently is.
 *
 * Answers the "already past that step" case directly: a company at Contacted
 * gets a follow-up, one at Quoting gets a quote chase. Neither is ever told
 * to go and research a company somebody has already spoken to.
 */
export function assignmentTaskSpec(stage: string | null | undefined): AssignmentTaskSpec {
  return BY_STAGE[normalizeStage(stage)];
}

/**
 * The default for a whole selection.
 *
 * If every company wants the same thing, use it. If the batch is MIXED, take
 * the spec for the LEAST ADVANCED company in it rather than a fixed fallback.
 *
 * That asymmetry is deliberate. Telling somebody to "follow up" on a company
 * nobody has ever contacted is wrong and confusing — it implies a
 * conversation that never happened. Telling them to research a company that
 * has already been called is merely redundant, and they can see the history.
 * When a batch spans stages, err toward the work that has definitely not been
 * done. The admin sees the result and can change it before confirming.
 */
export function batchTaskSpec(rows: { stage: string | null }[]): AssignmentTaskSpec {
  if (rows.length === 0) return BY_STAGE.new_lead;
  let earliest = normalizeStage(rows[0].stage);
  for (const row of rows) {
    const stage = normalizeStage(row.stage);
    if (stageRank(stage) < stageRank(earliest)) earliest = stage;
  }
  return BY_STAGE[earliest];
}

/** Every stage has a spec — used by the tests to prove the map is total, and
 * handy when explaining what assignment will produce. */
export function assignmentTaskTable(): { stage: string; label: string; title: string; taskType: string }[] {
  return (Object.keys(BY_STAGE) as LifecycleStage[]).map((stage) => ({
    stage,
    label: LIFECYCLE_LABEL[stage],
    title: BY_STAGE[stage].title,
    taskType: BY_STAGE[stage].taskType,
  }));
}

// DEFAULT_DUE_DAYS / defaultDueDate / dueDateToInstant lived here until
// 2026-08-25. Assignment no longer sets a due date at all — assigned work
// lands undated in the agent's Inbox and they plan it — so all three lost
// their only callers and went rather than sitting here unused.
