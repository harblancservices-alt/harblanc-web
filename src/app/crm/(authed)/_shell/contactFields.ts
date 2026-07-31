/**
 * Shared shape + parsing for the multi-phone / multi-link editors used on
 * companies and contacts. Both crm_accounts and crm_contacts carry a
 * `phones jsonb` (array of {label, number}) and `links jsonb` (array of
 * {label, url}) column — already backfilled from the old single-value
 * columns, so these arrays are the source of truth for display/editing.
 * The old scalar columns (phone / website / linkedin_url) are still kept in
 * sync (first entry mirrored in) purely for anything else that still reads
 * them directly. Plain module (no "use client") so both the client editors
 * and the server actions can import the same parsing.
 */

export type PhoneEntry = { label: string; number: string };
export type LinkEntry = { label: string; url: string };

/** Preset phone-label options shown by PhoneLabelPicker, everywhere a phone
 * label is entered (PhonesEditor, the Stray numbers assign/create flow). A
 * free-type "Other" fallback covers anything not on this list. */
export const PHONE_LABEL_PRESETS = [
  "Main",
  "Office / Reception",
  "Direct",
  "Dispatch",
  "Cell / Mobile",
  "Billing",
  "After hours",
  "Fax",
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parsePhones(value: unknown): PhoneEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((p) => ({
      label: typeof p.label === "string" ? p.label.trim() : "",
      number: typeof p.number === "string" ? p.number.trim() : "",
    }))
    .filter((p) => p.number.length > 0);
}

export function parseLinks(value: unknown): LinkEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((l) => ({
      label: typeof l.label === "string" ? l.label.trim() : "",
      url: typeof l.url === "string" ? l.url.trim() : "",
    }))
    .filter((l) => l.url.length > 0);
}

/** Parse the JSON-encoded hidden-field value a PhonesEditor submits. */
export function phonesFromFormValue(raw: FormDataEntryValue | null): PhoneEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return parsePhones(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Parse the JSON-encoded hidden-field value a LinksEditor submits. */
export function linksFromFormValue(raw: FormDataEntryValue | null): LinkEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return parseLinks(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Bare/naked URLs ("linkedin.com/in/x") need a scheme before they're a
 * usable href — matches the old single-website normalizeHref behaviour. */
export function normalizeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function digitsForTel(number: string): string {
  return number.replace(/[^0-9+]/g, "");
}
