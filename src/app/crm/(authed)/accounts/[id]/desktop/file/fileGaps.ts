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
 *   current_carrier       who moves their freight today
 *   annual_freight_spend  how much of it there is
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

export type FileGapKind = "contact" | "address" | "industry" | "carrier" | "spend";

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
};

const EXTRA: Record<"carrier" | "spend", Omit<FileGap, "kind">> = {
  carrier: {
    label: "Current broker or carrier",
    why: "you cannot pitch against nobody",
    placeholder: "who moves it today?",
    needsForm: false,
  },
  spend: {
    label: "Freight spend per year",
    why: "tells you whether this is worth chasing",
    placeholder: "roughly, in dollars",
    needsForm: false,
  },
};

/** The three shared gaps, reworded for a page where you already know which
 * company you are looking at. The dashboard says "Add their address"
 * because it is listing many companies; here, "their" is redundant. */
const SHARED: Record<"contact" | "address" | "industry", Omit<FileGap, "kind">> = {
  contact: {
    label: "Somebody to call",
    why: "nobody is on file here yet",
    placeholder: null,
    needsForm: true,
  },
  address: {
    label: "Their address",
    why: "no address on file",
    placeholder: "street, city, state",
    needsForm: false,
  },
  industry: {
    label: "What they actually do",
    why: "not categorised",
    placeholder: "e.g. Scaffolding, Pumps",
    needsForm: false,
  },
};

export type FileGapInput = CompletenessInput & {
  currentCarrier?: string | null;
  annualFreightSpend?: number | null;
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
  }));

  const extra: FileGap[] = [];
  if (isBlank(company.currentCarrier)) extra.push({ kind: "carrier", ...EXTRA.carrier });
  if (company.annualFreightSpend === null || company.annualFreightSpend === undefined) {
    extra.push({ kind: "spend", ...EXTRA.spend });
  }

  return [...shared, ...extra];
}
