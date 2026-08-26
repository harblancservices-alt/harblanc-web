import { LIFECYCLE_STAGES, normalizeStage, type LifecycleStage } from "../accounts/lifecycle";
import { lastContactStatus } from "../_shell/format";

/**
 * Workspace → Pipeline: the column shape and every pure derivation over it.
 *
 * A PLAIN module — no React, no DB — same contract as tasks/plan.ts,
 * agent/agentWork.ts and admin/tasks/taskBoard.ts.
 *
 * THE STAGES ARE NOT INVENTED HERE. Columns are exactly
 * accounts/lifecycle.ts's LIFECYCLE_STAGES, in its order, and every stored
 * value is read through its normalizeStage — so a legacy row written under an
 * older vocabulary lands in the right column instead of a seventh one, and a
 * future change to the funnel reaches this board for free.
 */

export type PipelineCard = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** crm_accounts.lifecycle_status, raw — bucketed via normalizeStage. */
  stage: string | null;
  /**
   * Epoch ms of the last real human contact, or null for never. The EXISTING
   * definition (later of last logged call and last CONTACT-kind activity),
   * lifted rather than re-derived — see pipeline-data.ts.
   */
  lastContactMs: number | null;
  /** Open crm_tasks on this company — "is anything already moving here". */
  openTasks: number;
};

export type PipelineColumn = {
  stage: LifecycleStage;
  cards: PipelineCard[];
};

/** The board's columns, always all six and always in funnel order — an empty
 * stage is information ("nothing is quoting") and it has to exist as a drop
 * target regardless. */
export function buildPipeline(cards: PipelineCard[]): PipelineColumn[] {
  const byStage = new Map<LifecycleStage, PipelineCard[]>();
  for (const stage of LIFECYCLE_STAGES) byStage.set(stage, []);
  for (const card of cards) byStage.get(normalizeStage(card.stage))!.push(card);

  for (const list of byStage.values()) sortColumn(list);
  return LIFECYCLE_STAGES.map((stage) => ({ stage, cards: byStage.get(stage)! }));
}

/**
 * Coldest first inside a column, then by name.
 *
 * The question a pipeline column answers is "which of these is going stale",
 * so the one nobody has touched longest sits at the top. Never-contacted
 * sorts as coldest rather than sinking as a missing value — same rule as
 * Admin → Companies and the agent dashboard's company list, so all three
 * order a book of business the same way.
 */
export function sortColumn(cards: PipelineCard[]): PipelineCard[] {
  cards.sort((a, b) => {
    const am = a.lastContactMs ?? -Infinity;
    const bm = b.lastContactMs ?? -Infinity;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name);
  });
  return cards;
}

/** What the card's activity line says — delegated whole to the Companies
 * list's helper so every surface describes the same company identically. */
export function cardActivity(card: PipelineCard, now: Date = new Date()) {
  return lastContactStatus(card.lastContactMs, now);
}

/** A drop that changes nothing is not worth a write — updateLifecycleStatus
 * would no-op anyway, but this saves the round trip and the refresh. */
export function isRealStageMove(card: PipelineCard, target: LifecycleStage): boolean {
  return normalizeStage(card.stage) !== target;
}

/** Is this a valid stage key off the wire? Guards the drop handler before it
 * calls the server. */
export function isStage(value: string): value is LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(value);
}
