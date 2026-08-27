/**
 * PHONE ORDERING — most recently contacted first, never-contacted last.
 *
 * Not alphabetical. On a phone you are chasing somebody you spoke to
 * recently, and search already covers the case where you know the name.
 * Alphabetical order is only useful when you are scanning a whole list,
 * which is the one thing nobody does on a 390px screen.
 *
 * NEVER-CONTACTED SINK TO THE BOTTOM rather than sorting as "infinitely
 * old". They are not stale work — most of them are brand new imports — but
 * they are also not what you reach for the phone to do, and putting 51
 * untouched companies above the four you actually called this week would
 * make the list useless in exactly the situation it is for.
 *
 * Ties break on name so the order is stable between renders rather than
 * left to the sort's own arbitrary choice.
 */

export type RecentlyContacted = {
  name: string;
  /** Epoch ms of the last real contact, or null when nobody ever has. */
  lastContactMs: number | null;
};

export function recentFirst<T extends RecentlyContacted>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const am = a.lastContactMs;
    const bm = b.lastContactMs;
    if (am === null && bm === null) return a.name.localeCompare(b.name);
    if (am === null) return 1;
    if (bm === null) return -1;
    if (am !== bm) return bm - am;
    return a.name.localeCompare(b.name);
  });
}
