import {
  isBolRole,
  ROLE_ABBREV,
  ROLE_FULL,
  ROLE_TONE_ON_LIGHT,
} from "../accounts/[id]/provenance";

/**
 * PS / PR / PB — the role, in two letters, for Admin → Work to assign.
 *
 * Brent, from a screenshot of that list: "i would like it to say PS or PR in
 * a little pill to show if its a possible shipper possible receiver."
 *
 * ── WHY THE SHORT FORM ONLY LIVES HERE ────────────────────────────────
 *
 * That row already carries a company name, a town, a source pill, what the
 * company needs, how long it has waited, sometimes a Duplicate flag and a
 * View company link. "Possible receiver" spelled out does not fit without
 * wrapping the row, and a wrapped row costs more than the pill gives. The
 * company PROFILE keeps the full words, because there it fits.
 *
 * ── THE LETTERS ARE NOT THE MESSAGE. THE COLOUR IS. ───────────────────
 *
 * PS and PR are obvious once you know them and meaningless until you do, so
 * nothing here depends on them being read:
 *
 *   - The colour is the SAME as the full-word pill on the company profile,
 *     from one shared definition (ROLE_TONE_ON_LIGHT). Gold is a lead, red
 *     is a broker. Anyone who has opened one BOL company already knows what
 *     these mean without being told, which is the whole point of reusing
 *     the palette rather than picking fresh colours for a table.
 *   - `title` spells it out on hover.
 *   - `aria-label` spells it out for a screen reader, and the two letters
 *     are hidden from it, so it announces "Possible shipper" rather than
 *     the string "PS".
 *
 * ── SIZING ────────────────────────────────────────────────────────────
 *
 * `tabular-nums` is deliberate on a two-letter pill: PS, PR and PB are all
 * the same width in it, so a column of them lines up instead of jittering.
 * Fixed min-width for the same reason. `shrink-0` so it never compresses
 * into the source pill on a narrow screen — the row wraps its pill group
 * before either pill deforms.
 *
 * A 1px ring rather than the profile's 2px: at this size 2px eats the
 * field. The hue is unchanged, which is what carries the recognition.
 */
export function RoleAbbrevPill({ role }: { role: string | null }) {
  // Null on the 84 companies that never came off a BOL. They get NO pill —
  // not an empty one, not a dash. There is nothing true to say about them.
  if (!isBolRole(role)) return null;

  return (
    <span
      title={ROLE_FULL[role]}
      aria-label={ROLE_FULL[role]}
      className={`inline-flex min-w-[26px] shrink-0 items-center justify-center rounded-[4px] px-1 py-0.5 text-[10.5px] font-extrabold tabular-nums ring-1 ${ROLE_TONE_ON_LIGHT[role]}`}
    >
      <span aria-hidden>{ROLE_ABBREV[role]}</span>
    </span>
  );
}
