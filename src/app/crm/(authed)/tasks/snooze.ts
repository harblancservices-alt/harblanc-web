import { centralDateKey, centralInputToIso, timestampMs } from "../_shell/format";

/**
 * Task snooze — the shared vocabulary for the task card's amber Snooze
 * dropdown. A plain module (NOT tasks/actions.ts): that file carries the
 * "use server" directive, where every export must be an async server action —
 * a runtime const exported from there breaks the build at runtime, which this
 * codebase has already shipped once (see the Upgrades board regression).
 * Both the client card (to render the menu) and the server action (to
 * validate the key and compute the new date) import from here.
 */

const DAY_MS = 86_400_000;

/** 8:00 AM Central — the landing time for a snooze that has to pick one,
 * matching LogCallDialog's own DEFAULT_REMINDER_TIME so a "tomorrow" set from
 * either place means the same moment. */
const SNOOZE_TIME = "08:00";

export const SNOOZE_PRESETS = [
  { key: "1d", label: "Tomorrow", days: 1 },
  { key: "3d", label: "In 3 days", days: 3 },
  { key: "week", label: "Next week", days: 7 },
] as const;

export type SnoozePresetKey = (typeof SNOOZE_PRESETS)[number]["key"];

/** Days for a preset key, or null when the key isn't one of ours — the
 * server action's validation, so a tampered request can't push a task an
 * arbitrary distance out. */
export function snoozeDays(key: string): number | null {
  const preset = SNOOZE_PRESETS.find((p) => p.key === key);
  return preset ? preset.days : null;
}

/**
 * The new due_at for a snooze, in ISO.
 *
 * Two cases, deliberately different — "+1 day" has to mean what a rep expects
 * in both:
 *   - The task is due in the FUTURE: shift its existing due date by N days and
 *     keep the exact time of day. A 2pm call-back pushed a day is still 2pm.
 *   - The task is OVERDUE or has no due date at all: "+1 day" means N days
 *     from NOW, landing at 8:00 AM Central. Shifting off a stale date would
 *     just produce another overdue task (an item 9 days late snoozed "+1 day"
 *     would still be 8 days late) — the single most confusing thing a snooze
 *     button could do.
 *
 * Central-time throughout (centralDateKey + centralInputToIso), never the
 * server's own timezone — same rule every other date write in the CRM follows.
 */
export function snoozedDueAt(
  currentDueAt: string | null | undefined,
  days: number,
  now: Date = new Date(),
): string | null {
  const nowMs = now.getTime();
  const dueMs = timestampMs(currentDueAt);

  if (dueMs !== null && dueMs > nowMs) {
    return new Date(dueMs + days * DAY_MS).toISOString();
  }

  const dayKey = centralDateKey(new Date(nowMs + days * DAY_MS).toISOString());
  if (!dayKey) return null;
  return centralInputToIso(`${dayKey}T${SNOOZE_TIME}`);
}
