"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { titleCaseWords, upperCaseState } from "../_shell/format";
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, type LifecycleStage } from "../accounts/lifecycle";
import { updateLifecycleStatus } from "../accounts/actions";
import {
  buildPipeline,
  cardActivity,
  isRealStageMove,
  isStage,
  type PipelineCard,
} from "./pipeline";

/**
 * Workspace → Pipeline — the agent's book of business as a funnel.
 *
 * One column per lifecycle stage, one card per company, drag a card to move
 * the company through the funnel. The stages are accounts/lifecycle.ts's six,
 * in its order — not a set invented here.
 *
 * THE WRITE IS THE EXISTING ONE. Dropping a card calls
 * accounts/actions.ts::updateLifecycleStatus, the same action the company
 * profile's stage tracker uses — so a stage change from this board logs the
 * same transition activity and fires the same stage-entry automation. There
 * is no second way to move a company through the funnel.
 *
 * WHAT A CARD SHOWS is what an agent needs to pick the next move and nothing
 * else: who they are, where they are, how long since anyone spoke to them,
 * and whether work is already in flight. Deliberately no stage pill on the
 * card — the column it is sitting in already says that.
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

  const byId = new Map(cards.map((c) => [c.id, c]));

  function move(companyId: string, target: LifecycleStage) {
    const card = byId.get(companyId);
    if (!card || !isRealStageMove(card, target)) return;
    setError(null);
    startTransition(async () => {
      const result = await updateLifecycleStatus(companyId, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
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

      {/* Sideways for the board, down inside each column — a long column must
          not stretch the page.

          TEN COLUMNS (2026-08-26). At the old fixed 17.5rem every column, ten
          stages want ~2900px, so the board became a long sideways scroll
          through mostly-empty columns to reach the far end of the funnel.

          EMPTY COLUMNS NOW COLLAPSE to a narrow labelled rail. They are NOT
          hidden — an empty column is information ("nothing is at Quoting")
          and, more importantly, it is a drop target you have to be able to
          aim at, which a hidden column is not. It still highlights and still
          accepts a drop; it just does not spend 280px saying "Nothing here."
          With a real book that typically halves the board's width. */}
      <div className="min-h-0 flex-1 overflow-x-auto pb-1">
        <div className="flex h-full min-h-[20rem] gap-3">
          {columns.map((col) => {
            const collapsed = col.cards.length === 0;
            return (
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
              className={`flex shrink-0 flex-col rounded-lg border transition-all ${
                collapsed ? "w-11" : "w-[16.5rem]"
              } ${
                over === col.stage
                  ? "border-accent bg-accent-bg"
                  : "border-line-strong bg-inset"
              }`}
            >
              {collapsed ? (
                // Vertical label so the stage stays readable at 44px. Still a
                // full-height drop target.
                <div className="flex min-h-0 flex-1 items-center justify-center py-3">
                  <span
                    className="whitespace-nowrap text-[11.5px] font-semibold text-fg-subtle"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                  >
                    {LIFECYCLE_LABEL[col.stage]}
                  </span>
                </div>
              ) : (
              <>
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${LIFECYCLE_TONE[col.stage]}`}
                >
                  {LIFECYCLE_LABEL[col.stage]}
                </span>
                <span className="text-[13px] font-bold text-fg">{col.cards.length}</span>
              </header>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
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
              </>
              )}
            </section>
            );
          })}
        </div>
      </div>

      <p className="text-[12px] text-fg-subtle">
        Drag a company to another column to move its stage · coldest sits at the top of each
        column · empty stages collapse to a rail and still accept a drop.
      </p>
    </div>
  );
}

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
  const activity = cardActivity(card, now);
  const place = [titleCaseWords(card.city), upperCaseState(card.state)].filter(Boolean).join(", ");

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-[5px] border border-line bg-card p-2.5 shadow-e1 transition-opacity active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <Link
        href={`/crm/accounts/${card.id}`}
        prefetch={false}
        draggable={false}
        className="block truncate text-[13px] font-bold text-fg hover:text-accent hover:underline"
      >
        {titleCaseWords(card.name)}
      </Link>
      {place && <p className="truncate text-[11.5px] text-fg-subtle">{place}</p>}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`text-[11.5px] font-bold ${
            activity.freshness === "fresh"
              ? "text-ok"
              : activity.freshness === "aging"
                ? "text-warn"
                : "text-bad"
          }`}
        >
          {activity.text}
        </span>
        {/* "Is anything already moving here" — the other half of deciding the
            next move. Silent at zero rather than showing a 0 badge. */}
        {card.openTasks > 0 && (
          <span className="text-[11.5px] text-fg-muted">
            {card.openTasks} open {card.openTasks === 1 ? "task" : "tasks"}
          </span>
        )}
      </div>

      {/* The non-drag path. Always present, never hover-revealed — dragging is
          unreliable on touch and impossible by keyboard. */}
      <select
        value=""
        disabled={pending}
        onChange={(e) => e.target.value && onPick(card.id, e.target.value as LifecycleStage)}
        aria-label={`Move ${card.name} to another stage`}
        className="mt-1.5 w-full rounded-[4px] border border-line bg-card px-1 py-0.5 text-[11px] font-semibold text-fg-muted disabled:opacity-60"
      >
        <option value="">Move to…</option>
        {(Object.keys(LIFECYCLE_LABEL) as LifecycleStage[]).map((s) => (
          <option key={s} value={s}>
            {LIFECYCLE_LABEL[s]}
          </option>
        ))}
      </select>
    </article>
  );
}
