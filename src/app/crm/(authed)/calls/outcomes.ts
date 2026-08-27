/**
 * The call-outcome vocabulary — the single shared list every call surface uses
 * (the Log-call dialog, the activity timeline, and the dashboard call-back
 * queue) so labels and tones can never drift. Values are stored slugs in
 * crm_calls.outcome; labels are what a rep sees.
 *
 * Tones are the design-system's FIXED status tints (bg-*-bg / text-*), which
 * are theme-independent and therefore safe on a white .crm-light card — colour
 * only ever sits on those fixed surfaces (the CRM's core rule).
 */
export const CALL_OUTCOMES = [
  /* "Reached" was added 2026-08-26 for the company file's one-click outcome
     row. The vocabulary had twelve values and not one of them meant the
     plainest thing that happens on a call — you got through and spoke to
     them. Every candidate already carried a JUDGEMENT the rep had not made:
     "Interested" and "Not Interested" are verdicts on the conversation,
     "Call Back" and "Meeting Scheduled" are commitments. Storing one of
     those for a click that only means "I spoke to somebody" would put an
     opinion in the record nobody expressed. It sorts first because it is
     the outcome a rep is trying for. */
  { value: "reached", label: "Reached", tone: "bg-ok-bg text-ok" },
  { value: "no_answer", label: "No Answer", tone: "bg-slate-bg text-slate" },
  { value: "voicemail", label: "Voicemail", tone: "bg-slate-bg text-slate" },
  { value: "busy", label: "Busy", tone: "bg-slate-bg text-slate" },
  /* Added 2026-08-27 with the two-row composer. A gatekeeper is the thing a
     broker actually hits — you got a human, just not the one you wanted —
     and it had nowhere to go: "No answer" is a lie and "Wrong contact"
     blames the record. */
  { value: "gatekeeper", label: "Gatekeeper", tone: "bg-warn-bg text-warn" },
  { value: "wrong_number", label: "Wrong Number", tone: "bg-bad-bg text-bad" },
  { value: "interested", label: "Interested", tone: "bg-ok-bg text-ok" },
  { value: "not_interested", label: "Not Interested", tone: "bg-bad-bg text-bad" },
  { value: "call_back", label: "Call Back", tone: "bg-warn-bg text-warn" },
  {
    value: "decision_maker_unavailable",
    label: "Decision Maker Unavailable",
    tone: "bg-warn-bg text-warn",
  },
  { value: "meeting_scheduled", label: "Meeting Scheduled", tone: "bg-ok-bg text-ok" },
  { value: "quote_requested", label: "Quote Requested", tone: "bg-steel-bg text-steel" },
  /* The rest of "how did it go", added with the two-row composer. */
  { value: "not_right_now", label: "Not Right Now", tone: "bg-warn-bg text-warn" },
  { value: "already_covered", label: "Already Covered", tone: "bg-slate-bg text-slate" },
  { value: "booked", label: "Booked It", tone: "bg-ok-bg text-ok" },
  { value: "closed_won", label: "Closed Won", tone: "bg-ok-bg text-ok" },
  { value: "closed_lost", label: "Closed Lost", tone: "bg-bad-bg text-bad" },
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number]["value"];

const OUTCOME_BY_VALUE = new Map<string, (typeof CALL_OUTCOMES)[number]>(
  CALL_OUTCOMES.map((o) => [o.value, o]),
);

export function callOutcomeLabel(value: string | null | undefined): string {
  if (!value) return "Call";
  return OUTCOME_BY_VALUE.get(value)?.label ?? value;
}

export function callOutcomeTone(value: string | null | undefined): string {
  if (!value) return "bg-slate-bg text-slate";
  return OUTCOME_BY_VALUE.get(value)?.tone ?? "bg-slate-bg text-slate";
}

/**
 * THE FIVE ONE-CLICK OUTCOMES on the company file's "What happened" bar.
 *
 * A rep logging a call from the company page is doing it between calls, and
 * a twelve-item picker is not a thing you use between calls. These five are
 * what actually happens when you dial a cold number, in the order they
 * happen by frequency.
 *
 * `short` exists because "Decision Maker Unavailable" is thirty characters
 * and this is a row of buttons. It is the SAME vocabulary shortened, never a
 * second set of names — exactly the rule SourcePill's abbreviations follow —
 * and the stored value is always the canonical slug, so a call logged from
 * here and one logged from the full dialog are the same row. The timeline
 * shows the canonical label for both.
 *
 * The full picker is still there in LogCallDialog for the calls that need
 * "Quote Requested" or "Closed Won"; this is the fast path, not a
 * replacement.
 */
export const QUICK_OUTCOMES: readonly { value: CallOutcome; short: string }[] = [
  { value: "reached", short: "Reached" },
  { value: "voicemail", short: "Left VM" },
  { value: "no_answer", short: "No answer" },
  { value: "wrong_number", short: "Bad number" },
  { value: "decision_maker_unavailable", short: "Wrong contact" },
];

/**
 * How much an outcome should SHOUT, derived from the vocabulary above rather
 * than restated.
 *
 * The company file's one-click row drew all five outcomes as identical
 * filled-blue primaries. It is the most-pressed control an agent has, and
 * "Reached" — the thing you are dialling for — looked exactly like "Bad
 * number". Both --ok and --bad already existed and neither was used.
 *
 * Read off each outcome's own `tone` on purpose. A second hand-written table
 * of "which of these is good" is precisely the drift this file's header
 * warns about: it would let the timeline call something green while the
 * button called it red.
 */
export type OutcomeWeight = "good" | "warn" | "bad" | "neutral";

export function callOutcomeWeight(value: string | null | undefined): OutcomeWeight {
  const tone = callOutcomeTone(value);
  if (tone.includes("text-ok")) return "good";
  if (tone.includes("text-bad")) return "bad";
  if (tone.includes("text-warn")) return "warn";
  return "neutral";
}


/* ═══════════════ THE TWO ROWS ON THE COMPOSER ═══════════════════════════

   Brent's redesign: one question about the connection, then — only if you
   got through — one about the result. You cannot have a result from a
   voicemail, so the second row does not exist until the first says you
   spoke to somebody.

   Both draw from CALL_OUTCOMES above; these are orderings of that one
   vocabulary, not a second list. `short` shortens for a button row exactly
   as QUICK_OUTCOMES does, and the stored value is always the canonical slug.

   WHERE THEY ARE STORED: the connection answer goes to crm_calls.outcome,
   which is what every existing surface reads. The result goes to
   crm_calls.disposition — a text column that has existed all along, is
   referenced nowhere in the code and holds 0 rows of 52. Two answers, two
   columns, no migration and no overloading of a field other screens read.
*/

export const GOT_THROUGH_OUTCOMES: readonly { value: CallOutcome; short: string }[] = [
  { value: "reached", short: "Reached" },
  { value: "voicemail", short: "Left VM" },
  { value: "no_answer", short: "No answer" },
  { value: "busy", short: "Busy" },
  { value: "gatekeeper", short: "Gatekeeper" },
  { value: "wrong_number", short: "Bad number" },
  { value: "decision_maker_unavailable", short: "Wrong contact" },
];

export const RESULT_OUTCOMES: readonly { value: CallOutcome; short: string }[] = [
  { value: "interested", short: "Interested" },
  { value: "quote_requested", short: "Wants a quote" },
  { value: "not_right_now", short: "Not right now" },
  { value: "not_interested", short: "Not interested" },
  { value: "already_covered", short: "Already covered" },
  { value: "booked", short: "Booked it" },
];

/** The second row exists only after this. */
export const RESULT_ROW_REQUIRES: CallOutcome = "reached";
