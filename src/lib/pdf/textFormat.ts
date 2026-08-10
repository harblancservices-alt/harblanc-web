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

/** Title-case every word — "dallas, tx" / "DALLAS, TX" both print as
 * "Dallas, Tx" — so a free-typed address always prints clean regardless of
 * how it was entered in Settings. (First-letter-up/rest-down applies
 * uniformly to state tokens too, per formatStateCase's rule below — there's
 * no separate all-caps case for a 2-letter word anymore.) */
export function properCaseAddressLine(value: string): string {
  return value.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

/** Strip commas the user may have typed directly into a city/state/zip
 * field — the app inserts its own commas when composing "Dallas, Tx 75205",
 * so a stray one in the source data would double up or read oddly. */
export function stripCommas(value: string): string {
  return value.replace(/,/g, "").trim();
}

/** Title-case a city name — "dallas" / "DALLAS" -> "Dallas". Strips any
 * stray commas first. */
export function titleCaseCity(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = stripCommas(value);
  if (!cleaned) return null;
  return cleaned.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

/** State: first letter upper, rest lower — "TX"/"tx" -> "Tx", "texas" ->
 * "Texas". Brent's explicit call, not the trucking-standard all-caps
 * abbreviation. Strips any stray commas first. */
export function formatStateCase(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = stripCommas(value);
  if (!cleaned) return null;
  return cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase();
}

/** "City, State Zip" — blank pieces drop out cleanly. City/state are run
 * through titleCaseCity/formatStateCase (and zip has any stray comma
 * stripped too) so a composed address line reads clean no matter how the
 * source fields were typed. Shared by the RC and BOL PDF generators
 * instead of each keeping its own copy. */
export function cityStateZip(
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string | null {
  const c = titleCaseCity(city);
  const s = formatStateCase(state);
  const z = zip ? stripCommas(zip) : null;
  const csz = [c, s].filter(Boolean).join(", ");
  const full = [csz, z].filter(Boolean).join(" ").trim();
  return full || null;
}

/** "72 × 48 × 36 in" — only when all three dimensions are present; blank
 * (not a partial string, not a placeholder) if any one is missing. */
export function formatDimensionsIn(
  length: number | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  if (length == null || width == null || height == null) return null;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(length)} × ${fmt(width)} × ${fmt(height)} in`;
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
