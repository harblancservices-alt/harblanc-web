import type { AdminContactRow } from "./contacts-data";

/**
 * Admin → Contacts: the pure derivations over its row shape.
 *
 * A PLAIN module — no React, no DB — same contract as
 * ../companies/companyRow.ts, which this deliberately mirrors: same filter
 * idiom (one key per owner, plus an "everything" key and a problem bucket
 * pinned first), same coldest-first default order.
 */

/** Filter key for contacts whose company has no owner — or no company. Not a
 * real user id. */
export const UNLINKED = "unlinked" as const;

export function matchesContactOwner(row: AdminContactRow, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === UNLINKED) return row.ownerName === null;
  return row.ownerName === filter;
}

/**
 * Counts per filter key. Keyed by owner NAME rather than id because that is
 * what the row carries — the display name is already resolved server-side and
 * a second id→name map on the client would be a way for the two to disagree.
 */
export function countContactsByOwner(
  rows: AdminContactRow[],
  ownerNames: string[],
): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length, [UNLINKED]: 0 };
  for (const name of ownerNames) counts[name] = 0;
  for (const row of rows) {
    if (row.ownerName === null) counts[UNLINKED] += 1;
    else if (row.ownerName in counts) counts[row.ownerName] += 1;
  }
  return counts;
}

/**
 * Unowned first, then coldest-contact first, then by name — the same default
 * order Admin → Companies uses, for the same reason: the screen exists to
 * answer "who is nobody working, and of those what has been ignored longest".
 * A never-contacted row sorts as colder than any contacted one rather than
 * sinking, because never-contacted is the worst case, not a missing value.
 */
export function sortContactsForAdmin(rows: AdminContactRow[]): AdminContactRow[] {
  return [...rows].sort((a, b) => {
    const aUn = a.ownerName === null ? 0 : 1;
    const bUn = b.ownerName === null ? 0 : 1;
    if (aUn !== bUn) return aUn - bUn;
    const am = a.lastContactMs ?? -Infinity;
    const bm = b.lastContactMs ?? -Infinity;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name);
  });
}

/** The distinct owner names present, in display order — drives the filter
 * row. An owner with no contacts still gets a tab (see the page), so this is
 * built from the roster, not from the rows. */
export function ownerNamesOf(rows: AdminContactRow[]): string[] {
  return [...new Set(rows.map((r) => r.ownerName).filter((n): n is string => n !== null))].sort(
    (a, b) => a.localeCompare(b),
  );
}
