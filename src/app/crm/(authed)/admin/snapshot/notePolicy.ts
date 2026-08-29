/**
 * WHAT MAY GO IN A COMPANY NOTE — and what may never.
 *
 * Brent, 2026-08-29, as a standing rule applied retroactively: "make sure in
 * the notes you dont put ANY internal data. nothing about sales agents or
 * any back end memory things i tell you. 'carrier was us — harblanc' is not
 * needed."
 *
 * A company note is about THE COMPANY. It is read by whoever picks the
 * record up, and everything in it should help them work that company.
 *
 * ── OUT ───────────────────────────────────────────────────────────────
 *
 *   - Our own name, in any form. A BOL naming us as the carrier is a fact
 *     about our operation, not about the shipper whose profile it is on.
 *   - Sales agents by name; who owns what; anything about assignment.
 *   - Our internal rules and decisions stated as policy — "brokers are not
 *     created as companies", "recorded as references rather than promoted",
 *     "deliberately left blank". These are notes to ourselves wearing the
 *     costume of a note about a company.
 *   - Internal identifiers for our own systems, e.g. "Snapshot #4". The
 *     document is the provenance; the number of the photograph in our
 *     capture queue is not.
 *   - Our activity log — "has not been called", "nobody has been reached".
 *     Say the DATA is unverified instead: same warning, no operational
 *     detail, and it stays true if somebody calls tomorrow.
 *
 * ── IN — and this is the part worth protecting ────────────────────────
 *
 *   - Facts about the company: what they do, size, site, addresses,
 *     phones, named people and their roles.
 *   - PROVENANCE of those facts: "printed on the BOL", "from their own
 *     site", "directory-sourced, unconfirmed". This is not internal data —
 *     it is how an agent decides whether to trust a number, and it is what
 *     stopped a Missouri phone number being dialled against a Texas
 *     address.
 *   - Conflicts and cautions about the data itself.
 *   - The commercial read: what they ship and why they would need a
 *     carrier. "They move resin, not forklifts" is the note worth having.
 *
 * ── WHY A FUNCTION AND NOT JUST A COMMENT ─────────────────────────────
 *
 * The notes this rule was written for were composed by hand, so the only
 * thing that can stop a recurrence is something that gets RUN. This is the
 * check, with the real offending strings pinned as tests. Anything that
 * writes a company, contact or BOL-entry note should pass through it.
 *
 * It is intentionally a WARNING tool, not a sanitiser. It reports what it
 * found and leaves the rewrite to a human or to the caller — silently
 * stripping words out of a note would produce sentences nobody wrote and
 * would hide the mistake rather than fix it.
 */

export type NoteViolation = {
  /** Which rule was broken. */
  kind: "our-company" | "agent-name" | "internal-process" | "internal-id" | "activity-log";
  /** The offending text, so a caller can show what to fix. */
  match: string;
  /** What to do instead. */
  guidance: string;
};

/**
 * The agent first names in this org. Deliberately a short explicit list
 * rather than a lookup against crm_profiles: this module is pure and has no
 * database, and the point is to catch a note being COMPOSED, which happens
 * before any row exists to check against.
 *
 * A name here can also be a legitimate part of a company's own contact —
 * see the false-positive note on findNoteViolations.
 */
const AGENT_NAMES = ["brent", "tyler", "kartik"];

const RULES: { kind: NoteViolation["kind"]; re: RegExp; guidance: string }[] = [
  {
    kind: "our-company",
    re: /\bharblanc\b/i,
    guidance:
      "Our own name does not belong in a note about another company. Drop the carrier line entirely — it is a fact about our operation, not about them.",
  },
  {
    kind: "agent-name",
    re: new RegExp(`\\b(${AGENT_NAMES.join("|")})\\b`, "i"),
    guidance:
      "Sales agents never appear in a company note. If the fact matters, state it about the company without naming who here learned it.",
  },
  {
    kind: "internal-process",
    re: /\b(not (added|created) as a compan\w*|deliberately (left|not)|rather than promoting|our lane)\b/i,
    guidance:
      "This states an internal rule or decision. Say what is true about the company instead, and leave our process out of their record.",
  },
  {
    kind: "internal-id",
    re: /\bsnapshot\s*#\s*\d+/i,
    guidance:
      "An internal capture id is not provenance. Name the document instead — its BOL number and the date it was photographed.",
  },
  {
    kind: "activity-log",
    re: /\b(has|have|had) (not )?been (called|dialled|dialed|reached)\b|\bnobody has been reached\b/i,
    guidance:
      'Do not record our call activity. Say the data is "unverified" — it carries the same warning and stays true tomorrow.',
  },
];

/**
 * Every rule this note breaks, in the order the rules are declared.
 * Returns [] for a clean note.
 *
 * KNOWN FALSE POSITIVE, and it is the right trade: a contact at a customer
 * who happens to be called Brent or Tyler trips `agent-name`. That is a
 * warning to look at, not a block — the caller decides. Silently allowing
 * agent names to slip through would be the worse failure of the two, since
 * that is the exact thing this exists to catch.
 */
export function findNoteViolations(note: string | null | undefined): NoteViolation[] {
  const body = (note ?? "").trim();
  if (!body) return [];

  const out: NoteViolation[] = [];
  for (const rule of RULES) {
    const m = body.match(rule.re);
    if (m) out.push({ kind: rule.kind, match: m[0], guidance: rule.guidance });
  }
  return out;
}

/** Convenience for a caller that only needs a yes/no. */
export function noteIsClean(note: string | null | undefined): boolean {
  return findNoteViolations(note).length === 0;
}
