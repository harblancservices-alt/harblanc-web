/**
 * Backhaul email presets — shared types + token helpers.
 *
 * A preset is a named subject/body template the operator can edit and save.
 * Bodies support three tokens:
 *   {broker} — the recipient's name, filled per-recipient at SEND time
 *              (server action), so it stays literal in the compose box.
 *   {area}   — where the truck is sitting empty (the search's location label).
 *   {when}   — the availability date from the search.
 *
 * {area} / {when} are resolved into the compose fields when a preset is loaded
 * (so Brent sees + edits the real text); {broker} is resolved at send.
 *
 * STARTER_PRESETS mirrors the rows seeded by the email_presets migration. It's
 * the pre-migration fallback so the compose box is never empty; once the table
 * exists the DB rows (with real ids) take over.
 */

export type EmailPreset = {
  /** Null for the in-memory starter fallback (no DB row yet). */
  id: string | null;
  name: string;
  subject: string;
  body: string;
};

export function resolveTokens(
  text: string,
  ctx: { area: string; when: string },
): string {
  return text
    .replace(/\{area\}/g, ctx.area)
    .replace(/\{when\}/g, ctx.when);
}

export const STARTER_PRESETS: readonly EmailPreset[] = [
  {
    id: null,
    name: "Empty truck / backhaul ask",
    subject: "Hotshot empty {area} — available {when}",
    body:
      "Hi {broker},\n\nHARBLANC has a hotshot sitting empty in {area}, ready {when} and willing to deadhead. Anything moving out of the area?\n\nReply to this email or call (xxx) xxx-xxxx.\n\nThanks,\nHARBLANC",
  },
  {
    id: null,
    name: "Rate inquiry",
    subject: "Rate check — {area} outbound",
    body:
      "Hi {broker},\n\nWhat are you paying on lanes out of {area} right now? HARBLANC runs a hotshot (dually + gooseneck) and can be flexible on a pickup around {when}.\n\nAppreciate any numbers you can share.\n\nThanks,\nHARBLANC",
  },
  {
    id: null,
    name: "New lane intro",
    subject: "Introducing HARBLANC — hotshot capacity",
    body:
      "Hi {broker},\n\nI'm reaching out to introduce HARBLANC — an owner-operated hotshot carrier (dually + 40' gooseneck). We're building steady lanes and would love to be on your list for freight, especially around {area}.\n\nHappy to send our MC/COI. What's the best way to get set up?\n\nThanks,\nHARBLANC",
  },
] as const;
