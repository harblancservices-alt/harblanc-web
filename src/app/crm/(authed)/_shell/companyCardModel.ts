import { normalizeStage, stageLabel, type LifecycleStage } from "../accounts/lifecycle";

/**
 * The rich company card's shape and every pure derivation over it.
 *
 * A PLAIN module — no React, no DB — same contract as pipeline.ts,
 * agentWork.ts and taskBoard.ts.
 *
 * ONE CARD, TWO SURFACES (Brent, 2026-08-26): "needs to be a real profile
 * card that gives decent info." The pipeline board and the agent dashboard
 * both showed a name, a place and a freshness word; they now render the same
 * dense card from the same type, so the two can never drift into showing
 * different facts about the same company.
 *
 * EMPTY CASES ARE WRITTEN, NOT BLANK. A company with no contact on file is
 * the single most common state in this book, and a blank line says nothing
 * about whether that is a data gap or a rendering bug. Every absence here has
 * words — see the *Label helpers below.
 */

export type CompanyCardData = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** crm_accounts.source, raw. Provenance only — never control flow. */
  source: string | null;
  /** crm_accounts.lifecycle_status, raw — read through lifecycle.ts. */
  stage: string | null;
  /**
   * crm_accounts.stage_changed_at as epoch ms, or null when unknown.
   *
   * NULL IS EXPECTED AND MEANS "we don't know", not "zero days". The column
   * was added 2026-08-26 and deliberately not backfilled — inventing a date
   * from updated_at would have produced a confident wrong number on every
   * pre-existing company.
   */
  stageChangedMs: number | null;
  /**
   * crm_accounts.stage_loss_reason — WHY a Lost or Disqualified company died.
   *
   * Added 2026-08-31. The column has existed since 26 Aug and was READ BY
   * NOTHING: an agent typed a reason into the stage dialog, the action saved
   * it correctly, and no surface in the app ever showed it back. Brent could
   * not see why one single deal had been lost.
   *
   * Null on every non-terminal stage by design — updateLifecycleStatus
   * clears it on the way out, because a company that came back from Lost
   * must not keep the reason it was lost for.
   */
  lossReason?: string | null;
  /** Epoch ms of the last real human contact, or null for never. The shared
   * definition from lib/crm/lastContact.ts, not a second one. */
  lastContactMs: number | null;
  /** The person to call, if there is one. */
  contactName: string | null;
  contactTitle: string | null;
  contactPhone: string | null;
  /** Open crm_tasks on this company. */
  openTasks: number;
  /** crm_accounts.created_at as epoch ms. Optional: only the surfaces that
   * order by "newest first" need it. */
  createdMs?: number | null;
};

/**
 * How long this company has sat where it is, in whole days.
 *
 * Returns null when stage_changed_at is unknown — the caller renders that as
 * "stage age unknown" rather than as 0, because a company that has never
 * moved and a company we have no record for are different things and only one
 * of them is a reason to act.
 */
export function daysInStage(card: Pick<CompanyCardData, "stageChangedMs">, now: number): number | null {
  if (card.stageChangedMs === null) return null;
  const elapsed = now - card.stageChangedMs;
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  return Math.floor(elapsed / 86_400_000);
}

/** "New Lead · 12 days" / "New Lead · today" / "New Lead" when unknown. */
export function stageWithAgeLabel(card: CompanyCardData, now: number): string {
  const label = stageLabel(card.stage);
  const days = daysInStage(card, now);
  if (days === null) return label;
  if (days === 0) return `${label} · today`;
  return `${label} · ${days} ${days === 1 ? "day" : "days"}`;
}

export function cardStage(card: CompanyCardData): LifecycleStage {
  return normalizeStage(card.stage);
}


/**
 * The person to call, as one line: "Dave Mena · Ops Manager".
 *
 * Returns null when there is nobody, so the caller can say something true
 * instead of rendering an empty row.
 */
export function contactLine(card: CompanyCardData): string | null {
  const name = (card.contactName ?? "").trim();
  if (!name) return null;
  const title = (card.contactTitle ?? "").trim();
  return title ? `${name} · ${title}` : name;
}

/**
 * What to say when there is no contact at all.
 *
 * Brent's rule: "Nobody to call there yet" beats a blank line. It also
 * happens to be the exact completeness gap the dashboard already nags about,
 * so the card and that list agree about what is missing.
 */
export const NO_CONTACT_LABEL = "Nobody to call there yet";

/** What to say when there IS a contact but no number for them. */
export const NO_PHONE_LABEL = "No number on file";

/** What to say when nobody has ever made contact. Distinct from "a long time
 * ago", which is what a stale date means — never is not old, it is unstarted. */
export const NEVER_CONTACTED_LABEL = "Never contacted";
