/**
 * Admin → Overview's "work to assign" model — one pooled queue of everything
 * in the org that nobody owns yet, drawn from three different tables.
 *
 * A PLAIN module (no React, no DB), same contract as operations/loads/
 * loadRow.ts and shipments/readiness.ts: the server page builds WorkItem[]
 * from the existing data layer and hands it to a client component, and every
 * derivation in between — what it needs, how long it's waited, how a
 * selection splits across a team — is a pure function tested without a
 * browser.
 *
 * NOT A DASHBOARD. There is no metric, no trend and no per-person
 * performance number anywhere in this module on purpose: the page hands work
 * out, it does not report on people. The only per-person number is current
 * load, and it exists to answer "who has room", not "who is doing well".
 */

/** Which table an item came from. Provenance only — never control flow. */
export type WorkSource = "prospect" | "otr" | "bol";

export type WorkItem = {
  /** The SOURCE ROW's id (crm_accounts.id, crm_otr_entries.id, …). Unique
   * within a source but namespaced by `key` across the pooled list. */
  id: string;
  source: WorkSource;
  company: string;
  city: string | null;
  state: string | null;
  /** Plain English, written for a sales agent, not a schema reader. */
  needs: string;
  /** ISO timestamp this item started waiting (its created_at). */
  waitingSince: string;
  /**
   * Can the SOURCE ROW itself record an owner?
   *
   * TRUE only for prospects: crm_accounts.assigned_user_id exists and is the
   * CRM's real ownership mechanism. crm_otr_entries and crm_bol_entries have
   * NO assignee column — see ASSIGN_FALLBACK_NOTE.
   */
  ownable: boolean;
};

/** Namespaced key for React lists and selection sets — two tables can (and
 * do) hand back the same uuid shape, and the pooled list mixes them. */
export function itemKey(item: Pick<WorkItem, "source" | "id">): string {
  return `${item.source}:${item.id}`;
}

export function parseItemKey(key: string): { source: WorkSource; id: string } {
  const i = key.indexOf(":");
  return { source: key.slice(0, i) as WorkSource, id: key.slice(i + 1) };
}

/**
 * Where "open this item" goes, per source. The three sources are genuinely
 * different kinds of record and only one of them is a company:
 *
 *   prospect — a real crm_accounts row (ai_status='released'), so it opens
 *              the company profile.
 *   bol      — crm_bol_entries has its own detail route in the BOL Center.
 *   otr      — an OTR entry is NOT a company. It has no crm_accounts row
 *              until it is RELEASED, and crm_otr_entries has no per-entry
 *              route either (admin/otr renders a single list of cards with no
 *              anchors to link to), so this lands on the OTR queue itself.
 *              That is the most specific destination that exists; inventing a
 *              deep link to a page that cannot receive one would just 404.
 */
export function itemHref(item: Pick<WorkItem, "source" | "id">): string {
  switch (item.source) {
    case "prospect":
      return `/crm/accounts/${item.id}`;
    case "bol":
      return `/crm/admin/bol-center/${item.id}`;
    case "otr":
      return "/crm/admin/otr";
  }
}

/** The hover affordance's label. Never promises "company" for a record that
 * is not one — an OTR entry is a name someone said over the phone. */
export function itemOpenLabel(source: WorkSource): string {
  switch (source) {
    case "prospect":
      return "View company";
    case "bol":
      return "Open BOL entry";
    case "otr":
      return "Open in OTR";
  }
}

export const SOURCE_LABEL: Record<WorkSource, string> = {
  prospect: "Prospects",
  otr: "OTR",
  bol: "BOL Center",
};

/** Badge tone per source — outline pills, matching the mockup. */
export const SOURCE_TONE: Record<WorkSource, string> = {
  prospect: "border-accent/50 text-accent",
  otr: "border-ok/60 text-ok",
  bol: "border-warn/60 text-warn",
};

export const WORK_FILTERS = [
  { key: "all", label: "All" },
  { key: "prospect", label: "Prospects" },
  { key: "otr", label: "OTR" },
  { key: "bol", label: "BOL Center" },
] as const;

export type WorkFilterKey = (typeof WORK_FILTERS)[number]["key"];

/**
 * Why an item is in the queue, in the words an agent would use.
 *
 * BOL entries carry counts because the work is per-party: one entry can name
 * a shipper, a consignee, a bill-to and a carrier, and any subset of those
 * may already be matched to a real company.
 */
export function needsLabel(
  source: WorkSource,
  bol?: { unmatched: number; named: number },
): string {
  if (source === "prospect") return "Claim and start research";
  if (source === "otr") return "Research, then release";
  if (!bol || bol.named === 0) return "Match its companies";
  return `Match ${bol.unmatched} of ${bol.named} companies`;
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

export function matchesFilter(item: WorkItem, filter: WorkFilterKey): boolean {
  return filter === "all" || item.source === filter;
}

/** Live counts for the filter tabs, in one pass. */
export function countBySource(items: WorkItem[]): Record<WorkFilterKey, number> {
  const counts: Record<WorkFilterKey, number> = { all: items.length, prospect: 0, otr: 0, bol: 0 };
  for (const item of items) counts[item.source] += 1;
  return counts;
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
export function splitEvenly(keys: string[], personIds: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (personIds.length === 0) return out;
  keys.forEach((key, i) => {
    const person = personIds[i % personIds.length];
    (out[person] ??= []).push(key);
  });
  return out;
}

/**
 * The honest sentence about what "Assign" does to a non-prospect.
 *
 * crm_otr_entries and crm_bol_entries have no assignee column, so there is
 * nowhere on those rows to record an owner. Rather than disable the action or
 * silently assign only part of a mixed selection, assigning one of them
 * creates a crm_task for that person — the closest mechanism that already
 * exists — so the work still lands in someone's queue and "Assign 4" is true
 * for all four. The UI says so; nothing here is implied.
 */
export const ASSIGN_FALLBACK_NOTE =
  "OTR and BOL Center rows have no owner field, so those become an assigned task instead.";

/** Split a selection by what assigning it can actually do. */
export function partitionBySource(items: WorkItem[], keys: Set<string>) {
  const selected = items.filter((i) => keys.has(itemKey(i)));
  return {
    selected,
    ownable: selected.filter((i) => i.ownable),
    taskOnly: selected.filter((i) => !i.ownable),
  };
}
