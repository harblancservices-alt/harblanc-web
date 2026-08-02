/**
 * Central-time helpers for Dispatch's trip start/end dates. Every time-of-day
 * is rendered in US Central time and labeled "CST" — always that literal
 * label, even in summer when the real Central offset is technically CDT, per
 * the owner's call (same rule the CRM's format.ts follows for its own
 * surfaces). The underlying conversion still follows real America/Chicago
 * rules (DST and all); only the printed label is pinned to "CST".
 *
 * Framework-agnostic (no "use server"/"use client" directive) so it can be
 * imported from server pages, server actions, and client form components
 * alike.
 */

const CENTRAL_TZ = "America/Chicago";

/**
 * Postgres/Supabase hand back timestamptz values shaped like
 * "2026-07-28 02:00:31.26295+00" — a space instead of "T", and a bare
 * two-digit offset with no minutes component. That's not valid ISO 8601, and
 * `new Date(...)` parses it inconsistently across engines (it can land the
 * result hours away from the true instant). Every read of a stored trip
 * timestamp must go through this before becoming a Date.
 */
export function parseServerTimestamp(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;

  let s = trimmed.replace(" ", "T");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += "Z";

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Y/M/D/H/Mi/S of `date` as they read on a wall clock in Central time. */
function centralParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: p.hour === "24" ? 0 : Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/**
 * UTC instant (ms) for a Central-time wall-clock reading. Standard
 * single-correction technique for zone conversion without a library.
 */
function centralWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const asCentral = centralParts(new Date(guess));
  const asIfLocal = Date.UTC(
    asCentral.year,
    asCentral.month - 1,
    asCentral.day,
    asCentral.hour,
    asCentral.minute,
    asCentral.second,
  );
  return guess - (asIfLocal - guess);
}

/** "Jun 24" or "Jun 24, 2026" — the Central calendar date, no time-of-day. */
export function formatCentralDate(
  iso: string | null | undefined,
  withYear = true,
): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
}

/** "Jun 24, 2026, 3:00 PM CST" — full Central date + time, always CST-labeled. */
export function formatCentralDateTime(iso: string | null | undefined): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "—";
  const s = d.toLocaleString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${s} CST`;
}

/** "YYYY-MM-DD" for an <input type="date">, read on the Central calendar. */
export function toDateInputValue(iso: string | null | undefined): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "";
  const { year, month, day } = centralParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "HH:MM" for an <input type="time">, read on the Central wall clock. */
export function toTimeInputValue(iso: string | null | undefined): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "";
  const { hour, minute } = centralParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * Combine a "YYYY-MM-DD" date input + "HH:MM" time input (both read as
 * Central wall-clock values, the only zone this page ever shows) into a real
 * UTC ISO timestamp for storage. Returns null when either piece is missing or
 * unparseable, so a half-filled pair never silently becomes midnight UTC.
 */
export function dateTimeInputsToIso(
  dateValue: string | null | undefined,
  timeValue: string | null | undefined,
): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateValue ?? "").trim());
  const tm = /^(\d{2}):(\d{2})$/.exec((timeValue ?? "").trim());
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm;
  const [, h, mi] = tm;
  const ms = centralWallTimeToUtcMs(
    Number(y),
    Number(mo),
    Number(d),
    Number(h),
    Number(mi),
    0,
  );
  return new Date(ms).toISOString();
}

/**
 * Epoch milliseconds for a stored server timestamp, or null when absent/
 * unparseable.
 */
export function timestampMs(iso: string | null | undefined): number | null {
  return parseServerTimestamp(iso)?.getTime() ?? null;
}

/**
 * "9 days" / "5 days, 11 hrs" (list chip) or "5 days, 11 hours" (form's live
 * readout, `short: false`) for the span between two instants. Returns null
 * when either side is missing/unparseable or the span is negative — callers
 * decide what to show in that case (an inline validation error, usually).
 */
export function formatDurationBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  opts: { short?: boolean } = {},
): string | null {
  const startMs = timestampMs(startIso);
  const endMs = timestampMs(endIso);
  if (startMs == null || endMs == null) return null;
  return formatDurationMs(endMs - startMs, opts);
}

/**
 * The trip Dates display used by both the Trips list cards and the trip
 * detail header: a trip with no ended_at is "Ongoing" and shows just its
 * full start date & time; once an end is set, the primary label becomes the
 * compact "Jun 24 → Jul 3" range (dropping the year unless the span crosses
 * one) with the span's duration alongside. `startedAt` falls back to
 * `fallbackCreatedAt` for trips created before the started_at column existed
 * (backfilled by migration, but defended here too).
 */
export function describeTripSpan(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  fallbackCreatedAt: string,
): { ongoing: boolean; primaryLabel: string; durationLabel: string | null } {
  const start = startedAt ?? fallbackCreatedAt;
  if (!endedAt) {
    return { ongoing: true, primaryLabel: formatCentralDateTime(start), durationLabel: null };
  }
  const sameYear = toDateInputValue(start).slice(0, 4) === toDateInputValue(endedAt).slice(0, 4);
  const primaryLabel =
    formatCentralDate(start, !sameYear) + " → " + formatCentralDate(endedAt, true);
  return {
    ongoing: false,
    primaryLabel,
    durationLabel: formatDurationBetween(start, endedAt, { short: true }),
  };
}

export function formatDurationMs(
  ms: number,
  { short = true }: { short?: boolean } = {},
): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalHours = Math.round(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const hourWord = short ? (hours === 1 ? "hr" : "hrs") : hours === 1 ? "hour" : "hours";
  const dayWord = days === 1 ? "day" : "days";

  if (days === 0) return `${hours} ${hourWord}`;
  if (hours === 0) return `${days} ${dayWord}`;
  return `${days} ${dayWord}, ${hours} ${hourWord}`;
}
