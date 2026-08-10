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

export type DueTone = "danger" | "warning" | "accent" | "muted";

/**
 * Human, urgency-colored countdown for a due_at / next_followup_at timestamp
 * — the BIG bold readout on task cards and follow-up rows (the owner wants
 * "when" to jump out, not read as a small gray date). Tone drives the
 * semantic color the caller renders it in: danger (red) once overdue,
 * warning (amber) for today/tomorrow, accent (blue) for anything further out,
 * muted (small/neutral) only when there's no date at all. Computed against
 * the Central calendar day (via `centralParts`/`centralWallTimeToUtcMs`
 * above) so "Tomorrow" flips at Central midnight, not the server's UTC day.
 */
export function dueCountdown(
  iso: string | null | undefined,
  now: Date = new Date(),
): { text: string; tone: DueTone } {
  const ms = timestampMs(iso);
  if (ms === null) return { text: "No due date", tone: "muted" };

  const nowMs = now.getTime();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  if (ms <= nowMs) {
    const elapsed = nowMs - ms;
    const days = Math.floor(elapsed / DAY);
    if (days >= 1) return { text: `Overdue ${days}d`, tone: "danger" };
    const hours = Math.floor(elapsed / HOUR);
    if (hours >= 1) return { text: `Overdue ${hours}h`, tone: "danger" };
    return { text: "Overdue", tone: "danger" };
  }

  const a = centralParts(now);
  const b = centralParts(new Date(ms));
  const nowDayMs = centralWallTimeToUtcMs(a.year, a.month, a.day, 0, 0, 0);
  const dueDayMs = centralWallTimeToUtcMs(b.year, b.month, b.day, 0, 0, 0);
  const dayDiff = Math.round((dueDayMs - nowDayMs) / DAY);

  if (dayDiff <= 0) {
    const hours = Math.floor((ms - nowMs) / HOUR);
    if (hours >= 1) return { text: `Due in ${hours}h`, tone: "warning" };
    return { text: "Due today", tone: "warning" };
  }
  if (dayDiff === 1) return { text: "Tomorrow", tone: "warning" };
  if (dayDiff <= 7) return { text: `In ${dayDiff} days`, tone: "accent" };
  if (dayDiff <= 30) {
    const weeks = Math.max(1, Math.round(dayDiff / 7));
    return { text: `In ${weeks} week${weeks === 1 ? "" : "s"}`, tone: "accent" };
  }
  const monthLabel = new Date(ms).toLocaleDateString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "short",
    ...(b.year !== a.year ? { year: "numeric" as const } : {}),
  });
  return { text: monthLabel, tone: "accent" };
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

/**
 * Date-group label for a History-feed entry — "Today" / "Yesterday" / "This
 * week" / "Last week", then a month (± year) for anything older. Bucketed
 * against the Central calendar day/week (matching every other day-boundary
 * helper above) so the grouping turns over at Central midnight, not the
 * server's UTC day.
 */
export function historyBucketLabel(ms: number | null, now: Date = new Date()): string {
  if (ms === null) return "Undated";

  const { startMs: todayStart } = centralDayRange(now);
  const DAY = 86_400_000;
  const dayIndex = Math.floor((todayStart - centralDayRange(new Date(ms)).startMs) / DAY);

  if (dayIndex <= 0) return "Today";
  if (dayIndex === 1) return "Yesterday";
  if (dayIndex <= 7) return "This week";
  if (dayIndex <= 14) return "Last week";

  const a = centralParts(now);
  const b = centralParts(new Date(ms));
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "long",
    ...(b.year !== a.year ? { year: "numeric" as const } : {}),
  });
}

export type ContactFreshness = "fresh" | "aging" | "cold" | "never";

/**
 * Relative "how long since we last touched this company" readout for the
 * Companies list — drives both the label and the freshness tier a caller
 * colors it by, so a cold account is obvious without opening the profile.
 * Takes a precomputed epoch-ms (the caller reduces crm_calls/crm_activities
 * to a single MAX(occurred_at) per account) rather than an ISO string, since
 * the list already needs the numeric value to sort by.
 */
export function lastContactStatus(
  ms: number | null,
  now: Date = new Date(),
): { text: string; freshness: ContactFreshness } {
  if (ms === null) return { text: "Never contacted", freshness: "never" };

  const days = Math.floor((now.getTime() - ms) / 86_400_000);
  if (days <= 0) return { text: "Today", freshness: "fresh" };
  if (days === 1) return { text: "Yesterday", freshness: "fresh" };
  if (days <= 7) return { text: `${days}d ago`, freshness: "fresh" };
  if (days <= 30) return { text: `${days}d ago`, freshness: "aging" };
  if (days <= 90) {
    const weeks = Math.round(days / 7);
    return { text: `${weeks}w ago`, freshness: "cold" };
  }
  const months = Math.round(days / 30);
  return { text: `${months}mo ago`, freshness: "cold" };
}

/**
 * Title-case a proper-noun field — a person's name, a company name, a
 * street address, or a city — so "john smith", "JOHN SMITH", and "John
 * smith" all read as "John Smith". Applied both when a form saves one of
 * these fields (accounts/actions.ts, contacts/actions.ts) and wherever one
 * is displayed, so pre-existing not-quite-capitalized data reads clean too
 * without needing a backfill. Every word is lowercased first, then the
 * letter after the start of the string or after a space/hyphen/apostrophe/
 * slash is capitalized (handles "Mary-Jane", "O'Brien", "123 Main St").
 * Deliberately simple — no proper-noun dictionary, so an intentional
 * all-caps acronym in a company name ("ABC LLC") gets normalized to "Abc
 * Llc" too; the owner's call is that this reads cleaner overall than
 * leaving inconsistent casing as-is. Never applied to free-form note/
 * summary body text — only to name/company/address/city fields.
 */
export function titleCaseWords(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/(^|[\s\-'/])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** State abbreviation, uppercased — "tx" / "Tx" / "TX" all save/display as
 * "TX". Trivial, but named so every call site reads its intent. */
export function upperCaseState(value: string | null | undefined): string {
  if (!value) return "";
  return value.toUpperCase();
}

/** Strip commas the user may have typed directly into a city/state/zip
 * field — the app inserts its own commas when composing "Dallas, Tx 75205",
 * so a stray one in the source data would double up or read oddly. */
export function stripCommas(value: string): string {
  return value.replace(/,/g, "").trim();
}

/** Shipper/consignee state field, RC/BOL scope only — first letter upper,
 * rest lower: "TX"/"tx" -> "Tx", "texas" -> "Texas". Brent's explicit call
 * for these fields (not the trucking-standard all-caps abbreviation
 * `upperCaseState` above, which stays as-is everywhere else in the CRM —
 * this is deliberately a separate function, not a change to that one). */
export function formatStateCase(value: string | null | undefined): string {
  if (!value) return "";
  const cleaned = stripCommas(value);
  if (!cleaned) return "";
  return cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase();
}

/** US phone -> "972-922-2282". Leaves anything that isn't a clean 10/11-digit
 * US number as-is rather than mangling an already-formatted or foreign value
 * (matches src/lib/pdf/textFormat.ts's formatPhone — kept as a separate copy
 * here since that module pulls in @react-pdf/renderer at import time and
 * can't be imported from client components). */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return value;
}
