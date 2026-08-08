/**
 * Broker-name dedup helpers — pure, zero I/O (v2-architecture.md §3).
 *
 * The DB's own `name_key` (a generated column, computed by Postgres from
 * `name` — see the various "generated name_key" comments across
 * src/actions/tms-v2/{brokers,loads,trips}.ts and src/app/admin/.../
 * brokers/actions.ts) is a simple lower(trim(name)) and is NOT changed by
 * anything here — that would require a DDL migration, which per Brent's
 * explicit instruction (audit fix, 2026-08-08) is not something to run
 * without his review of the exact constraint + a check for existing
 * duplicate name_keys first.
 *
 * What changes instead is the APPLICATION-level dedup check that runs
 * before deciding to create a new broker: normalizeBrokerName() strips
 * punctuation and common legal-entity suffixes, so "C.H. Robinson" and
 * "CH Robinson" (the audit's own example — different name_keys today,
 * since the DB's generated column only lowercases/trims) resolve to the
 * same candidate instead of silently creating a near-duplicate broker
 * row. This is a fuzzier, JS-side SECOND pass layered on top of the
 * existing exact name_key lookup, not a replacement for it — callers
 * still try the fast indexed exact match first.
 */

const LEGAL_SUFFIX_WORDS = new Set([
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llp",
  "pllc",
]);

/** "C.H. Robinson" and "CH Robinson" both -> "ch robinson"; "Acme, Inc."
 * and "Acme Inc" both -> "acme". Punctuation is DELETED outright (not
 * replaced with a space) so an abbreviation written with periods ("C.H.")
 * collapses onto the same token as one written without ("CH") — real
 * whitespace between words is left alone either way. Trailing legal-entity
 * suffix words are stripped one at a time (so "Acme LLC Inc" —
 * unlikely, but harmless — still fully strips) as long as at least one
 * word remains. */
export function normalizeBrokerName(raw: string): string {
  const noPunct = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "");
  const words = noPunct.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIX_WORDS.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

/** Finds an existing broker whose normalized name matches `targetName`,
 * among a list of candidate rows the caller already fetched (no I/O in
 * this module). Returns undefined for an empty/all-punctuation target
 * name rather than matching every candidate. */
export function findBrokerByNormalizedName<T extends { name: string }>(
  candidates: T[],
  targetName: string,
): T | undefined {
  const target = normalizeBrokerName(targetName);
  if (!target) return undefined;
  return candidates.find((c) => normalizeBrokerName(c.name) === target);
}
