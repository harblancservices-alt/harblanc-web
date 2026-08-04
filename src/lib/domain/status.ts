/**
 * Status -> label/tone resolution for <StatusPill> (v2-architecture.md §2).
 * One place that knows what a status string means and what color it gets —
 * not a per-page string-to-color map. `domain` picks which vocabulary a
 * status belongs to (load/trip/lead all use different status sets).
 *
 * Tones map to the shared semantic tokens every /tms-v2 primitive uses:
 * "ok" = positive (delivered, paid, active), "warn" = needs-attention
 * (loaded, awaiting payment), "bad" = negative (TONU, cancelled, lost),
 * "neutral" = no urgency either way (new, draft).
 *
 * The exact status vocabularies below are a reasonable starting registry
 * inferred from v2-design.md's wireframes — they get corrected against the
 * live `loads`/`trips`/quote-pipeline schema once lib/data's query layer
 * lands (a later phase); the resolution mechanism (one function, one call
 * site per pill) is what's structural here, not today's exact string list.
 */

export type StatusDomain = "load" | "trip" | "lead";
export type StatusTone = "ok" | "warn" | "bad" | "neutral";

export type ResolvedStatus = {
  label: string;
  tone: StatusTone;
};

const LOAD_STATUS: Record<string, ResolvedStatus> = {
  booked: { label: "Booked", tone: "neutral" },
  assigned: { label: "Assigned", tone: "neutral" },
  loaded: { label: "Loaded", tone: "warn" },
  in_transit: { label: "In transit", tone: "warn" },
  delivered: { label: "Delivered", tone: "ok" },
  paid: { label: "Paid", tone: "ok" },
  tonu: { label: "TONU", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

const TRIP_STATUS: Record<string, ResolvedStatus> = {
  active: { label: "Active", tone: "warn" },
  closed: { label: "Closed", tone: "ok" },
};

const LEAD_STATUS: Record<string, ResolvedStatus> = {
  new: { label: "New", tone: "neutral" },
  contacted: { label: "Contacted", tone: "neutral" },
  estimate: { label: "Estimate sent", tone: "warn" },
  confirm: { label: "Confirming", tone: "warn" },
  booked: { label: "Booked", tone: "ok" },
  pay: { label: "Awaiting payment", tone: "warn" },
  dispatch: { label: "Dispatch", tone: "ok" },
  transit: { label: "In transit", tone: "ok" },
  closed: { label: "Closed", tone: "ok" },
  archived: { label: "Archived", tone: "neutral" },
  lost: { label: "Lost", tone: "bad" },
};

const REGISTRY: Record<StatusDomain, Record<string, ResolvedStatus>> = {
  load: LOAD_STATUS,
  trip: TRIP_STATUS,
  lead: LEAD_STATUS,
};

export function resolveStatus(domain: StatusDomain, status: string): ResolvedStatus {
  const known = REGISTRY[domain][status];
  if (known) return known;
  // Unknown status: show it verbatim rather than hiding it, but with no
  // implied urgency either way.
  return { label: status, tone: "neutral" };
}
