import { nameMatchKey } from "../../_shell/contactFields";

/**
 * Real, deterministic company/contact matching — no AI call, no external API.
 * Dice's coefficient over character bigrams gives an honest numeric
 * similarity score for spelling/punctuation variance ("JT Thorpe" vs "J.T.
 * Thorpe Inc"); combined with the CRM's existing exact-normalized-name key
 * (contactFields.ts::nameMatchKey) for a true 1.0 on an exact match, and a
 * same-city/state signal that can promote a borderline score. Everything
 * here is a real, inspectable computation — never a fabricated confidence
 * number.
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

export function nameSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

export function matchTier(score: number, sameCityState: boolean): MatchTier | null {
  if (score >= 0.98) return "exact";
  if (score >= 0.55 || (score >= 0.38 && sameCityState)) return "likely";
  if (score >= 0.28) return "possible";
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
  return results.slice(0, 5);
}

export const MATCH_TIER_LABEL: Record<MatchTier, string> = {
  exact: "Exact match",
  likely: "Likely match",
  possible: "Possible match",
};
