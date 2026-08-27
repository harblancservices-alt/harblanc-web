/**
 * Admin → Companies: the row shape and every pure derivation over it.
 *
 * A PLAIN module (no React, no DB) — same contract as operations/loads/
 * loadRow.ts, shipments/readiness.ts and admin/workItem.ts. The server page
 * builds CompanyRow[] from the existing data layer and hands it to a client
 * component; everything in between is a pure function tested without a
 * browser.
 *
 * This is the MANAGEMENT view: every crm_accounts row in the org regardless
 * of owner. It deliberately does NOT reuse the agent-facing visibility gate
 * in _shell/unclaimedCompanies.ts — that gate hides unowned work from agents,
 * and hiding it from the admin whose job is to assign it would defeat the
 * screen.
 */

export const UNASSIGNED = "unassigned" as const;

export type CompanyRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** crm_accounts.assigned_user_id, or null. The filter key for this row. */
  ownerId: string | null;
  /** Display name of the owner, or null when nobody owns it. */
  ownerName: string | null;
  /** crm_accounts.source, verbatim. Never rewritten — see sourceBucket(). */
  source: string | null;
  /** crm_accounts.lifecycle_status, raw; render through lifecycle.ts. */
  stage: string | null;
  /**
   * Epoch ms of the most recent real human contact, or null for never.
   * Derived by the EXISTING rule (accounts/page.tsx): the later of the last
   * logged call and the last CONTACT-kind activity. Not a second definition.
   */
  lastContactMs: number | null;
  /** Open crm_tasks on this company. */
  openWork: number;
  /** The person the phone list offers to call — crm_accounts.primary_contact_id
   * where set, else the first contact by name (lib/crm/primaryContact). Null
   * when nobody is on file at all. */
  contactName: string | null;
  /** What Call actually dials: the company's own number if it has one, else
   * that contact's. Null when neither exists — 51 of 99 companies. */
  callPhone: string | null;
};

/**
 * Where a company came from, bucketed for display.
 *
 * `crm_accounts.source` carries TWO vocabularies at once in production: the
 * lowercase tokens the code writes ('manual', 'bol', 'ai_agent', 'otr') and
 * free text a human typed into the same box ('Cold Call', a person's name
 * with a phone extension). This maps the known tokens to labels and drops
 * everything else into "Other" — it does NOT rewrite, normalise or clean the
 * stored value, which stays exactly as entered.
 *
 * `null` is its own bucket rather than being folded into Other: "we never
 * recorded a source" and "someone typed something we don't recognise" are
 * different problems and the admin should be able to tell them apart.
 */
export type SourceBucket = "manual" | "bol" | "otr" | "ai_agent" | "unknown" | "other";

const KNOWN_SOURCES: Record<string, SourceBucket> = {
  manual: "manual",
  bol: "bol",
  otr: "otr",
  ai_agent: "ai_agent",
};

export const SOURCE_BUCKET_LABEL: Record<SourceBucket, string> = {
  manual: "Entered by hand",
  bol: "Bill of lading",
  otr: "OTR",
  ai_agent: "AI agent",
  unknown: "Not recorded",
  other: "Other",
};

export function sourceBucket(source: string | null | undefined): SourceBucket {
  if (source === null || source === undefined || !source.trim()) return "unknown";
  return KNOWN_SOURCES[source.trim().toLowerCase()] ?? "other";
}

/**
 * What to SHOW in the Source column. A recognised token becomes its label; an
 * unrecognised value is shown verbatim so the admin can see the actual junk
 * rather than a row of identical "Other" cells that hide what needs cleaning.
 * Long prose is truncated for the column, not in the data.
 */
export function sourceLabel(source: string | null | undefined): string {
  const bucket = sourceBucket(source);
  if (bucket !== "other") return SOURCE_BUCKET_LABEL[bucket];
  const raw = (source ?? "").trim();
  return raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
}

/** Filter keys: unassigned first (it is the admin's inbox), then all, then
 * one per agent. Built from the team so an agent with no companies still
 * appears — "nobody has given Brent anything" is information. */
export type CompanyFilterKey = string;

export function matchesOwner(row: CompanyRow, filter: CompanyFilterKey): boolean {
  if (filter === "all") return true;
  if (filter === UNASSIGNED) return row.ownerId === null;
  return row.ownerId === filter;
}

export function countByOwner(rows: CompanyRow[], agentIds: string[]): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length, [UNASSIGNED]: 0 };
  for (const id of agentIds) counts[id] = 0;
  for (const row of rows) {
    if (row.ownerId === null) counts[UNASSIGNED] += 1;
    else if (row.ownerId in counts) counts[row.ownerId] += 1;
  }
  return counts;
}

/**
 * Unassigned first, then coldest-contact first, then by name.
 *
 * The default order answers the question the screen exists for: what is
 * nobody working, and of those, what has been ignored longest. A
 * never-contacted company sorts as colder than any contacted one rather than
 * sinking, because never-contacted is the worst case, not a missing value.
 */
export function sortForAdmin(rows: CompanyRow[]): CompanyRow[] {
  return [...rows].sort((a, b) => {
    const aUn = a.ownerId === null ? 0 : 1;
    const bUn = b.ownerId === null ? 0 : 1;
    if (aUn !== bUn) return aUn - bUn;
    const am = a.lastContactMs ?? -Infinity;
    const bm = b.lastContactMs ?? -Infinity;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name);
  });
}
