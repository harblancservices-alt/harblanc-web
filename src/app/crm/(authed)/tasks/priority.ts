/**
 * Task priority — the shared vocabulary for crm_tasks.priority used by the task
 * dialog, the company Tasks section, the global Tasks page, and the dashboard.
 * Tones are the design-system's FIXED status tints (theme-independent), so they
 * are safe on a white .crm-light card.
 */
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DEFAULT_PRIORITY: TaskPriority = "normal";

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

export const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "bg-slate-bg text-slate",
  normal: "bg-steel-bg text-steel",
  high: "bg-bad-bg text-bad",
};

/** Sort weight — higher sorts first. The single place priority becomes a
 * real ordering signal (CRM_URGENCY_AUDIT.md P0: "priority is 100%
 * decorative") — used as the within-urgency-tier sort on the global Tasks
 * page and the dashboard's Next Best Action queue (see taskPriorityCompare
 * below), never as a tier of its own: a low-priority overdue task still
 * outranks a high-priority upcoming one. */
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 2,
  normal: 1,
  low: 0,
};

export function priorityWeight(value: string | null | undefined): number {
  return PRIORITY_WEIGHT[normalizePriority(value)];
}

/** Comparator for Array.prototype.sort — highest priority first. */
export function taskPriorityCompare(a: { priority: string | null }, b: { priority: string | null }): number {
  return priorityWeight(b.priority) - priorityWeight(a.priority);
}

export function normalizePriority(value: string | null | undefined): TaskPriority {
  const v = (value ?? "").toLowerCase();
  return (TASK_PRIORITIES as readonly string[]).includes(v)
    ? (v as TaskPriority)
    : DEFAULT_PRIORITY;
}

export function priorityLabel(value: string | null | undefined): string {
  return PRIORITY_LABEL[normalizePriority(value)];
}

export function priorityTone(value: string | null | undefined): string {
  return PRIORITY_TONE[normalizePriority(value)];
}
