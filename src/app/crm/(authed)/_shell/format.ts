/**
 * Small display formatters shared across CRM surfaces so dates and money read
 * identically everywhere. Every time-of-day is rendered in US Central time
 * and labeled "CST" — always that literal label, even in summer when the
 * real Central offset is technically CDT, per the owner's call. The
 * underlying conversion still follows real America/Chicago rules (DST and
 * all); only the printed label is pinned to "CST". Deliberately locale-fixed
 * (en-US) and dependency-free.
 */

const CENTRAL_TZ = "America/Chicago";

/**
 * Postgres/Supabase hand back timestamptz values shaped like
 * "2026-07-28 02:00:31.26295+00" — a space instead of "T", and a bare
 * two-digit offset with no minutes component. That's not valid ISO 8601, and
 * `new Date(...)` parses it inconsistently across engines (it can land the
 * result hours away from the true instant — the source of the "activity
 * times 56 hours in the future" bug). Every CRM read of a stored timestamp
 * must go through this before becoming a Date, so the instant is always
 * interpreted correctly and identically everywhere.
 */
export function parseServerTimestamp(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;

  let s = trimmed.replace(" ", "T");
  // Bare "+00" / "-05" offset (no minutes) at the very end -> "+00:00" / "-05:00".
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  // No "Z" and no colon'd offset at all -> a naive timestamp. Postgres
  // timestamptz always includes an offset, but if one is somehow missing,
  // treat it as UTC (matching how these columns are actually stored) rather
  // than letting the runtime assume local time.
  if (!/[zZ]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += "Z";

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(iso: string | null | undefined): string {
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

/** Pure calendar date (no time-of-day), computed against the Central
 * calendar day — no "CST" suffix, since there's no clock time to qualify. */
export function formatDate(iso: string | null | undefined): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * First name for display — the first whitespace-delimited token of a
 * crm_profiles.full_name, or the part before "@" in `email` when there's no
 * name at all. Every CRM surface that renders a person's name as a LABEL
 * (Settings, rep chips/dropdowns, "Working: <name>", activity-timeline
 * actors, …) routes through this, so "Kartik Rathore" always reads as just
 * "Kartik" while crm_profiles.full_name itself is never touched. Editing
 * forms (e.g. the Settings "Full name" field) bind directly to full_name
 * instead — this helper is display-only.
 *
 * Guards with `typeof … === "string"` rather than just `?? ""`: callers
 * across the CRM widen Supabase rows with `as` casts, so a value typed
 * `string | null` here is not a runtime guarantee — this must never throw
 * regardless of what actually comes back (null, undefined, or anything else).
 */
export function firstName(
  fullName: string | null | undefined,
  email?: string | null,
): string {
  const name = typeof fullName === "string" ? fullName.trim() : "";
  if (name) return name.split(/\s+/)[0];
  const mail = typeof email === "string" ? email.trim() : "";
  if (mail) return mail.split("@")[0];
  return "";
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
    // Some engines format midnight as "24" with hour12:false.
    hour: p.hour === "24" ? 0 : Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/**
 * UTC instant (ms) for a Central-time wall-clock reading. Standard
 * single-correction technique for zone conversion without a library: guess
 * the instant is the wall clock taken literally as UTC, see how that guess
 * actually reads in Central time, then shift by the difference. Exact except
 * in the rare instant of a DST transition itself.
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

/**
 * Start/end of the Central-time calendar day containing `date` (default
 * now), as UTC-ms boundaries — the shared building block for every
 * "due today / overdue" split across the CRM (dashboard queue, global Tasks
 * page), so a day always turns over at Central midnight regardless of the
 * server's own timezone (Vercel runs UTC).
 */
export function centralDayRange(date: Date = new Date()): { startMs: number; endMs: number } {
  const { year, month, day } = centralParts(date);
  const startMs = centralWallTimeToUtcMs(year, month, day, 0, 0, 0);
  const endMs = centralWallTimeToUtcMs(year, month, day, 23, 59, 59) + 999;
  return { startMs, endMs };
}

/**
 * Convert a stored server timestamp to a value an <input type="datetime-local">
 * accepts, expressed in CENTRAL wall-clock time — matching every other
 * display in the CRM — rather than the viewer's browser zone.
 */
export function toDatetimeLocal(iso: string | null | undefined): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "";
  const { year, month, day, hour, minute } = centralParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/**
 * Inverse of toDatetimeLocal: takes a raw <input type="datetime-local">
 * value ("YYYY-MM-DDTHH:mm"), interprets it as CENTRAL wall-clock time (the
 * only zone the CRM ever shows a person), and returns a real UTC ISO
 * timestamp for storage. Every task-due / reminder / follow-up write path
 * must go through this instead of passing the raw form string straight to
 * Supabase — otherwise the stored instant silently drifts from what was
 * actually typed.
 */
export function centralInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const ms = centralWallTimeToUtcMs(
    Number(y),
    Number(mo),
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0,
  );
  return new Date(ms).toISOString();
}

/**
 * "YYYY-MM-DD" for the Central calendar day a stored timestamp falls on —
 * the shared bucketing key for the calendar's month grid (tasks/follow-ups/
 * calls all land on the day their Central wall-clock time reads, matching
 * every other Central-day split in the CRM rather than the server's UTC day).
 */
export function centralDateKey(iso: string | null | undefined): string | null {
  const d = parseServerTimestamp(iso);
  if (!d) return null;
  const { year, month, day } = centralParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Epoch milliseconds for a stored server timestamp, or null when absent/
 * unparseable — the shared building block for every "is this overdue/stale/
 * in-range" comparison across the CRM (task due dates, call-back reminders,
 * contact follow-ups, staleness windows), so those comparisons use the same
 * corrected parsing as the display formatters above instead of a raw
 * `new Date(iso).getTime()`.
 */
export function timestampMs(iso: string | null | undefined): number | null {
  return parseServerTimestamp(iso)?.getTime() ?? null;
}
