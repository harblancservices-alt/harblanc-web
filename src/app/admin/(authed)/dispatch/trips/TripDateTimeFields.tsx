"use client";

import { useMemo, useState } from "react";
import { dateTimeInputsToIso, formatDurationMs } from "@/lib/dispatch/central-time";

/**
 * Start (required) + optional end date/time fields, shared by the New Trip
 * and Edit Trip forms. Plain <input type="date">/<input type="time"> pairs
 * rather than a single datetime-local — the owner's mockup calls for two
 * separate inputs — read/written as CENTRAL wall-clock values (the only zone
 * this page ever shows), converted to a real UTC instant by the server
 * action via dateTimeInputsToIso.
 *
 * The end fields only exist in the DOM while the toggle is on: leaving them
 * mounted-but-hidden would still submit stale end_date/end_time values when
 * the operator flips the toggle off without clearing them, silently reviving
 * an end date the UI just told them was dropped.
 */
export function TripDateTimeFields({
  defaultStartDate,
  defaultStartTime,
  defaultEndDate,
  defaultEndTime,
  defaultHasEnd,
}: {
  defaultStartDate?: string;
  defaultStartTime?: string;
  defaultEndDate?: string;
  defaultEndTime?: string;
  defaultHasEnd?: boolean;
}) {
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  const [startTime, setStartTime] = useState(defaultStartTime ?? "08:00");
  const [hasEnd, setHasEnd] = useState(defaultHasEnd ?? false);
  const [endDate, setEndDate] = useState(defaultEndDate ?? "");
  const [endTime, setEndTime] = useState(defaultEndTime ?? "17:00");

  const startIso = dateTimeInputsToIso(startDate, startTime);
  const endIso = hasEnd ? dateTimeInputsToIso(endDate, endTime) : null;

  // Only a real problem once both sides actually parse — an empty end date
  // mid-typing isn't an error yet, just incomplete.
  const endBeforeStart =
    hasEnd && startIso != null && endIso != null && endIso <= startIso;

  const durationLabel = useMemo(() => {
    if (!hasEnd || !startIso || !endIso || endBeforeStart) return null;
    return formatDurationMs(
      new Date(endIso).getTime() - new Date(startIso).getTime(),
      { short: false },
    );
  }, [hasEnd, startIso, endIso, endBeforeStart]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
          Start date &amp; time<span className="text-red-600"> *</span>
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            name="start_date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-w-[140px] flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
          />
          <input
            name="start_time"
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="min-w-[110px] flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 font-mono text-[11px] font-semibold text-fg">
        <input
          type="checkbox"
          name="has_end"
          value="1"
          checked={hasEnd}
          onChange={(e) => setHasEnd(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong accent-accent"
        />
        Set end date &amp; time
      </label>

      {hasEnd ? (
        <div>
          <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            End date &amp; time
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              name="end_date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={
                "min-w-[140px] flex-1 rounded-md border bg-card px-2.5 py-1.5 text-[13px] text-fg focus:outline-none " +
                (endBeforeStart
                  ? "border-bad focus:border-bad"
                  : "border-line-strong focus:border-fg")
              }
            />
            <input
              name="end_time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={
                "min-w-[110px] flex-1 rounded-md border bg-card px-2.5 py-1.5 text-[13px] text-fg focus:outline-none " +
                (endBeforeStart
                  ? "border-bad focus:border-bad"
                  : "border-line-strong focus:border-fg")
              }
            />
          </div>
          {endBeforeStart ? (
            <p className="mt-1 font-mono text-[11px] font-semibold text-bad">
              End must be after the start date &amp; time.
            </p>
          ) : durationLabel ? (
            <p className="mt-1 font-mono text-[11px] text-fg-muted">
              Duration: {durationLabel}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="font-mono text-[11px] text-fg-subtle">
          No end date — trip stays Ongoing.
        </p>
      )}
    </div>
  );
}

/**
 * Blocks submit (returning false to the caller's onSubmit) when the end
 * fields are on and end &lt;= start, so an invalid pair never reaches the
 * server action silently. The list of validation is intentionally the same
 * rule as the inline error above — this is the submit-time guard for it.
 */
export function tripDatesAreValid(formData: FormData): boolean {
  const hasEnd = formData.get("has_end") === "1";
  if (!hasEnd) return true;
  const startIso = dateTimeInputsToIso(
    String(formData.get("start_date") ?? ""),
    String(formData.get("start_time") ?? ""),
  );
  const endIso = dateTimeInputsToIso(
    String(formData.get("end_date") ?? ""),
    String(formData.get("end_time") ?? ""),
  );
  if (!startIso || !endIso) return true; // incomplete end — treat as "no end" server-side
  return endIso > startIso;
}
