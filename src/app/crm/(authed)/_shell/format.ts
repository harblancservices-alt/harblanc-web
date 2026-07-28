/**
 * Small display formatters shared across CRM surfaces so dates and money read
 * identically everywhere. Deliberately locale-fixed (en-US) and dependency-free.
 */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
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

/** Convert a stored ISO timestamp to a value an <input type="datetime-local"> accepts. */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Local wall-clock, trimmed to minutes (YYYY-MM-DDTHH:mm).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
