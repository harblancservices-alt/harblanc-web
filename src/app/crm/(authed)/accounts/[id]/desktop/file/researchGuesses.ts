/**
 * WHAT THE APP CAN WORK OUT ON ITS OWN — and never writes by itself.
 *
 * A PLAIN module: no React, no DB. Same contract as fileGaps.ts and
 * completeness.ts, derived at read time and never stored. Callers pass rows
 * they already loaded; this decides what is worth offering.
 *
 * ── EVERY ONE OF THESE IS A GUESS, AND IS LABELLED AS ONE ─────────────
 *
 * Nothing here is a fact. A phone number lifted off the only contact on
 * file is probably the company's main line, and might be a mobile. Nine
 * sister branches selling waterworks pipe make the tenth very likely to,
 * and it might be the one that does something else. So the panel OFFERS
 * and a person decides — the same honesty rule the BOL provenance pills
 * follow, where an unverified read off a document says "possible" rather
 * than claiming.
 *
 * That is also why `basis` exists on every guess. It is rendered, and it is
 * stored on the account when the guess is accepted, so a value that came
 * from a machine's inference can always be told apart from one somebody
 * confirmed on a phone call.
 *
 * ── WHERE THE MATERIAL COMES FROM ─────────────────────────────────────
 *
 * Three sources, in descending order of how much they can be trusted:
 *
 *   1. Another column on this same company (a contact's phone).
 *   2. A sibling branch — companies whose name shares a stem. Core & Main
 *      has ten branches in this org and two of them know their industry.
 *   3. The description. 53 companies carry a written research dossier in
 *      context_notes with phones, emails, named people and a fit score
 *      inside it, while the columns built to hold those sit empty. Reading
 *      it back is the single cheapest win in the whole book.
 */

/** The fields the panel can offer a value for. Deliberately short: each one
 * has a real column behind it, the same bar fileGaps.ts sets. */
export const GUESS_FIELDS = ["industry", "phone", "website", "contact"] as const;
export type GuessField = (typeof GUESS_FIELDS)[number];

export type ResearchGuess = {
  field: GuessField;
  /** The value that would be written. For `contact`, the person's name. */
  value: string;
  /** A contact guess also carries the email it was found next to, because
   * the whole point of offering the person is being able to reach them. */
  email?: string | null;
  /**
   * WHY WE THINK SO, in the words shown on the panel and stored on the
   * record when accepted. Never a bare "guessed" — a reader six months
   * from now has to be able to judge it.
   */
  basis: string;
};

/** A company, as much of it as guessing needs. */
export type GuessInput = {
  id: string;
  name: string;
  industry: string | null;
  phone: string | null;
  website: string | null;
  contextNotes: string | null;
  /** Contacts on this company: name and their number/email, if any. */
  contacts: { name: string | null; phone: string | null; email: string | null }[];
  /** Every OTHER live company in the org, with its industry — used only to
   * find sibling branches. Name and industry are all this needs. */
  siblings: { id: string; name: string; industry: string | null }[];
  /** Fields a person has already accepted or dismissed. A dismissed field is
   * never offered again; that is the whole reason the marks are stored. */
  marks: Record<string, "accepted" | "dismissed" | undefined>;
};

/* ═══════════════ reading the description ════════════════════════════ */

/** US phone in either of the two shapes the descriptions actually use. */
const PHONE_RE = /\((\d{3})\)\s*(\d{3})-(\d{4})|\b(\d{3})-(\d{3})-(\d{4})\b/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
/** "David Chamberlain, dchamberlain@contractorsaccess.com" — a person's name
 * immediately before an address is the one pattern worth trusting. A bare
 * email like sales@ names nobody and must not invent a person. */
const NAMED_EMAIL_RE =
  /([A-Z][a-z]+(?:\s+[A-Z][a-z']+){1,2})[,;]?\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
/** "[Fit 8/10]" — 38 companies carry one. */
const FIT_RE = /\[Fit\s+(\d{1,2})\/10\]/i;

/** Mailbox providers, which say nothing about the company's own domain. */
const GENERIC_MAIL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "live.com", "msn.com", "comcast.net", "sbcglobal.net",
]);

/** The fit score somebody already wrote into the description, 0-10, or null.
 * Read for DISPLAY only — it is not offered as a write, because the number
 * is already visible in the text it came from. */
export function fitScoreFrom(contextNotes: string | null): number | null {
  const m = FIT_RE.exec(contextNotes ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}

/** The description with its "[Fit n/10]" prefix removed — that number is
 * drawn as a chip, so leaving it in the prose says it twice. */
export function descriptionWithoutFit(contextNotes: string | null): string {
  return (contextNotes ?? "").replace(FIT_RE, "").trim();
}

function phoneIn(text: string | null): string | null {
  const m = PHONE_RE.exec(text ?? "");
  if (!m) return null;
  return m[1] ? `(${m[1]}) ${m[2]}-${m[3]}` : `(${m[4]}) ${m[5]}-${m[6]}`;
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return GENERIC_MAIL.has(domain) ? null : domain;
}

/* ═══════════════ sibling branches ═══════════════════════════════════ */

/**
 * The first two words of a name, lowercased and stripped of punctuation.
 *
 * "Core And Main Ww Lubbock" and "Core And Main Ww Waco" share "core and";
 * so do the three WS Building branches and the two Betco Scaffold yards.
 * TWO WORDS, not one: "Core" alone would also match "Core Drilling", and a
 * one-word stem on a name like "Advantage Steel" would drag in every
 * company starting with "Advantage".
 */
export function nameStem(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  return words.slice(0, 2).join(" ");
}

/**
 * The industry a company's sibling branches agree on, or null.
 *
 * REQUIRES AGREEMENT, not just one example. If two siblings say different
 * things, the branches are not really one business and the panel says
 * nothing rather than picking a side. Also requires the stem to be two real
 * words, so a one-word company name never forms a family.
 */
export function siblingIndustry(
  name: string,
  siblings: { name: string; industry: string | null }[],
): { value: string; count: number } | null {
  const stem = nameStem(name);
  if (!stem.includes(" ")) return null;

  const family = siblings.filter((s) => nameStem(s.name) === stem);
  const known = family.map((s) => (s.industry ?? "").trim()).filter(Boolean);
  if (known.length === 0) return null;

  const first = known[0];
  const agreed = known.every((v) => v.toLowerCase() === first.toLowerCase());
  return agreed ? { value: first, count: family.length } : null;
}

/* ═══════════════ the offers ═════════════════════════════════════════ */

/**
 * Every guess worth showing for this company, in ask-order.
 *
 * A field is skipped when it already has a value, when a person has already
 * accepted or dismissed a guess for it, or when nothing in the material
 * supports one. So a company where somebody has said no to everything shows
 * an empty research column, which is correct: there is nothing left to
 * offer and the remaining gaps need a human.
 */
export function researchGuesses(company: GuessInput): ResearchGuess[] {
  const out: ResearchGuess[] = [];
  const notes = company.contextNotes ?? "";
  const open = (field: GuessField) => !company.marks[field];

  // ── What they make. The sibling branches, then the description. ──
  if (open("industry") && !company.industry?.trim()) {
    const sib = siblingIndustry(company.name, company.siblings);
    if (sib) {
      out.push({
        field: "industry",
        value: sib.value,
        basis:
          sib.count === 1
            ? "another branch of the same company is recorded this way"
            : `${sib.count} other branches of the same company are recorded this way`,
      });
    }
  }

  // ── Somebody to call, read out of the description. ──
  // Only when the company has NO contacts at all: offering a second person
  // on a company that already has one is noise, and the gap that blocks
  // work is "is there anybody", not "is there everybody".
  if (open("contact") && company.contacts.length === 0) {
    const m = NAMED_EMAIL_RE.exec(notes);
    if (m) {
      out.push({
        field: "contact",
        value: m[1].trim(),
        email: m[2].trim(),
        basis: "named in the description with this email address",
      });
    }
  }

  // ── A number for the company itself. ──
  if (open("phone") && !company.phone?.trim()) {
    const fromContact = company.contacts.find((c) => (c.phone ?? "").trim());
    if (fromContact) {
      out.push({
        field: "phone",
        value: (fromContact.phone ?? "").trim(),
        basis: fromContact.name
          ? `${fromContact.name}'s number — the only one on file`
          : "the only number on file",
      });
    } else {
      const fromNotes = phoneIn(notes);
      if (fromNotes) {
        out.push({
          field: "phone",
          value: fromNotes,
          basis: "written in the description",
        });
      }
    }
  }

  // ── A website, from whatever email address we have. ──
  // NEVER guessed from the company name: "coreandmain.com" happens to be
  // right and "advantagesteelservice.com" happens to be right, but the
  // failures are silent and land somebody on a competitor's site. An email
  // domain is evidence; a name is a hunch.
  if (open("website") && !company.website?.trim()) {
    const emails = [
      ...company.contacts.map((c) => c.email ?? ""),
      EMAIL_RE.exec(notes)?.[0] ?? "",
    ].filter(Boolean);
    for (const email of emails) {
      const domain = domainOf(email);
      if (domain) {
        out.push({
          field: "website",
          value: domain,
          basis: `from the email address ${email}`,
        });
        break;
      }
    }
  }

  return out;
}
