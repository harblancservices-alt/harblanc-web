/**
 * Admin → Overview's "work to assign" model — every company in the org that
 * nobody owns yet.
 *
 * A PLAIN module (no React, no DB), same contract as operations/loads/
 * loadRow.ts and shipments/readiness.ts: the server page builds WorkItem[]
 * from the existing data layer and hands it to a client component, and every
 * derivation in between — how long something has waited, how a selection
 * splits across a team — is a pure function tested without a browser.
 *
 * ONE SOURCE, AS OF 2026-08-26. This used to pool three tables: unclaimed
 * prospects, OTR entries and BOL entries. Both funnels are gone. An OTR entry
 * now becomes an unassigned company the moment it is created (Brent's rule:
 * deciding who to assign it to IS the review), and BOL Center was retired
 * because nothing in the app ever wrote crm_bol_entries. What is left is one
 * homogeneous list of crm_accounts rows, which is why WorkItem no longer
 * carries a `source`, an `ownable` flag or a namespaced key: every row is a
 * company, and every company can record its own owner.
 *
 * That deleted a lot from this file — source labels and tones, the filter
 * tabs, per-source counting, the assign-fallback note and the partition
 * helper that existed only to split a mixed selection. None of it had a
 * second caller.
 *
 * NOT A DASHBOARD. There is no metric, no trend and no per-person
 * performance number anywhere in this module on purpose: the page hands work
 * out, it does not report on people. The only per-person number is current
 * load, and it exists to answer "who has room", not "who is doing well".
 */

export type WorkItem = {
  /** crm_accounts.id. */
  id: string;
  company: string;
  city: string | null;
  state: string | null;
  /** Plain English, written for a sales agent, not a schema reader. */
  needs: string;
  /** ISO timestamp this item started waiting (its created_at). */
  waitingSince: string;
  /**
   * Other companies already in the book that look like this one, by name.
   *
   * DERIVED AT READ TIME (admin/duplicates.ts), never stored — same call as
   * the completeness gaps. Empty for the overwhelming majority. Brent's rule
   * is that a duplicate does not block anything: it converts like everything
   * else and gets labelled so he can deal with it himself, so this is a
   * label, not a gate. Carries the NAMES rather than a boolean because "which
   * one?" is the first thing you ask when you see the flag.
   */
  duplicateOf: string[];
};

/** Every item is a company now, so "open this" is always its profile. */
export function itemHref(item: Pick<WorkItem, "id">): string {
  return `/crm/accounts/${item.id}`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * "9 days" / "6 hours" / "1 hour" / "just now".
 *
 * Takes `now` explicitly rather than calling Date.now() so the value is
 * deterministic in tests and identical on the server and the client — a
 * relative label computed independently in both places is the classic
 * hydration mismatch, and this one renders on every row.
 */
export function waitingLabel(sinceIso: string, now: number): string {
  const elapsed = now - Date.parse(sinceIso);
  if (!Number.isFinite(elapsed) || elapsed < HOUR) return "just now";
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.floor(elapsed / DAY);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export type WaitingUrgency = "fresh" | "warm" | "hot";

/** Three tiers, matching the mockup: days-old is loud, a day is a nudge,
 * hours are quiet. Nothing here is an SLA — it's a reading aid. */
export function waitingUrgency(sinceIso: string, now: number): WaitingUrgency {
  const elapsed = now - Date.parse(sinceIso);
  if (!Number.isFinite(elapsed)) return "fresh";
  if (elapsed >= 3 * DAY) return "hot";
  if (elapsed >= DAY) return "warm";
  return "fresh";
}

/** Longest-waiting first — the page's default and only sort. Sorts a copy.
 * An unparseable date sinks rather than floating: "we don't know" is not
 * "most urgent". */
export function sortByLongestWaiting(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const av = Date.parse(a.waitingSince);
    const bv = Date.parse(b.waitingSince);
    const aBad = !Number.isFinite(av);
    const bBad = !Number.isFinite(bv);
    if (aBad && bBad) return a.company.localeCompare(b.company);
    if (aBad) return 1;
    if (bBad) return -1;
    if (av !== bv) return av - bv; // older timestamp = waited longer = first
    return a.company.localeCompare(b.company);
  });
}

/**
 * Deal a selection round-robin across the team, longest-waiting first.
 *
 * Round-robin rather than contiguous chunks so the oldest items spread across
 * everyone instead of all landing on whoever happens to sort first — the
 * point of "split evenly" is that nobody gets the whole backlog of stale
 * work. Deterministic: same inputs, same deal, every time.
 *
 * Returns a map keyed by person id; a person who draws nothing is absent.
 */
export function splitEvenly(ids: string[], personIds: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (personIds.length === 0) return out;
  ids.forEach((id, i) => {
    const person = personIds[i % personIds.length];
    (out[person] ??= []).push(id);
  });
  return out;
}
