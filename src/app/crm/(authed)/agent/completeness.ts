/**
 * Data-completeness gaps, DERIVED AT READ TIME — never stored.
 *
 * A gap is a FACT ABOUT THE RECORD, not a decision a human made. That
 * distinction is the whole design (Brent, 2026-08-26):
 *
 *   - Stored as crm_tasks rows, 28 unowned companies x 3 gaps would be 84
 *     phantom rows that go stale the moment somebody fills a field, need
 *     reaping, and corrupt every open/overdue count the reporting depends on.
 *     "Overdue" would stop meaning anything.
 *   - Derived, they cost nothing to switch on or off, they SELF-HEAL the
 *     instant the field is filled, and no count anywhere has to know about
 *     them.
 *
 * A PLAIN module — no React, no DB — same contract as agentWork.ts and
 * tasks/plan.ts. Callers pass company rows they already loaded; this decides
 * what is missing.
 */

/** The gaps worth chasing. Deliberately short: things an agent can actually
 * go and find out, not every empty column on the record. `contact` and
 * `contact_name` are two states of the same question — is there anybody to
 * call, and do we know who they are — and never fire together. */
export const GAP_KINDS = ["contact", "contact_name", "address", "industry"] as const;
export type GapKind = (typeof GAP_KINDS)[number];

export type CompletenessGap = {
  /** Stable across renders — `gap:<kind>:<companyId>`. Not a task id, and
   * deliberately not shaped like one, so a gap can never be mistaken for a
   * crm_tasks row by anything downstream. */
  id: string;
  kind: GapKind;
  companyId: string;
  companyName: string;
  /** What the agent is being asked to do. */
  label: string;
  /** Deep link to the company, focused on the thing that's missing. */
  href: string;
  /** crm_accounts.source, carried through so a gaps row can show the same
   * provenance pill the company shows everywhere else. Never control flow. */
  source: string | null;
  /**
   * Does this gap stop the work, as opposed to merely thinning the record?
   *
   * READ THIS BEFORE CALLING IT A STAGE GATE. Nothing in this app refuses a
   * stage change for a missing field — updateLifecycleStatus moves a company
   * anywhere at any time and blocks exactly one thing, a terminal stage with
   * no reason. So this is NOT "blocks Qualified" in the enforcement sense,
   * and no badge here should claim it is.
   *
   * What it IS: a true statement about the work. Qualified hands an agent
   * "Make first contact" (assignmentTask.ts), and you cannot make first
   * contact with a company that has nobody on file to call. A missing
   * industry or freight spend costs you context; a missing contact costs you
   * the ability to start. That difference is real and worth one marker.
   */
  blocking: boolean;
};

/** The company shape a gap is computed from — every field already loaded by
 * the agent surfaces, so nothing new is queried to support this. */
export type CompletenessInput = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** crm_accounts.address, when the caller has it. */
  address?: string | null;
  industry?: string | null;
  /** How many contacts this company has on file. */
  contactCount: number;
  /**
   * How many of those have somebody's NAME on them.
   *
   * THE TRAP THIS EXISTS TO AVOID. A BOL that prints a phone against a
   * blank Contact line should still produce something callable — but the
   * moment that contact is created, contactCount stops being 0 and the
   * "Find a contact" gap disappears. The company would look MORE complete
   * for having gained a nameless number, and drop off the dashboard that
   * was going to get it chased. That is backwards.
   *
   * So the count of NAMED contacts is what decides whether anybody here is
   * actually identified.
   *
   * OPTIONAL, defaulting to contactCount, so the several callers that do
   * not load a per-contact flag keep their exact current behaviour: if
   * every contact is assumed named, this gap can never fire for them.
   * Callers that do know pass the real number.
   */
  namedContactCount?: number;
  /** crm_accounts.source — provenance for the pill, optional because the
   * older callers of this derivation never needed it. */
  source?: string | null;
};

const GAP_LABEL: Record<GapKind, string> = {
  contact: "Find a contact",
  // NAMES THE NEXT ACTION, not the deficiency. "Add a contact name" would
  // describe the record; this describes what the agent does — pick up the
  // number that is already on file and ask.
  contact_name: "Find out who answers",
  address: "Add their address",
  industry: "Set their industry",
};

/** Why it matters, shown small under the label so the ask isn't arbitrary. */
export const GAP_REASON: Record<GapKind, string> = {
  contact: "nobody to call there yet",
  contact_name: "a number on file, but nobody's name",
  address: "no address on file",
  industry: "not categorised",
};

/**
 * Which kinds stop the work. Exactly one does — see `blocking` above for why
 * this is a statement about what an agent can do, not about what the server
 * will refuse.
 */
export const GAP_BLOCKS_WORK: Record<GapKind, boolean> = {
  contact: true,
  /**
   * FALSE, and the distinction is the point. `blocking` means "you cannot
   * start" — and you CAN start here: there is a number, you dial it, and
   * the person who picks up tells you their name. That is the whole job.
   *
   * It is still a gap, so the company keeps exactly the same gap COUNT it
   * had when it had nobody on file at all, and keeps its place on the
   * dashboard. What changes is only the instruction: "Find a contact"
   * becomes "Find out who answers", which is a smaller and more specific
   * ask than the one it replaces.
   */
  contact_name: false,
  address: false,
  industry: false,
};

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

/**
 * Which gaps this company has, in a fixed order — contact first, because a
 * company with nobody to call is the one you genuinely cannot work.
 *
 * ADDRESS counts city/state as sufficient when no full address column is
 * loaded. A company with a city and state is placeable; demanding a street
 * address for a prospect nobody has spoken to yet would generate noise, not
 * work.
 */
export function gapsForCompany(company: CompletenessInput): CompletenessGap[] {
  const gaps: CompletenessGap[] = [];
  const add = (kind: GapKind) =>
    gaps.push({
      id: `gap:${kind}:${company.id}`,
      kind,
      companyId: company.id,
      companyName: company.name,
      label: GAP_LABEL[kind],
      // Straight to the company. The profile is where every one of these is
      // fixed, and `#details` puts the detail card in view rather than making
      // them hunt for the field.
      href: `/crm/accounts/${company.id}#details`,
      source: company.source ?? null,
      blocking: GAP_BLOCKS_WORK[kind],
    });

  if (company.contactCount === 0) {
    add("contact");
  } else if ((company.namedContactCount ?? company.contactCount) === 0) {
    // Contacts exist, but not one of them is a person yet — every row is a
    // bare number. Mutually exclusive with "contact" above: a company is
    // either missing people or missing their names, never told both.
    add("contact_name");
  }
  if (isBlank(company.address) && (isBlank(company.city) || isBlank(company.state))) add("address");
  if (isBlank(company.industry)) add("industry");
  return gaps;
}

/**
 * Every gap across a book of companies, worst-first: a company missing more
 * things comes first, then alphabetically so the order is stable between
 * renders.
 *
 * `limit` caps what a surface shows. These are background hygiene, not the
 * day's work — an agent with 26 half-filled companies should see a handful,
 * not seventy-eight rows burying their actual tasks.
 */
export function gapsForBook(
  companies: CompletenessInput[],
  limit = 5,
): CompletenessGap[] {
  const byCompany = companies
    .map((c) => ({ company: c, gaps: gapsForCompany(c) }))
    .filter((x) => x.gaps.length > 0)
    .sort((a, b) => {
      if (a.gaps.length !== b.gaps.length) return b.gaps.length - a.gaps.length;
      return a.company.name.localeCompare(b.company.name);
    });

  return byCompany.flatMap((x) => x.gaps).slice(0, limit);
}

/** Total gaps across the book, ignoring the display cap — so a surface can
 * say "5 of 23" honestly rather than implying five is all there is. */
export function countGaps(companies: CompletenessInput[]): number {
  return companies.reduce((sum, c) => sum + gapsForCompany(c).length, 0);
}
