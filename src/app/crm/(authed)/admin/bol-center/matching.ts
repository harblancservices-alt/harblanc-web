import { nameMatchKey } from "../../_shell/contactFields";

/**
 * Real, deterministic company/contact matching — no AI call, no external API.
 * No fabricated confidence number: this is a real, inspectable computation.
 *
 * Character-bigram Dice similarity ALONE was tested against this org's real
 * account list and found unreliable — e.g. "Core And Main Ww Austin" vs
 * "...Dallas" (genuinely different branches) scored 0.762, HIGHER than the
 * legitimate "JT Thorpe" vs "J.T. Thorpe Inc" match at 0.700, so no single
 * threshold could separate real matches from false positives. Averaging
 * bigram similarity with word-token Jaccard overlap (shared whole words,
 * not just character pairs) cleanly separated every real-vs-fake pair
 * tested, including the two reported false positives ("Simple Logistics
 * Solutions" incorrectly matching "Geo Solutions" on the shared word
 * "Solutions" alone, and an unrelated ISCO entity surfacing for a
 * completely different bill-to party) — both score well under the floor
 * below, while real matches ("Alfa Laval (Houston)" vs "Alfa Laval Inc.
 * (Houston)", etc.) score comfortably above it.
 */

export type MatchTier = "exact" | "likely" | "possible";

export type ScoredMatch<T> = {
  row: T;
  score: number;
  tier: MatchTier;
  sameCityState: boolean;
};

export { nameMatchKey };

function bigrams(raw: string): Set<string> {
  const clean = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

function bigramSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

function wordTokens(raw: string): Set<string> {
  const clean = raw
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return new Set(clean.split(/\s+/).filter(Boolean));
}

function wordJaccard(a: string, b: string): number {
  const A = wordTokens(a);
  const B = wordTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Average of character-bigram similarity and whole-word overlap — see the
 * module comment above for why neither signal alone is reliable enough. */
export function nameSimilarity(a: string, b: string): number {
  return (bigramSimilarity(a, b) + wordJaccard(a, b)) / 2;
}

/** Real minimum floor — a candidate that doesn't clear "possible" is not
 * shown at all (never a low-score guess dressed up as a suggestion). Values
 * calibrated against this org's real account list (see module comment). */
export function matchTier(score: number, sameCityState: boolean): MatchTier | null {
  if (score >= 0.98) return "exact";
  if (score >= 0.68 || (score >= 0.55 && sameCityState)) return "likely";
  if (score >= 0.5) return "possible";
  return null;
}

/** Score+rank an arbitrary set of candidate rows against a query name,
 * returning only rows that clear the "possible" floor, best first.
 * `isSameLocation(row)` is a caller-supplied predicate (exact city/state
 * equality, or a free-text address substring check) since the query side
 * doesn't always have the same shape as the candidate side. */
export function rankByName<T>(
  candidates: T[],
  queryName: string,
  getName: (row: T) => string,
  isSameLocation?: (row: T) => boolean,
): ScoredMatch<T>[] {
  const queryKey = nameMatchKey(queryName);
  if (!queryKey) return [];

  const results: ScoredMatch<T>[] = [];
  for (const row of candidates) {
    const rowName = getName(row);
    if (!rowName) continue;
    const sameCityState = Boolean(isSameLocation?.(row));
    const score = nameMatchKey(rowName) === queryKey ? 1 : nameSimilarity(rowName, queryName);
    const tier = matchTier(score, sameCityState);
    if (tier) results.push({ row, score, tier, sameCityState });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

/** A BOL's `bill_to` field is one free-text blob — typically "Company Name,
 * address, city, state zip (email)" all run together, not just a name. That
 * whole blob was being used as the match query, which dilutes similarity
 * scores toward zero and can spuriously boost an unrelated candidate that
 * happens to share address-y bigrams. The company/party name is reliably the
 * text before the first comma in every BOL bill_to string seen so far. */
export function billToPartyName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.split(",")[0]?.trim() ?? "";
}

export const MATCH_TIER_LABEL: Record<MatchTier, string> = {
  exact: "Exact match",
  likely: "Likely match",
  possible: "Possible match",
};
