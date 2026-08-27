"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompanyCard as SharedCompanyCard } from "../_shell/CompanyCard";
import {
  LIFECYCLE_LABEL,
  LIFECYCLE_STAGES,
  LIFECYCLE_TONE,
  stageNeedsReason,
  type LifecycleStage,
} from "../accounts/lifecycle";
import { updateLifecycleStatus } from "../accounts/actions";
import { StageReasonDialog } from "../accounts/StageReasonDialog";
import { buildPipeline, isRealStageMove, isStage, type PipelineCard } from "./pipeline";

/**
 * Workspace → Pipeline — the agent's book of business as a funnel.
 *
 * ALL TEN STAGES, IN LINE (Brent, 2026-08-26: "show the stages in line").
 *
 * Every stage gets a real column, always, left to right in funnel order, with
 * a horizontal readable label and its count — including zero. An empty stage
 * is a normal empty column, not a rail and not a footnote.
 *
 * THIS REPLACED TWO EARLIER ATTEMPTS, and the reason is worth keeping:
 *
 *   - The first drew ten fixed columns and COLLAPSED the empty ones to 44px
 *     rails with `writingMode: vertical-rl`. Nine slivers of rotated text.
 *   - The second (option B) rendered only the populated stages and put the
 *     rest behind a "+ 9 more stages" tile. Readable, but you could not drag
 *     into a stage that was not on screen, and the funnel stopped looking
 *     like a funnel.
 *
 * ROTATED TEXT IS NOW IMPOSSIBLE, not merely avoided: nothing in this file
 * sets a writing mode, and the columns are `shrink-0`, so they cannot be
 * squeezed to the width that made rotation seem necessary. When ten columns
 * do not fit, the ROW SCROLLS — a readable row you scroll beats ten
 * unreadable slivers.
 *
 * COLUMN WIDTH IS A MEASURED CHOICE, not a guess — and the first guess was
 * wrong. 14rem columns came to 2312px against a scroller measured at 2276px
 * on Brent's screen: a 36px overflow, which is the worst possible amount. It
 * buys nothing and costs a scrollbar plus a clipped last column.
 *
 * 13.5rem × 10 + nine 8px gaps = 2232px, which fits his 2276px with room to
 * spare. Losing 8px a column to fit all ten on screen is a good trade;
 * shrinking them far enough to need rotated labels would not be, which is
 * where the line sits. On anything narrower the row scrolls, and that is
 * fine — a readable row you scroll beats ten unreadable slivers.
 *
 * THE WRITE IS THE EXISTING ONE. Moving a card calls
 * accounts/actions.ts::updateLifecycleStatus, the same action the company
 * profile's stage buttons use — same transition activity, same stage-entry
 * automation, same stage_changed_at stamp. There is no second way to move a
 * company through the funnel.
 *
 * WHAT A CARD SHOWS is the shared rich card (_shell/CompanyCard.tsx), the
 * same one the agent dashboard draws.
 */
export function PipelineBoard({
  cards,
  restricted,
  now,
}: {
  cards: PipelineCard[];
  restricted: boolean;
  /** Server clock — one instant for every "last activity" label. */
  now: number;
}) {
  const router = useRouter();
  const at = new Date(now);
  const columns = buildPipeline(cards);

  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LifecycleStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** A move waiting on a loss reason. Nothing is written until it resolves. */
  const [needReason, setNeedReason] = useState<{ companyId: string; stage: LifecycleStage } | null>(null);

  const byId = new Map(cards.map((c) => [c.id, c]));

  function commit(companyId: string, target: LifecycleStage, reason?: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateLifecycleStatus(companyId, target, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNeedReason(null);
      router.refresh();
    });
  }

  /**
   * Every move goes through here — a drop and a pick from the card's own
   * control alike.
   *
   * THE REASON GATE LIVES HERE, not only on the profile. Lost and
   * Disqualified refuse to be set without a reason (see
   * updateLifecycleStatus), so before this gate a drag onto Lost failed
   * server-side with an error banner and no way to satisfy it. Now it opens
   * the same dialog the profile uses.
   */
  function move(companyId: string, target: LifecycleStage) {
    const card = byId.get(companyId);
    if (!card || !isRealStageMove(card, target)) return;
    setError(null);
    if (stageNeedsReason(target)) {
      setNeedReason({ companyId, stage: target });
      return;
    }
    commit(companyId, target);
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-line-strong bg-card px-4 py-12 text-center">
        <p className="text-[13.5px] font-semibold text-fg">
          {restricted ? "Nothing assigned to you yet" : "No companies yet"}
        </p>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          {restricted
            ? "This board only shows companies you own. An admin assigns them from Admin → Companies."
            : "Companies come in through the BOL and prospect workflow."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-[19px] font-bold tracking-tight text-fg">Pipeline</h1>
          <p className="text-[13px] text-fg-muted">
            {restricted ? "your companies, by stage" : "every company, by stage"}
          </p>
        </div>
        <p className="text-[12.5px] text-fg-muted">
          {cards.length} {cards.length === 1 ? "company" : "companies"}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] font-semibold text-bad">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-x-auto pb-1">
        <div className="flex h-full min-h-[20rem] items-stretch gap-2">
          {columns.map((col) => (
            <section
              key={col.stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.stage);
              }}
              onDragLeave={() => setOver((s) => (s === col.stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                setDragging(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id && isStage(col.stage)) move(id, col.stage);
              }}
              aria-label={`${LIFECYCLE_LABEL[col.stage]}, ${col.cards.length} companies`}
              className={`flex w-[13.5rem] shrink-0 flex-col rounded-lg border transition-colors ${
                over === col.stage ? "border-accent bg-accent-bg" : "border-line-strong bg-inset"
              }`}
            >
              {/* Horizontal label, always. `truncate` rather than any kind of
                  rotation or wrapping — a clipped name still reads left to
                  right, and the column has a title attribute for the full
                  one. The count shows at zero too: "nothing is Quoting" is
                  information. */}
              <header className="flex items-center gap-1.5 px-2.5 py-2.5">
                <span
                  title={LIFECYCLE_LABEL[col.stage]}
                  className={`min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${LIFECYCLE_TONE[col.stage]}`}
                >
                  {LIFECYCLE_LABEL[col.stage]}
                </span>
                <span
                  className={`ml-auto shrink-0 text-[13px] font-bold ${
                    col.cards.length === 0 ? "text-fg-subtle" : "text-fg"
                  }`}
                >
                  {col.cards.length}
                </span>
              </header>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {/* A quiet empty state, not a shout. The column still accepts
                    a drop — which is the thing option B could not do. */}
                {col.cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-[11.5px] text-fg-subtle">
                    Drop here
                  </p>
                )}
                {col.cards.map((card) => (
                  <CompanyCard
                    key={card.id}
                    card={card}
                    now={at}
                    pending={pending}
                    isDragging={dragging === card.id}
                    onDragStart={setDragging}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onPick={move}
                  />
                ))}
              </div>
            </section>
          ))}

        </div>
      </div>

      <p className="text-[12px] text-fg-subtle">
        Drag a company to another column to move its stage · coldest sits at the top of each
        column · use a card&rsquo;s Move control if you would rather not drag.
      </p>

      <StageReasonDialog
        stage={needReason?.stage ?? null}
        pending={pending}
        error={error}
        onCancel={() => setNeedReason(null)}
        onConfirm={(reason) => {
          if (needReason) commit(needReason.companyId, needReason.stage, reason);
        }}
      />
    </div>
  );
}

/**
 * A card on the board: the shared rich card, plus the drag affordance and a
 * compact stage control.
 *
 * THE CONTROL IS SMALL AND RIGHT-ALIGNED, not a full-width select under every
 * card (Brent, 2026-08-26: the clumsiest part of the old board). It was a
 * 100%-wide bordered dropdown repeated on every card, as visually heavy as
 * the card content itself and costing a card's worth of height per column.
 *
 * IT IS STILL A NATIVE <select>. Styled down to a small button, but native —
 * which buys keyboard operation, the platform picker on touch, and screen
 * reader semantics for free. Hand-rolling a menu would have meant
 * re-implementing all three, and this control exists precisely for the people
 * drag-and-drop fails.
 *
 * IT LISTS ALL TEN STAGES, always — including the ones with no column. That
 * is the whole cost of option B: if a stage is not rendered you cannot drag
 * to it, so without this Lost and Disqualified would be unreachable from
 * this board.
 *
 * It sits OUTSIDE the card's link, as a sibling: a <select> inside an <a> is
 * invalid HTML and behaves like a trap.
 */
function CompanyCard({
  card,
  now,
  pending,
  isDragging,
  onDragStart,
  onDragEnd,
  onPick,
}: {
  card: PipelineCard;
  now: Date;
  pending: boolean;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPick: (companyId: string, stage: LifecycleStage) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab transition-opacity active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <SharedCompanyCard card={card} now={now.getTime()} compact hideStage />

      <div className="mt-1 flex justify-end">
        <select
          value=""
          disabled={pending}
          onChange={(e) => e.target.value && onPick(card.id, e.target.value as LifecycleStage)}
          aria-label={`Move ${card.name} to another stage`}
          className="cursor-pointer appearance-none rounded-[4px] border border-line bg-card px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle hover:border-accent hover:text-accent disabled:opacity-60"
        >
          <option value="">Move ⌄</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {LIFECYCLE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
