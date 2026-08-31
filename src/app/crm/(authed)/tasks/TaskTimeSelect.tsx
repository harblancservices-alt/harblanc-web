"use client";

import { timeOptionsFor } from "./taskTime";

/**
 * The time beside a task's due date — quarter hours, 12-hour, AM/PM.
 *
 * ── A NATIVE SELECT, ON PURPOSE ───────────────────────────────────────
 *
 * The row it lives in already carries Create task, the date, "for
 * <somebody>" and up to fourteen preset buttons, and it has to survive a
 * laptop as well as Brent's 1920. A native select is ONE control at a
 * fixed width whose menu costs no layout at all, and on a phone it opens
 * the OS wheel, which is the best time picker on the device and free.
 *
 * The alternative — three controls for hour, minute and meridiem — is
 * three times the width in the one row that cannot afford it, and it lets
 * somebody build 9:45 PM when they meant AM by getting one of three
 * things wrong.
 *
 * `w-[104px]` is enough for "12:45 PM" plus the arrow, and it is fixed
 * rather than intrinsic so the row does not resize as the value changes.
 */
export function TaskTimeSelect({
  value,
  onChange,
  disabled,
  label = "Task due time",
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  /* timeOptionsFor keeps an off-grid time (a task already due at 1:07)
     rather than snapping it — see its own note. Editing a task's title
     must not quietly reschedule it. */
  const options = timeOptionsFor(value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      className="w-[104px] shrink-0 rounded-md border border-line-strong bg-card px-2 py-1.5 text-[12px] font-semibold text-fg outline-none focus:border-accent disabled:opacity-60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
