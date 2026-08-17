import { company } from "@/lib/company";

/**
 * Load Inquiry / "Email a Broker" — parse a load-board line into origin +
 * destination, and build the compose-time subject/body. Pure +
 * client-and-server safe: no DB, no "use server", so this module can be
 * imported directly from a "use client" component (as /tms-v2's
 * LoadInquiryComposer.tsx does) as well as from server-side send actions.
 * Shared by both /admin (dispatch/email-broker/EmailBrokerView.tsx) and
 * /tms-v2 (load-inquiry/LoadInquiryComposer.tsx).
 *
 * NOT included here: sendBrokerEmail/sendBrokerEmailTest — those live in
 * the sibling module @/lib/domain/load-inquiry-send.ts (a separate module
 * because they call the Resend API and resolve Reach's settings/signature,
 * which this module deliberately stays free of so it can be imported from
 * client components).
 */

// MC/DOT/phone previously lived here as local hardcoded constants
// ("1467901" / "3918509" / "(832) 445-8775") duplicating src/lib/company.ts's
// existing, already-neutral company.mcNumber/dotNumber/dispatchPhone fields
// (identical values today — company.ts's own comment already notes it's
// "the other place this number is published"). Reading from company.ts
// instead removes the duplicate-source-of-truth drift risk the original
// audit flagged, with no output change. This does NOT make MC/DOT/phone
// live-editable from Reach's settings (reach_settings.mc/phone) the way
// Reach's own signature is — that would require the same out-of-scope
// Reach dependency noted above, and no evidence in the data model proves
// Reach's per-operator-editable value is "the" intended source for this
// specific tool (Reach's settings model is about outreach *style*, not the
// company's fixed regulatory identity) rather than "a" plausible one, so
// this extraction does not adopt it.

/**
 * The load lane label — origin and destination joined by a plain dash, e.g.
 * "Dallas, TX - Atlanta, GA". Single source for the separator so the subject,
 * body line, "Read as" chip, and history rows all read the same.
 */
export function laneLabel(origin: string, destination: string): string {
  return `${origin} - ${destination}`;
}

/** The email subject — the load itself, e.g. "Dallas, TX - Atlanta, GA". */
export function subjectFor(origin: string, destination: string): string {
  return laneLabel(origin, destination);
}

/**
 * The message body as an ordered list of plain lines. The greeting/interest line
 * leads, with the MC/DOT/phone line directly beneath it; every line is one
 * uniform text style.
 */
export function bodyLines(origin: string, destination: string): string[] {
  return [
    `Hello, I'm interested in this load: ${laneLabel(origin, destination)}`,
    `MC ${company.mcNumber} · DOT ${company.dotNumber} · ${company.dispatchPhone}`,
    "I've got a 40' hotshot empty and ready to go.",
    "If this is still available, give me a call or reply back to this email.",
  ];
}

/**
 * Parse a load line copied off a load board into its ORIGIN and DESTINATION,
 * dropping the truck-stop DEADHEAD mileage that sits between them.
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

/**
 * Normalize a captured city: collapse spacing, then drop a leading connector
 * word/arrow OR a leftover deadhead distance unit. A deadhead like "56 mi" (or
 * "56mi") leaves the number out of the city (digits can't be part of one) but
 * strands the unit as the first word of the second city — so "mi Centre, AL"
 * must become "Centre, AL". Longest unit first so "miles" isn't cut to "les".
 */
function tidyCity(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:to|via|->|→|>|miles|mile|mi)\s+/i, "");
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
