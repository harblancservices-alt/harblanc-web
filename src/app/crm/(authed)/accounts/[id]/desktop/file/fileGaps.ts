import { gapsForCompany, type CompletenessInput } from "../../../../agent/completeness";

/**
 * WHAT WE STILL NEED TO ASK — panel 04's right half, and the GAPS figure in
 * the company file's header.
 *
 * A PLAIN module: no React, no DB. Derived at read time, never stored —
 * same rule as completeness.ts, for the same reasons (a stored gap goes
 * stale the moment somebody fills the field, and corrupts every count that
 * reads it).
 *
 * ── WHY THIS EXISTS ALONGSIDE completeness.ts ─────────────────────────
 *
 * completeness.ts answers "can an agent work this company AT ALL" — is
 * there anybody to call, do we know where they are, do we know what they
 * do. Three things, and they drive the DASHBOARD's gaps panel across every
 * company an agent owns.
 *
 * The company file asks a longer question, because you are standing on one
 * record with the phone in your hand: what do I still not know that would
 * change how I sell to these people. Two more facts qualify, and both have
 * a REAL COLUMN behind them — that is the bar for being in this list:
 *
 *   phone                 a number to ring them on
 *   website               where you find out what they make
 *   current_carrier       who moves their freight today
 *
 * THE THREE SHARED GAPS ARE THE SAME DERIVATION, NOT A COPY. This calls
 * gapsForCompany and appends; it does not re-decide what a missing address
 * is. So the file and the dashboard can never disagree about the same
 * company, and the extra two never leak into the dashboard's counts — which
 * matters, because 0 of 99 companies have either column filled and adding
 * them there would have put ~198 new rows on a dashboard Brent just signed
 * off.
 *
 * ── WHAT THE DESIGN ASKED FOR THAT IS NOT HERE ────────────────────────
 *
 * "BLOCKS QUALIFIED" — the mockup chips one gap as blocking the next stage,
 * and the header reads "1 blocks Qualified". THERE IS NO SUCH GATE in this
 * codebase. updateLifecycleStatus will move a company to any stage at any
 * time; the only thing it ever refuses is Lost or Disqualified without a
 * reason. Rendering the chip would state a rule the app does not enforce,
 * so a rep would learn to ignore it the first time they moved a "blocked"
 * company to Qualified with one click. Flagged for Brent, not invented.
 *
 * "DOCK HOURS & APPOINTMENT RULE" — a genuinely good question with nowhere
 * to go. There is no column for it, and the nearest thing (context_notes)
 * is a free-text scratchpad, not a field. Left out rather than pointed at
 * the wrong column.
 */

export type FileGapKind = "contact" | "address" | "industry" | "carrier" | "phone" | "website";

export type FileGap = {
  kind: FileGapKind;
  /** The ask, as a rep would say it. */
  label: string;
  /** Why it is worth a question — shown small beside the label, so the ask
   * is never arbitrary. */
  why: string;
  /** Placeholder for the inline input, or null when this gap cannot be
   * typed into and needs a real form (see `needsForm`). */
  placeholder: string | null;
  /** True when filling this means opening the add-contact dialog: a person
   * is a name, a title, a number and an email, and one text box would
   * produce bad records faster. */
  needsForm: boolean;
  /** Nothing can happen here until this is filled — the same meaning
   * completeness.ts's GAP_BLOCKS_WORK carries, and read from it rather
   * than restated, so the two surfaces cannot disagree about which gap is
   * the one that stops you. The two file-only kinds sharpen a pitch; they
   * never block one. */
  blocking: boolean;
};

/**
 * THE FILE-ONLY GAPS. Each has a real column and is answerable — that is
 * the bar, and it is why the list changed on 2026-08-31.
 *
 * `spend` WAS HERE AND IS GONE. annual_freight_spend was 0 of 103 after
 * months on the panel, because companies do not tell a stranger their
 * budget. A chip nobody can ever clear is not a prompt, it is furniture,
 * and it teaches an agent to walk past the chips that DO work. Removed on
 * Brent's call. The column still exists and is still editable from All
 * fields; it just stops being asked for.
 *
 * `phone` and `website` replaced it. Both are researchable in under a
 * minute, both block a call in practice, and both are things the research
 * panel can often offer an answer for outright.
 */
const EXTRA: Record<"carrier" | "phone" | "website", Omit<FileGap, "kind">> = {
  phone: {
    label: "A number to ring",
    why: "You cannot ring a company without one.",
    placeholder: "(555) 555-5555",
    needsForm: false,
    blocking: false,
  },
  website: {
    label: "Their website",
    why: "Where you find what they make, and usually the switchboard.",
    placeholder: "theircompany.com",
    needsForm: false,
    blocking: false,
  },
  carrier: {
    label: "Who moves their freight today",
    // Was "you cannot pitch against nobody" — true, and meaningless to
    // somebody in their first week. See the note on SHARED below.
    why: "You are asking them to switch away from somebody. You need to know who.",
    placeholder: "a broker, a carrier, or their own trucks",
    needsForm: false,
    blocking: false,
  },
};

/** The three shared gaps, reworded for a page where you already know which
 * company you are looking at. The dashboard says "Add their address"
 * because it is listing many companies; here, "their" is redundant. */
const SHARED: Record<
  "contact" | "contact_name" | "address" | "industry",
  Omit<FileGap, "kind" | "blocking">
> = {
  contact: {
    label: "Somebody to call",
    why: "You can't call a company. You call a person.",
    placeholder: null,
    needsForm: true,
  },
  /* A number with nobody's name on it. Worded as the next action rather
     than the deficiency, and `needsForm` because the fix is opening the
     person and typing their name in — not typing a name into a one-line
     box that would have nowhere to put it. */
  contact_name: {
    label: "Who answers this number",
    why: "We have a number but no name — you'd be asking a stranger for a stranger.",
    placeholder: null,
    needsForm: true,
  },
  address: {
    label: "Their address",
    why: "Tells you whether we can serve them, and where the trucks would go.",
    placeholder: "street, city, state",
    needsForm: false,
  },
  industry: {
    label: "What they actually do",
    why: "Your first sentence on the call — “I know you make X…”",
    placeholder: "e.g. Scaffolding, Pumps",
    needsForm: false,
  },
};

export type FileGapInput = CompletenessInput & {
  currentCarrier?: string | null;
  phone?: string | null;
  website?: string | null;
};

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

/**
 * Every gap on this company, in ask-order: the things that stop you working
 * it at all first, then the things that sharpen the pitch.
 *
 * ONE LIST, used by both the header count and panel 04, so the number in
 * the header is always exactly the number of rows below it. The header
 * saying 3 while the panel listed 5 would be the same class of bug as a
 * task brief disagreeing with the gaps panel beside it.
 */
export function fileGaps(company: FileGapInput): FileGap[] {
  const shared = gapsForCompany(company).map((g) => ({
    kind: g.kind as FileGapKind,
    ...SHARED[g.kind],
    // Straight off the shared derivation — not a second opinion about
    // which gap blocks work.
    blocking: g.blocking,
  }));

  const extra: FileGap[] = [];
  // Ask-order: the two that stop you making the call, then the one that
  // sharpens it once you are on it.
  if (isBlank(company.phone)) extra.push({ kind: "phone", ...EXTRA.phone });
  if (isBlank(company.website)) extra.push({ kind: "website", ...EXTRA.website });
  if (isBlank(company.currentCarrier)) extra.push({ kind: "carrier", ...EXTRA.carrier });

  // Blocking first, the same rule structure A applies on the dashboard.
  // Stable within each group, so the list does not reshuffle between
  // renders — ask-order still holds inside a tier.
  return [...shared, ...extra].sort((a, b) => Number(b.blocking) - Number(a.blocking));
}
