/**
 * THE TIME HALF OF A DUE DATE — quarter hours, 12-hour clock.
 *
 * A PLAIN module: no React, no DB. Brent, 2026-08-31: "add a time button
 * and make the minutes go by :00 :15 :30 :45 and am pm, defaulted to 9am".
 *
 * ── 09:00 HERE, 08:00 EVERYWHERE ELSE ─────────────────────────────────
 *
 * Worth stating plainly because it is a real disagreement and not an
 * oversight. TASK_DAY_START is "08:00" and it is what every other path in
 * this system means by the start of a working day:
 *
 *   - the snooze presets (snooze.ts: SNOOZE_TIME = TASK_DAY_START)
 *   - defaultTaskDueIso, used wherever a task is dated without a picker
 *   - the log-a-call follow-up reminder
 *   - the 34 tasks back-dated for Tyler and Brent on 2026-08-29
 *
 * This control was ASKED FOR at 9am, so 9am is what it does. Nothing else
 * has been moved to match, because moving it would silently redate work
 * nobody asked to redate. The consequence is that a task typed here lands
 * an hour later than the identical task created anywhere else.
 *
 * IF ONE MEANING IS WANTED, it is a one-line change: set
 * DEFAULT_TASK_TIME below to TASK_DAY_START, or change TASK_DAY_START to
 * "09:00" to move the whole system the other way. They are deliberately
 * separate constants so that choice stays available and visible.
 */

/** What a fresh task composer opens on. See the note above. */
export const DEFAULT_TASK_TIME = "09:00";

/** The only minutes offered. */
export const TASK_MINUTES = [0, 15, 30, 45] as const;

export type TimeOption = { value: string; label: string };

/** "13:30" -> "1:30 PM". Midnight is 12 AM and noon is 12 PM, which is the
 * one thing hand-rolled 12-hour formatters reliably get wrong. */
export function formatTime12(value: string): string {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const meridiem = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

/** True for a time the picker can offer as one of its own options. */
export function isQuarterHour(value: string): boolean {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  return (
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    (TASK_MINUTES as readonly number[]).includes(minute)
  );
}

/** Every quarter hour of the day, midnight first, as value + label. */
export function quarterHourOptions(): TimeOption[] {
  const out: TimeOption[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of TASK_MINUTES) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      out.push({ value, label: formatTime12(value) });
    }
  }
  return out;
}

/**
 * The options to render for a control currently holding `current`.
 *
 * ── WHY AN EXISTING TIME IS KEPT RATHER THAN SNAPPED ──────────────────
 *
 * A task already due at 1:07 PM is a commitment somebody made. The picker
 * has no 1:07 option, so the choices were: show the nearest quarter, or
 * show the real time. Snapping displays 1:00 PM and — the moment anything
 * saves — MOVES the task, silently, to a time nobody chose. That is the
 * same class of harm as defaulting an edit to 9am, which Brent called out
 * directly.
 *
 * So an off-grid time is added to the list as its own option and stays
 * exactly where it is until somebody deliberately picks another. Editing
 * the title of a 1:07 task must not reschedule it.
 */
export function timeOptionsFor(current: string | null): TimeOption[] {
  const base = quarterHourOptions();
  if (!current || isQuarterHour(current)) return base;

  const extra: TimeOption = { value: current, label: formatTime12(current) };
  // In clock order, so an odd time sits where a reader expects to find it.
  const at = base.findIndex((o) => o.value > current);
  if (at < 0) return [...base, extra];
  return [...base.slice(0, at), extra, ...base.slice(at)];
}

/** The "HH:MM" inside a stored "YYYY-MM-DDTHH:MM[:SS]", or null. */
export function timeFromInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /T(\d{2}:\d{2})/.exec(value);
  return m ? m[1] : null;
}
