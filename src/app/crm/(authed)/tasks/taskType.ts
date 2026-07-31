/**
 * Task type — the shared vocabulary for crm_tasks.task_type used by the task
 * dialog (TaskTypeField), the company Tasks section, the global Tasks page,
 * and the dashboard's task rows. A closed preset list with an open "Other"
 * free-type fallback (see TaskTypeField), so the column stays a plain string
 * — nothing here rejects a legacy or hand-typed value that isn't on the list.
 */
export const TASK_TYPES = [
  "Follow-up call",
  "Follow-up email",
  "Cold call",
  "Call back",
  "Send email",
  "Send quote",
  "Send BOL / paperwork",
  "Schedule pickup",
  "Site visit",
  "In-person meeting",
  "Demo / presentation",
  "Check-in",
  "Voicemail follow-up",
  "Collect payment / invoice",
  "Contract / paperwork",
  "Onboarding",
  "Research prospect",
  "Social touch (LinkedIn/etc.)",
  "Reminder",
] as const;

export type PresetTaskType = (typeof TASK_TYPES)[number];

/** Sentinel <select> option value that swaps TaskTypeField into free-text
 * mode — never itself stored as the task_type value. */
export const OTHER_TASK_TYPE = "Other";

/** Small neutral chip tone for the type label on a task row — task_type is
 * open-ended (unlike priority) so it gets one fixed tone, not a per-value map. */
export const TASK_TYPE_CHIP_TONE = "bg-slate-bg text-slate";
