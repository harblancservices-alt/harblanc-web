/**
 * WHAT TYPING IN THE COMPANY SEARCH MATCHES.
 *
 * Brent asked to "search companies by name". It matches NAME, CITY and
 * STATE, and the extra two are not scope creep for two reasons:
 *
 *   The page already worked this way. Workspace → Companies' existing
 *   server search runs against crm_accounts.search_tsv, which indexes name,
 *   industry, city, state, carrier, DOT and MC. Narrowing a new search to
 *   name-only would have made two searches on the same product disagree
 *   about what a search is.
 *
 *   It is how a broker identifies a company. "The fence place in Houston"
 *   is a real way to think about a customer whose exact name you cannot
 *   recall, and 60 of these 99 companies are in Texas.
 *
 * NOT source, and not industry. `source` is a slug vocabulary (bol / otr /
 * manual) Brent has said he will remodel himself, and typing "otr" to get
 * every OTR import is a filter, not a search — the tabs already do that job.
 *
 * ── EVERY TOKEN MUST MATCH ────────────────────────────────────────────
 *
 * "houston fence" finds a fence company in Houston rather than everything
 * in Houston plus everything with fence in the name. AND across tokens is
 * what makes a second word useful instead of noisy.
 */

export type SearchableCompany = {
  name: string;
  city?: string | null;
  state?: string | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The tokens a query breaks into. Exported so a caller can tell whether a
 * query is empty without repeating the whitespace rules. */
export function searchTokens(query: string): string[] {
  return norm(query).split(" ").filter(Boolean);
}

export function matchesCompanySearch(company: SearchableCompany, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;

  // One haystack rather than three checks per token: a token is allowed to
  // match any field, and joining with a space stops a token spanning the
  // boundary between two fields (so "fence houston" cannot match by
  // straddling name and city).
  const haystack = [norm(company.name), norm(company.city), norm(company.state)]
    .filter(Boolean)
    .join(" ");

  return tokens.every((token) => haystack.includes(token));
}

/** Convenience for the two list pages — filter and keep order. */
export function filterCompanies<T extends SearchableCompany>(rows: T[], query: string): T[] {
  if (searchTokens(query).length === 0) return rows;
  return rows.filter((row) => matchesCompanySearch(row, query));
}
