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

/** The gaps worth chasing. Deliberately short: three things an agent can
 * actually go and find out, not every empty column on the record. */
export const GAP_KINDS = ["contact", "address", "industry"] as const;
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
};

const GAP_LABEL: Record<GapKind, string> = {
  contact: "Find a contact",
  address: "Add their address",
  industry: "Set their industry",
};

/** Why it matters, shown small under the label so the ask isn't arbitrary. */
export const GAP_REASON: Record<GapKind, string> = {
  contact: "nobody to call there yet",
  address: "no address on file",
  industry: "not categorised",
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
    });

  if (company.contactCount === 0) add("contact");
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
