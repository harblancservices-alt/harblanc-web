/**
 * Email-a-Broker — parse a load line copied off a load board into its ORIGIN and
 * DESTINATION, dropping the truck-stop DEADHEAD mileage that sits between them.
 *
 * Example paste (spaces or tabs, variable count):
 *   "Dallas, TX   45   Atlanta, GA"
 *     → { origin: "Dallas, TX", destination: "Atlanta, GA", deadhead: 45, confident: true }
 *
 * The rule: a load line is two "City, ST" tokens with a number (the deadhead)
 * between or around them. We locate exactly two location tokens and throw away
 * the number. Anything else (0, 1, or 3+ tokens) returns `confident: false` with
 * a best-effort guess, so the UI can surface editable Origin / Destination
 * fields for the operator to fix by hand.
 *
 * Pure + client-and-server safe: no DB, no "use server". Covered by parse.test.ts.
 */

export type ParsedLoad = {
  /** "City, ST" (state upper-cased), or "" when none was found. */
  origin: string;
  destination: string;
  /** The dropped truck-stop deadhead mileage, if a number was found between them. */
  deadhead: number | null;
  /** True only when exactly two "City, ST" tokens were found (a clean read). */
  confident: boolean;
};

// A "City, ST" token: one-or-more city words (letters plus . ' -), a comma
// (optionally spaced), then a 2-letter state. Case-insensitive on the state so a
// lowercased paste still matches — we upper-case it for display afterwards. The
// trailing lookahead keeps a 3+-letter word (e.g. "GAS") from matching as a
// state. Digits can never be part of a city, so a deadhead number always splits
// the two tokens cleanly.
const LOC_RE =
  /([A-Za-z][A-Za-z.'-]*(?: +[A-Za-z.'-]+)*) *, *([A-Za-z]{2})(?![A-Za-z])/g;

/** Normalize a captured city: collapse spacing and drop a leading connector word/arrow. */
function tidyCity(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:to|via|->|→|>)\s+/i, "");
}

function locLabel(city: string, state: string): string {
  return `${tidyCity(city)}, ${state.toUpperCase()}`;
}

/** First 1–5 digit integer in a string, or null. */
function firstInt(s: string): number | null {
  const m = s.match(/\d{1,5}/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function parseLoadLine(input: string): ParsedLoad {
  const text = (input ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return { origin: "", destination: "", deadhead: null, confident: false };
  }

  const matches = [...text.matchAll(LOC_RE)];

  if (matches.length === 2) {
    const [m1, m2] = matches;
    const origin = locLabel(m1[1], m1[2]);
    const destination = locLabel(m2[1], m2[2]);
    // Deadhead: prefer a number sitting between the two tokens; fall back to any
    // number on the line (some boards prepend it).
    const between = text.slice(
      (m1.index ?? 0) + m1[0].length,
      m2.index ?? text.length,
    );
    const deadhead = firstInt(between) ?? firstInt(text);
    return { origin, destination, deadhead, confident: true };
  }

  // Not a clean two-token read — hand back a best-effort guess (first + last
  // tokens seen) but flag it so the UI asks the operator to confirm.
  const first = matches[0];
  const last = matches.length > 1 ? matches[matches.length - 1] : null;
  return {
    origin: first ? locLabel(first[1], first[2]) : "",
    destination: last ? locLabel(last[1], last[2]) : "",
    deadhead: null,
    confident: false,
  };
}
