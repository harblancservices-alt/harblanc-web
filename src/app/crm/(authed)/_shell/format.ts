/**
 * Small display formatters shared across CRM surfaces so dates and money read
 * identically everywhere. Deliberately locale-fixed (en-US) and dependency-free.
 */

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
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
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

/** Convert a stored server timestamp to a value an <input type="datetime-local"> accepts. */
export function toDatetimeLocal(iso: string | null | undefined): string {
  const d = parseServerTimestamp(iso);
  if (!d) return "";
  // Local wall-clock, trimmed to minutes (YYYY-MM-DDTHH:mm).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
