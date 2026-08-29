import { provenancePills, ROLE_TONE_ON_LIGHT, type PillTone } from "./provenance";

/**
 * THE PROVENANCE PILLS — what this company is, and where it came from.
 *
 * ── THE BRIEF, AND WHY IT IS NOT RED ──────────────────────────────────
 *
 * Brent asked for red pills, then replaced the colour with the goal:
 * "whatever color makes them able to see it without looking for it."
 *
 * Red was the wrong instrument for that goal in THIS app. Red is already
 * the destructive colour here — Delete, and the solid `bg-bad` "+ person"
 * button one panel away. Putting a red pill on every company profile
 * spends that signal on something that is not a warning, and the controls
 * where red genuinely means "careful" get quieter by comparison. So red is
 * kept for the one role where "careful" is the actual message.
 *
 * ── TWO GROUNDS, MEASURED ─────────────────────────────────────────────
 *
 * These pills render on two different backgrounds, so one treatment cannot
 * serve both. Desktop's company-file header is `bg-graphite` (#14171d,
 * near-black); the mobile header is `bg-card` (#ffffff). Contrast of the
 * PILL against the surface it sits on, which is what decides whether the
 * eye lands on it without hunting:
 *
 *   ON THE DARK HEADER (`onDark`)
 *     lead     bg-amber   #e2a33d on #14171d →  8.1:1   graphite text on it, 8.1:1
 *     broker   bg-bad-bg  #f6d9d9 on #14171d → 13.5:1   bad text on it,      5.0:1
 *              + a 2px inset #ad2a2a ring — see below
 *     neutral  white/12 tint                 → deliberately quiet
 *
 *   ON THE WHITE HEADER (default)
 *     lead     bg-amber   #e2a33d, graphite text on it, 8.1:1. The gold
 *              field is only 2.2:1 against white, so a #925c0a ring
 *              (5.6:1) draws its edge — the pill is found by the ring and
 *              read off the field
 *     broker   the same treatment as on dark. Here the pale field sits
 *              nearly flush with the ground, so the RING carries it:
 *              #ad2a2a on #ffffff → 6.7:1, and the text matches it
 *     neutral  bg-inset + border             → deliberately quiet
 *
 * Every one of those clears 4.5:1, and the two role tones clear it against
 * the header itself rather than only against their own text — which is the
 * thing that makes a pill findable rather than merely legible.
 *
 * FILLED, NOT OUTLINED. An outlined pill on either of these headers reads
 * as grey at a glance; that is the mistake earlier passes made and it is
 * the specific reason "make them noticeable" was asked for at all.
 *
 * ── BROKER READS DIFFERENT FROM THE OTHER TWO, ON PURPOSE ─────────────
 *
 * The three roles do not mean the same thing. "Possible shipper" and
 * "Possible receiver" are ordinary leads and share a tone. "Possible
 * broker" means DO NOT PITCH THIS COMPANY, which is the only one of the
 * three that changes what an agent does — so it is the only one carrying
 * red. Red still means "careful" everywhere it appears; it has simply
 * gained one more honest use rather than becoming decoration.
 *
 * THE RING IS NOT DECORATION. Rendered side by side on the real band, the
 * pale field ALONE reads pink, and beside a saturated amber it reads
 * QUIETER than the two pills it is meant to outrank — which inverts the
 * point of having it. The ring makes it read as red at a glance while
 * keeping it flat. A solid red fill was the third candidate and was
 * rejected for looking like a button, which is the one thing these must
 * never look like.
 *
 * ── THE SAME PILL MEANS THE SAME THING ON BOTH SCREENS ────────────────
 *
 * Every role keeps its hue across both grounds — gold for a lead, red for
 * a broker — and only the edge treatment changes, because a saturated fill
 * that reads cleanly on near-black has no edge at all on white. An earlier
 * pass gave the light ground its own darker palette, and rendering the two
 * side by side showed the cost: a muddy brown chip on the phone standing
 * for the same fact as a bright gold one on the desktop. Two pills, one
 * meaning, nothing learned once. An agent moving between a phone in a
 * truck and a desktop in the office should recognise these without
 * relearning them.
 *
 * ── A LABEL, NOT A BUTTON ─────────────────────────────────────────────
 *
 * No hover state, no cursor change, no border that suggests a hit target,
 * and it is a <span> — nothing here is clickable, so nothing should invite
 * a tap. Corrections happen where every other company field is corrected:
 * the Edit company dialog, which carries a Role select.
 */

const TONE_ON_DARK: Record<PillTone, string> = {
  lead: "bg-amber text-graphite",
  broker: "bg-bad-bg text-bad ring-2 ring-inset ring-bad",
  /* WAS bg-white/12 -- a 1.42:1 chip on the graphite band, which is to say
     no chip at all: the words floated on the header and the label read as
     stray grey text. Brent: the source "used to be obvious and is now
     hidden". A 90% white field is 14.65:1 and unmistakably a label, while
     staying just under the company name's 17.95:1 so the name still leads. */
  neutral: "bg-white/90 text-graphite",
};

/* The two role tones come from provenance.ts so this pill and the
   abbreviation pill in Admin -> Work to assign cannot drift apart — see the
   note on ROLE_TONE_ON_LIGHT. Only the ring WEIGHT differs between the two
   surfaces: 2px here where there is room, 1px on a dense table row. */
const TONE_ON_LIGHT: Record<PillTone, string> = {
  lead: `${ROLE_TONE_ON_LIGHT.shipper} ring-2`,
  broker: `${ROLE_TONE_ON_LIGHT.broker} ring-2`,
  /* Same problem on the light header: a faint inset chip with muted text.
     A stronger border and full-strength ink make it read as a label. */
  neutral: "border border-line-strong bg-elevated text-fg",
};

export function ProvenancePills({
  source,
  bolRole,
  onDark = false,
  className = "",
}: {
  source: string | null;
  bolRole: string | null;
  /** True on the desktop company-file header, which is near-black. */
  onDark?: boolean;
  className?: string;
}) {
  const pills = provenancePills({ source, bolRole });
  if (pills.length === 0) return null;

  const tones = onDark ? TONE_ON_DARK : TONE_ON_LIGHT;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {pills.map((p) => (
        <span
          key={p.key}
          title={p.hint}
          /* 12px, not 10.5px. These are labels an agent must not have to hunt
             for, and at 10.5px on a 1920 screen they read as decoration.
             Padding grows with the type so the chip keeps its shape. */
          className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.05em] ${tones[p.tone]}`}
        >
          {p.text}
        </span>
      ))}
    </div>
  );
}
