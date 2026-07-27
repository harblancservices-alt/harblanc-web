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
