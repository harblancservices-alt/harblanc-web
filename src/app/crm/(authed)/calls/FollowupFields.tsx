"use client";

import { FieldLabel, CONTROL } from "../_shell/form";

export const TIME_PRESETS = [
  { label: "8:00a", value: "08:00" },
  { label: "12:00p", value: "12:00" },
  { label: "3:00p", value: "15:00" },
  { label: "5:00p", value: "17:00" },
];

/** Every quarter-hour, 12:00 AM through 11:45 PM, labeled 12-hour AM/PM — a
 * friendly dropdown in place of the native time spinner, which gives reps no
 * clear AM/PM and fiddly increment arrows. */
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const period = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      opts.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${period}` });
    }
  }
  return opts;
})();

/**
 * The follow-up reminder's date + time controls — OPTIONAL and independent
 * of each other (a rep can flag follow-up required without pinning an exact
 * moment, set just a date, or just a time). Shared by LogCallDialog and
 * QuickLogCallDialog, both of which post `reminder_date`/`reminder_time` to
 * the same logCall action; it only forms a real reminder_at timestamp when
 * BOTH are present (see calls/actions.ts). The time picker is a friendly
 * 12-hour AM/PM dropdown plus four quick-tap presets, not the native time
 * spinner reps found confusing.
 */
export function FollowupFields({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 border border-fg-subtle bg-inset px-3 py-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex w-full min-w-0 flex-col gap-1.5">
          <FieldLabel>Reminder date (CST)</FieldLabel>
          <input
            type="date"
            name="reminder_date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={`h-11 w-full min-w-0 ${CONTROL}`}
          />
        </label>
        <label className="flex w-full min-w-0 flex-col gap-1.5">
          <FieldLabel>Reminder time (CST)</FieldLabel>
          <select
            name="reminder_time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className={`h-11 w-full min-w-0 ${CONTROL}`}
          >
            <option value="">No specific time</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TIME_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onTimeChange(p.value)}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              time === p.value
                ? "border-accent bg-accent text-white"
                : "border-fg-subtle bg-card text-fg-muted hover:bg-card/60 hover:text-fg"
            }`}
          >
            {p.label}
          </button>
        ))}
        {time && (
          <button
            type="button"
            onClick={() => onTimeChange("")}
            className="rounded-lg border border-fg-subtle bg-card px-3 py-1.5 text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-card/60 hover:text-fg"
          >
            Clear time
          </button>
        )}
      </div>
    </div>
  );
}
