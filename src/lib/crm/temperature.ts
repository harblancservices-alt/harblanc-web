import { normalizeStage, STALE_DAYS_BY_STAGE } from "@/app/crm/(authed)/accounts/lifecycle";

/**
 * How warm is this relationship — one definition, for companies, contacts
 * and calls alike.
 *
 * DERIVED, NEVER STORED, exactly like the completeness gaps and the
 * duplicate flag. Temperature is a fact about how long ago something
 * happened, so it is true only at the instant you compute it; a stored value
 * would start lying the moment the clock moved and nothing would be watching.
 *
 * IT IS MEASURED AGAINST THE STAGE'S OWN CLOCK, not a flat number of days.
 * STALE_DAYS_BY_STAGE already encodes how much silence each stage tolerates
 * — a live quote goes stale in 1 day, a new lead in 3, a contacted company in
 * 5 — and inventing a second, flat rule here would mean the dashboard's
 * "quiet" flag and this marker could disagree about the same company. So a
 * company is cold when it has passed the threshold its own stage sets.
 *
 * FOUR STATES, and the fourth is the one that matters most:
 *
 *   unstarted  nobody has ever made contact. NOT cold — cold means a
 *              relationship went quiet, and there is no relationship here
 *              yet. It is the most common state in this book (54 of 99
 *              companies) and it calls for a different action: start, rather
 *              than chase. It gets its own quiet marker, never a hot/cold
 *              colour.
 *   hot        contacted within a third of the stage's patience. Recent
 *              enough that the conversation is still live.
 *   warm       inside the stage's patience, but past that first third.
 *   cold       past the threshold the stage sets. This is the one to act on.
 *
 * STAGES WITH NO CLOCK HAVE NO TEMPERATURE. Active, Dormant, Lost and
 * Disqualified are deliberately absent from STALE_DAYS_BY_STAGE — a won
 * account has nothing to chase, "gone quiet" IS what Dormant means, and the
 * two terminal stages are closed on purpose. Rather than invent a threshold
 * for them, this returns null and the caller draws nothing. A marker that
 * appears on every row everywhere would stop being a signal.
 */

export type Temperature = "unstarted" | "hot" | "warm" | "cold";

/** Fraction of a stage's patience that still counts as hot. A third: within
 * a day on a 3-day clock, within roughly two on a 5-day one. */
const HOT_FRACTION = 1 / 3;

const DAY_MS = 86_400_000;

export function temperatureOf(input: {
  /** crm_accounts.lifecycle_status, raw. Read through normalizeStage. */
  stage: string | null | undefined;
  /** Epoch ms of the last real human contact, or null for never. The shared
   * definition from lib/crm/lastContact.ts — not a second one. */
  lastContactMs: number | null;
  /** Server clock, in ms. Passed in rather than read, so a card renders the
   * same on the server and the client. */
  now: number;
}): Temperature | null {
  if (input.lastContactMs === null) return "unstarted";

  const threshold = STALE_DAYS_BY_STAGE[normalizeStage(input.stage)];
  if (threshold === undefined) return null;

  const days = (input.now - input.lastContactMs) / DAY_MS;
  if (days < 0) return "hot";
  if (days >= threshold) return "cold";
  return days <= threshold * HOT_FRACTION ? "hot" : "warm";
}

/**
 * The marker's classes. ONE small dot, the same everywhere.
 *
 * It reuses the CRM's existing semantic tokens (ok / warn / bad) rather than
 * introducing a palette of its own — Brent asked for it to stay quiet and
 * not become a third competing colour system alongside the stage tones and
 * the due-date tints. `unstarted` is a hollow ring in the muted tone: visibly
 * not a temperature at all, which is the point.
 */
export const TEMPERATURE_DOT: Record<Temperature, string> = {
  hot: "bg-ok",
  warm: "bg-warn",
  cold: "bg-bad",
  unstarted: "border border-fg-subtle bg-transparent",
};

/** What the marker means, for a title attribute and a screen reader. Says
 * why, not just what — "cold" alone is a colour, not information. */
export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  hot: "Spoken to recently",
  warm: "Getting on for a follow-up",
  cold: "Overdue a follow-up for this stage",
  unstarted: "Never contacted",
};
