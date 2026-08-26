import { LIFECYCLE_STAGES, normalizeStage, type LifecycleStage } from "../accounts/lifecycle";
import type { CompanyCardData } from "../_shell/companyCardModel";

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

/**
 * A pipeline card IS the shared company card (see _shell/companyCard.ts) —
 * the board and the agent dashboard show the same facts about a company, so
 * they share one type rather than two that drift.
 */
export type PipelineCard = CompanyCardData;

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
 * The board Brent chose (option B, 2026-08-26): a column for every stage that
 * HAS something, and one tile at the end naming the ones that do not.
 *
 * WHY, IN HIS DATA. Ten columns need volume spread across ten stages. He has
 * four companies, all at New Lead, so the old board drew one real column and
 * nine slivers of rotated vertical text across a mostly-dead screen. This
 * renders one column and a tile reading "+ 9 more stages".
 *
 * THE EMPTY STAGES ARE NAMED, NOT HIDDEN. They still exist, a company can
 * still be moved into one, and the tile lists them so that is obvious. What
 * they lose is a column each.
 *
 * Order is preserved on both sides — populated columns stay in funnel order,
 * and so do the names in the tile.
 */
export function splitPipeline(
  cards: PipelineCard[],
): { columns: PipelineColumn[]; emptyStages: LifecycleStage[] } {
  const all = buildPipeline(cards);
  return {
    columns: all.filter((c) => c.cards.length > 0),
    emptyStages: all.filter((c) => c.cards.length === 0).map((c) => c.stage),
  };
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
