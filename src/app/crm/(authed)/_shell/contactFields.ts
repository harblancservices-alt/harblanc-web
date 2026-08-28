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

/** Preset phone-label options shown by LabelPicker, everywhere a phone
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

/** Preset link-label options shown by LabelPicker in LinksEditor. Same
 * free-type "Other" fallback as phone labels. Facebook/Instagram added
 * 2026-08-10 so the company profile's Socials section (CompanyDetailsCard)
 * has real presets to add social links under — no new column, still the
 * same `links` jsonb array every label/url pair already lives in. */
export const LINK_LABEL_PRESETS = ["LinkedIn", "Website", "Facebook", "Instagram", "Load board"] as const;

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

/**
 * Two stored numbers that would dial the same place, however they happen to
 * be punctuated — "(713) 856-9696" and "7138569696" are one number, and a
 * leading US 1 is not a difference.
 *
 * Exists so the company profile can tell a contact's OWN line from the
 * company switchboard. Six people at Metallic Products share the company
 * main, and a call button that implies otherwise is lying. Shared rather
 * than written twice: the desktop panel and the mobile people list have to
 * reach the same verdict about the same pair of numbers.
 */
export function sameDialledNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (v: string) => digitsForTel(v).replace(/^\+?1/, "");
  return norm(a).length > 0 && norm(a) === norm(b);
}

/** True when a free-typed value looks like a phone number (mostly digits) —
 * used by the simplified company-create form's single "Website or phone"
 * field to decide whether it's stored as a phone entry or a website link.
 * Shared by the client dialog (dup-check) and createAccount (actual save) so
 * the two can't drift. */
export function looksLikePhone(raw: string): boolean {
  const stripped = raw.replace(/[\s().-]/g, "");
  return /^\+?\d{7,15}$/.test(stripped);
}

// ── Call-log directory + dedupe matching ────────────────────────────────────
// Shared by calls/actions.ts (server-side directory fetch + dedupe re-check)
// and LogCallDialog.tsx (client-side autocomplete + the same dedupe check
// run against the already-loaded directory, so a duplicate can be surfaced
// before the round trip). Plain module, no hooks — safe from both sides.

export type DirectoryAccount = {
  id: string;
  name: string;
  phones: PhoneEntry[];
  primaryContactId: string | null;
};

export type DirectoryContact = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  phones: PhoneEntry[];
};

export type CallDirectory = {
  accounts: DirectoryAccount[];
  contacts: DirectoryContact[];
};

/** Digits only, no length cap — used for storage, not display. */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Last 10 digits — the comparison key for "is this the same number", so a
 * leading country code (+1) doesn't defeat a match. Shorter/malformed input
 * is returned as-is (never padded), so it simply won't match anything. */
export function phoneMatchKey(raw: string | null | undefined): string {
  const digits = phoneDigits(raw);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Case/whitespace-insensitive name comparison key. */
export function nameMatchKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Probable-duplicate check for a company about to be created — exact
 * (normalized) name match, or a phone that matches one of the company's
 * known numbers. Deliberately basic (no fuzzy matching), matching
 * accounts/actions.ts::findPossibleDuplicates. */
export function findMatchingAccount(
  accounts: DirectoryAccount[],
  name: string,
  phone: string,
): DirectoryAccount | null {
  const nameKey = name.trim() ? nameMatchKey(name) : null;
  const phoneKey = phone.trim() ? phoneMatchKey(phone) : null;
  if (!nameKey && !(phoneKey && phoneKey.length === 10)) return null;
  return (
    accounts.find(
      (a) =>
        (nameKey && nameMatchKey(a.name) === nameKey) ||
        (phoneKey && phoneKey.length === 10 && a.phones.some((p) => phoneMatchKey(p.number) === phoneKey)),
    ) ?? null
  );
}

/** Same idea as findMatchingAccount, for a contact about to be created. */
export function findMatchingContact(
  contacts: DirectoryContact[],
  name: string,
  phone: string,
): DirectoryContact | null {
  const nameKey = name.trim() ? nameMatchKey(name) : null;
  const phoneKey = phone.trim() ? phoneMatchKey(phone) : null;
  if (!nameKey && !(phoneKey && phoneKey.length === 10)) return null;
  return (
    contacts.find(
      (c) =>
        (nameKey && nameMatchKey(c.name) === nameKey) ||
        (phoneKey && phoneKey.length === 10 && c.phones.some((p) => phoneMatchKey(p.number) === phoneKey)),
    ) ?? null
  );
}
