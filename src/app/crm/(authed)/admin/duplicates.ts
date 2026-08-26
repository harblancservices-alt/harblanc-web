/**
 * "Is there already a company by this name?" — DERIVED AT READ TIME, never
 * stored.
 *
 * Same call as the completeness gaps: a duplicate is a fact about the current
 * contents of the table, not a property of a row. Storing a flag would mean
 * every rename, merge or delete anywhere could silently make it a lie, and
 * nothing would be watching. Recomputing it per read costs one extra
 * id-and-name query and is always true.
 *
 * A PLAIN module — no React, no DB.
 *
 * WHY IT EXISTS. Brent's rule: duplicates do not block conversion. An OTR
 * entry that matches an existing company still becomes a company; it just
 * gets labelled so he can see it and decide himself. Refusing to convert, or
 * guessing at a merge, both take a judgement about a real business away from
 * the person who should be making it.
 *
 * DELIBERATELY SLIGHTLY OVER-EAGER. The flag is advisory — it costs a glance
 * when wrong and hides a real duplicate when too strict, so the rule leans
 * towards showing more. It is not a merge trigger and nothing acts on it
 * automatically.
 */

/** Legal-form noise that says nothing about identity. */
const SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|ltd|lp|llp|company|the)\b/g;

/**
 * A company name reduced to what actually identifies it.
 *
 * Lowercase, drop the legal form, drop every non-alphanumeric, then drop a
 * trailing "s". That last step is what makes "BETCO Scaffolds" and "Betco
 * Scaffold" the same key — a real pair in this org, and the case that
 * prompted the whole feature.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/s$/, "");
}

/**
 * Below this, a prefix match is noise rather than signal — "TNT" would
 * otherwise flag against anything starting "tnt".
 */
const MIN_KEY = 6;

/**
 * Same company, probably?
 *
 * Equal keys, or one a prefix of the other — the prefix arm is what catches
 * "Betco Scaffold" inside "Betco Scaffold San Antonio", which is how a second
 * LOCATION of a company already in the book shows up. Both keys must clear
 * MIN_KEY for the prefix arm to apply; exact equality always counts.
 */
export function looksLikeSameCompany(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length < MIN_KEY || kb.length < MIN_KEY) return false;
  return ka.startsWith(kb) || kb.startsWith(ka);
}

/**
 * For each company in `subjects`, the OTHER companies that look like it.
 *
 * `all` is every live company in the org, subjects included — a row is never
 * matched against itself (compared by id, not by name, so two genuinely
 * distinct rows sharing a name still flag each other).
 *
 * Returns a map keyed by subject id; a subject with no match is absent, which
 * callers read as "not a duplicate".
 */
export function findDuplicates(
  subjects: { id: string; name: string }[],
  all: { id: string; name: string }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const subject of subjects) {
    const hits = all
      .filter((other) => other.id !== subject.id && looksLikeSameCompany(subject.name, other.name))
      .map((other) => other.name);
    if (hits.length) out.set(subject.id, hits);
  }
  return out;
}
