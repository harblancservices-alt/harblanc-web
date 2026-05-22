/**
 * Quick Reply Templates — canned closing lines for the dispatch estimate
 * email. These are not full email bodies. They drop into the "closing
 * note" field of the composer to give Brent a starting point he can edit
 * in two seconds.
 *
 * Each template is a short forcing question or operational statement
 * that ends with a clear next action. Email threads die without forcing
 * questions; these are the templates that don't.
 *
 * Hardcoded for now (per Phase 3A spec). When Brent wants to edit
 * templates without a code change, promote this to a DB-backed table.
 */

export type ReplyTemplate = {
  id: string;
  label: string;        // short pill label
  description: string;  // help text shown under the pill on hover/focus
  body: string;         // inserted into the closing-note field
};

export const REPLY_TEMPLATES: readonly ReplyTemplate[] = [
  {
    id: "price-range-default",
    label: "Price range",
    description: "Standard close — present the range and ask for confirmation.",
    body:
      "Reply if this range works and I'll lock the truck. If something's off, " +
      "tell me what to adjust.",
  },
  {
    id: "need-dimensions",
    label: "Need dimensions",
    description: "Hold the range, ask for the longest dimension before locking.",
    body:
      "Before I tighten this, send me the longest dimension and overall " +
      "L×W×H when you get a chance. Range above is solid for " +
      "standard-profile freight; oversize can move it.",
  },
  {
    id: "need-receiver-details",
    label: "Receiver details",
    description: "Ask the two questions that change the rate at receiver.",
    body:
      "Two things to button this up: who's the contact at the receiving " +
      "end, and is there a forklift on site? Without one, add about $150 " +
      "for lumper assist.",
  },
  {
    id: "no-capacity",
    label: "No capacity",
    description: "Polite decline — keeps the door open for future loads.",
    body:
      "Capacity is tight on this lane right now and I don't want to " +
      "commit to dates I can't hit. Worth checking back with me next " +
      "week if your timing has any flex.",
  },
  {
    id: "follow-up",
    label: "Follow-up",
    description: "Soft nudge after silence — keeps the lead warm without pressure.",
    body:
      "Following up on this one. Still need to move it? If timing changed " +
      "or it's on hold, just tell me where you're at.",
  },
] as const;

export function findTemplate(id: string): ReplyTemplate | undefined {
  return REPLY_TEMPLATES.find((t) => t.id === id);
}
