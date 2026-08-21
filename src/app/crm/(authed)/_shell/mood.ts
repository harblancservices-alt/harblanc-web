/**
 * The "current mood" vocabulary for a contact — crm_contacts.current_mood
 * (text, nullable, check-constrained to these 7 values at the DB level).
 * Single shared source for the form picker (MoodPicker), the inline editable
 * control (accounts/[id]/MoodControl.tsx), and the read-only badge wherever
 * a contact renders — same split as roles.ts's role vocabulary, so mood
 * never drifts between those surfaces. A plain data module (no "use client").
 *
 * Colors are restrained and semantic, matching the CRM's existing tone
 * formula exactly (bg-X-bg/text-X/border-X-45, the same shape Badge and
 * ROLE_TONE already use) — never a loud/custom hue. Hot=danger red,
 * Warm=warning amber, Cold=steel blue (the CRM's other established blue,
 * distinct from the vivid --accent blue used for Call Back's "do something
 * now" framing), Interested=success green, Not Interested/No=neutral,
 * Call Back=accent.
 */
export type ContactMood = "interested" | "not_interested" | "call_back" | "no" | "warm" | "hot" | "cold";

export const MOOD_VALUES: ContactMood[] = ["interested", "not_interested", "call_back", "no", "warm", "hot", "cold"];

export const MOOD_LABEL: Record<ContactMood, string> = {
  interested: "Interested",
  not_interested: "Not Interested",
  call_back: "Call Back",
  no: "No",
  warm: "Warm",
  hot: "Hot",
  cold: "Cold",
};

/** Selected-chip / read-only-badge classes — same formula as Badge/ROLE_TONE. */
export const MOOD_TONE: Record<ContactMood, string> = {
  interested: "bg-ok-bg text-ok border border-ok/45",
  not_interested: "bg-inset text-fg-muted border border-line-strong",
  call_back: "bg-accent/10 text-accent border border-accent/45",
  no: "bg-inset text-fg-muted border border-line-strong",
  warm: "bg-warn-bg text-warn border border-warn/45",
  hot: "bg-bad-bg text-bad border border-bad/45",
  cold: "bg-steel-bg text-steel border border-steel/45",
};

export function normalizeMood(value: string | null | undefined): ContactMood | null {
  if (!value) return null;
  return (MOOD_VALUES as readonly string[]).includes(value) ? (value as ContactMood) : null;
}
