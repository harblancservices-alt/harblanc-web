import { Font } from "@react-pdf/renderer";

let hyphenationDisabled = false;

/**
 * react-pdf's default hyphenation engine treats any long unbroken string —
 * an email address, not a real English word — as hyphenatable, and inserts a
 * visible "-" at an arbitrary break point when it has to wrap. Every
 * shipment PDF (RC, BOL) calls this once at module load so long tokens wrap
 * whole instead of getting cut off mid-word. Guarded so importing it from
 * multiple PDF modules doesn't re-register the callback repeatedly.
 */
export function disablePdfHyphenation(): void {
  if (hyphenationDisabled) return;
  hyphenationDisabled = true;
  Font.registerHyphenationCallback((word) => [word]);
}

/** "4245 North Central Expressway STE 490, Dallas, TX 75205" -> two display
 * lines. The broker profile stores address as one free-text field (no
 * separate street/city/state/zip columns), so this is a display-only split —
 * the last two comma-separated segments read as "city" and "state zip",
 * everything before that is the street line. */
export function splitAddress(address: string): { street: string; cityStateZip: string } {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { street: "", cityStateZip: "" };
  if (parts.length === 1) return { street: parts[0], cityStateZip: "" };
  if (parts.length === 2) return { street: parts[0], cityStateZip: parts[1] };
  return { street: parts.slice(0, -2).join(", "), cityStateZip: parts.slice(-2).join(", ") };
}

/** Title-case every word except a standalone 2-letter state code, which is
 * uppercased instead — so a free-typed "dallas, tx" always prints as
 * "Dallas, TX" regardless of how it was entered in Settings. */
export function properCaseAddressLine(value: string): string {
  return value.replace(/[A-Za-z][A-Za-z'-]*/g, (word) =>
    word.length === 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
  );
}

/** US phone -> "972-922-2282". Leaves anything that isn't a clean 10/11-digit
 * US number as-is rather than mangling an already-formatted or foreign value. */
export function formatPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return value;
}

/** Title-case a person's name — "billy bob" / "BILLY BOB" -> "Billy Bob".
 * Every word is lowercased first, then the letter after the start of the
 * string or after a space/hyphen/apostrophe is capitalized (handles
 * "Mary-Jane", "O'Brien"). Scoped to contact/dispatcher names only — never
 * a company/facility name or free-text notes, which stay as typed. */
export function titleCaseName(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
