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
  { value: "no_answer", label: "No Answer", tone: "bg-slate-bg text-slate" },
  { value: "voicemail", label: "Voicemail", tone: "bg-slate-bg text-slate" },
  { value: "busy", label: "Busy", tone: "bg-slate-bg text-slate" },
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
